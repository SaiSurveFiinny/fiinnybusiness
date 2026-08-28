import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/legacy.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../data/shared_cart_repository.dart';
import '../models/cart_model.dart';
import '../models/user_model.dart';
import '../utils/weight_utils.dart';
import 'user_provider.dart';

class CartNotifier extends StateNotifier<List<CartItemModel>> {
  CartNotifier() : super([]) {
    _initialLoad = _load();
  }

  static const _key = 'cart_items';
  final _sharedCartRepo = SharedCartRepository();

  /// Completes once the on-device guest cart has been read into [state].
  /// [onSignedIn] awaits this before treating [state] as "the guest cart" to
  /// merge — without it, a sign-in detected before this finishes would merge
  /// against an empty `state` and then have [_load]'s completion silently
  /// clobber the just-merged result right after.
  late final Future<void> _initialLoad;

  /// The signed-in user's phone once [onAuthChanged] has synced their cart
  /// from `carts/{phone}`; null means the current cart is a GUEST cart,
  /// persisted only to on-device SharedPreferences — mirrors web's split
  /// between localStorage (guest) and Firestore (signed in) exactly.
  String? _signedInPhone;
  Timer? _saveDebounce;

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final json = prefs.getString(_key);
    if (json != null && json.isNotEmpty) {
      try {
        state = CartItemModel.listFromJson(json);
      } catch (_) {
        state = [];
      }
    }
  }

  /// Called once per sign-in (see `cartProvider`'s `ref.listen` below), never
  /// re-entered for the same phone. Loads the user's Firestore cart, merges
  /// it with whatever guest cart is currently in [state], persists the
  /// result back to `carts/{phone}`, and clears the on-device guest cart —
  /// mirrors web's exact login-time merge in app/page.tsx.
  Future<void> onSignedIn(String phone) async {
    if (phone.isEmpty || _signedInPhone == phone) return;
    _signedInPhone = phone;

    await _initialLoad;
    final guestItems = state;
    final remoteItems = await _sharedCartRepo.loadAndReconstruct(phone);
    final merged = remoteItems.isEmpty
        ? guestItems
        : _sharedCartRepo.mergeCartItems(guestItems, remoteItems);

    state = merged;

    if (merged.isNotEmpty || remoteItems.isNotEmpty) {
      await _sharedCartRepo.saveCart(phone, merged);
    }

    // Guest cart is now folded into the Firestore cart — clear it so a later
    // sign-out doesn't resurrect these items as a stale "guest" cart.
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_key);
  }

  /// Called on sign-out. The in-memory cart is left as-is (still usable while
  /// browsing signed out) but future saves go back to on-device storage —
  /// this account's Firestore cart is no longer written to.
  void onSignedOut() {
    _signedInPhone = null;
  }

  Future<void> _save() async {
    final phone = _signedInPhone;
    if (phone != null) {
      // Debounced: a rapid string of quantity taps would otherwise fire one
      // Firestore write per tap.
      _saveDebounce?.cancel();
      _saveDebounce = Timer(const Duration(milliseconds: 500), () {
        // Best-effort, same as the SharedPreferences path below never
        // surfacing a disk-write failure to the UI — a dropped save here
        // just means the NEXT mutation's debounce retries with current state.
        _sharedCartRepo.saveCart(phone, state).catchError((_) {});
      });
      return;
    }
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, CartItemModel.listToJson(state));
  }

  @override
  void dispose() {
    _saveDebounce?.cancel();
    super.dispose();
  }

  void addItem(CartItemModel item) {
    // If same listing already in cart, increment quantity
    final idx = state.indexWhere(
      (e) => e.listingId == item.listingId && e.variantLabel == item.variantLabel,
    );
    if (idx >= 0) {
      final updated = List<CartItemModel>.from(state);
      updated[idx] = updated[idx].copyWith(quantity: updated[idx].quantity + item.quantity);
      state = updated;
    } else {
      state = [...state, item];
    }
    _save();
  }

  void removeItem(String listingId, String? variantLabel) {
    state = state
        .where((e) => !(e.listingId == listingId && e.variantLabel == variantLabel))
        .toList();
    _save();
  }

  void updateQuantity(String listingId, String? variantLabel, int qty) {
    if (qty <= 0) {
      removeItem(listingId, variantLabel);
      return;
    }
    state = state.map((e) {
      if (e.listingId == listingId && e.variantLabel == variantLabel) {
        return e.copyWith(quantity: qty);
      }
      return e;
    }).toList();
    _save();
  }

  /// Re-points a cart line to a different store, applying that store's price and
  /// discount. If the target store is already a separate line for the same
  /// product + variant, the two lines are merged (quantities summed) so we never
  /// end up with two lines for the same listing.
  void updateStore(
    CartItemModel item, {
    required String listingId,
    required String sellerPhone,
    required String sellerName,
    required double price,
    required double originalPrice,
    required double discountPct,
  }) {
    final updated = item.copyWith(
      listingId: listingId,
      sellerPhone: sellerPhone,
      sellerName: sellerName,
      price: price,
      originalPrice: originalPrice,
      discountPct: discountPct,
    );
    final result = <CartItemModel>[];
    for (final e in state) {
      final isTarget =
          e.listingId == item.listingId && e.variantLabel == item.variantLabel;
      final candidate = isTarget ? updated : e;
      final existing = result.indexWhere((r) =>
          r.listingId == candidate.listingId &&
          r.variantLabel == candidate.variantLabel);
      if (existing >= 0) {
        result[existing] = result[existing]
            .copyWith(quantity: result[existing].quantity + candidate.quantity);
      } else {
        result.add(candidate);
      }
    }
    state = result;
    _save();
  }

  void clear() {
    state = [];
    _save();
  }
}

final cartProvider =
    StateNotifierProvider<CartNotifier, List<CartItemModel>>((ref) {
  final notifier = CartNotifier();

  // Fold the current user's Firestore cart in on sign-in (and handle the case
  // where the app opens already signed in — ref.listen alone only fires on
  // SUBSEQUENT changes, not the value present at provider creation).
  void handle(UserModel? user) {
    final phone = user?.phone;
    if (phone != null && phone.isNotEmpty) {
      notifier.onSignedIn(phone);
    } else {
      notifier.onSignedOut();
    }
  }

  handle(ref.read(currentUserProvider).value);
  ref.listen<AsyncValue<UserModel?>>(currentUserProvider, (previous, next) {
    handle(next.value);
  });

  return notifier;
});

final cartCountProvider = Provider<int>((ref) {
  return ref.watch(cartProvider).fold(0, (sum, item) => sum + item.quantity);
});

final cartTotalProvider = Provider<double>((ref) {
  return ref.watch(cartProvider).fold(0.0, (sum, item) => sum + item.lineTotal);
});

/// Total money saved across the cart from store discounts (sum of line savings).
final cartSavingsProvider = Provider<double>((ref) {
  return ref.watch(cartProvider).fold(0.0, (sum, item) => sum + item.lineSavings);
});

/// Total GST across the cart.
final cartGstProvider = Provider<double>((ref) {
  return ref.watch(cartProvider).fold(0.0, (sum, item) => sum + item.lineGst);
});

// ── Delivery charge estimation ────────────────────────────────────────────────

/// Weight slab from `deliverySettings/{sellerPhone}`.
class WeightSlab {
  final double minKg;
  final double maxKg;
  final double charge;
  const WeightSlab({required this.minKg, required this.maxKg, required this.charge});

  factory WeightSlab.fromMap(Map<String, dynamic> m) => WeightSlab(
        minKg: (m['minKg'] as num).toDouble(),
        maxKg: (m['maxKg'] as num).toDouble(),
        charge: (m['charge'] as num).toDouble(),
      );
}

/// Delivery estimate result per seller.
class DeliveryEstimate {
  final Map<String, double> bySellerCharge;
  final Map<String, double> bySellerWeight;
  final double totalCharge;
  final double totalWeight;

  const DeliveryEstimate({
    this.bySellerCharge = const {},
    this.bySellerWeight = const {},
    this.totalCharge = 0,
    this.totalWeight = 0,
  });
}

final _phoneRegex = RegExp(r'^(\+91)?[6-9]\d{9}$');

/// `deliverySettings` docs are keyed by phone, but some legacy retailer copies
/// only carry the seller's Firebase UID in the phone-ish fields (see the
/// "UIDs leak into sellerPhone on some legacy docs" note in product_detail_
/// screen.dart). If [candidate] isn't already a valid phone, resolve it via
/// `uidIndex/{uid}.phone` — mirrors the web's `useDeliveryEstimates` 3-tier
/// lookup (stored phone → uidIndex → treat-as-phone), which is why the web
/// charges delivery for sellers whose mobile-side sellerPhone lookup was
/// silently coming up empty.
Future<String?> _resolveSellerPhone(String candidate) async {
  final cleaned = candidate.replaceAll(RegExp(r'\s'), '');
  if (_phoneRegex.hasMatch(cleaned)) return cleaned;
  if (candidate.isEmpty) return null;

  try {
    final idxSnap = await FirebaseFirestore.instance
        .collection('uidIndex')
        .doc(candidate)
        .get();
    final phone = idxSnap.data()?['phone'] as String?;
    if (phone != null && phone.isNotEmpty) return phone;
  } catch (_) {}

  return null;
}

/// Async provider that computes delivery charges from Firestore `deliverySettings`.
/// Mirrors the web app's `useDeliveryEstimator` hook.
final deliveryChargeProvider = FutureProvider<DeliveryEstimate>((ref) async {
  final items = ref.watch(cartProvider);
  if (items.isEmpty) return const DeliveryEstimate();

  // Group by seller phone
  final groups = <String, List<CartItemModel>>{};
  for (final item in items) {
    groups.putIfAbsent(item.sellerPhone, () => []).add(item);
  }

  final db = FirebaseFirestore.instance;
  final charges = <String, double>{};
  final weights = <String, double>{};

  for (final entry in groups.entries) {
    final sellerKey = entry.key;
    final sellerItems = entry.value;

    // Compute total weight for this seller
    double weightKg = 0;
    for (final item in sellerItems) {
      weightKg += item.quantity * parseVariantWeightKg(item.variantLabel);
    }
    weightKg = double.parse(weightKg.toStringAsFixed(3));
    weights[sellerKey] = weightKg;

    debugPrint('[DeliveryEstimate] seller: $sellerKey | weightKg: $weightKg | '
        'items: ${sellerItems.map((i) => '${i.catalogName}×${i.quantity} variantLabel="${i.variantLabel}"').join(', ')}');

    if (weightKg == 0) {
      debugPrint('[DeliveryEstimate] weight=0, no delivery charge applied');
      charges[sellerKey] = 0;
      continue;
    }

    // Resolve the actual deliverySettings doc ID — sellerKey may be a UID on
    // legacy retailer copies rather than the phone deliverySettings is keyed by.
    final phone = await _resolveSellerPhone(sellerKey);
    debugPrint('[DeliveryEstimate] resolved phone for $sellerKey → $phone');
    if (phone == null) {
      debugPrint('[DeliveryEstimate] could not resolve phone for seller: $sellerKey');
      charges[sellerKey] = 0;
      continue;
    }

    try {
      final settingsSnap =
          await db.collection('deliverySettings').doc(phone).get();
      debugPrint('[DeliveryEstimate] deliverySettings doc exists: '
          '${settingsSnap.exists} for phone: $phone');
      if (!settingsSnap.exists) {
        charges[sellerKey] = 0;
        continue;
      }

      final data = settingsSnap.data()!;
      final slabsList = data['weightSlabs'] as List<dynamic>?;
      debugPrint('[DeliveryEstimate] slabs: $slabsList');
      if (slabsList == null || slabsList.isEmpty) {
        charges[sellerKey] = 0;
        continue;
      }

      final slabs = slabsList
          .map((s) => WeightSlab.fromMap(s as Map<String, dynamic>))
          .toList()
        ..sort((a, b) => a.minKg.compareTo(b.minKg));

      double charge = 0;
      for (final slab in slabs) {
        if (weightKg >= slab.minKg && weightKg < slab.maxKg) {
          charge = slab.charge;
          debugPrint('[DeliveryEstimate] matched slab: '
              '${slab.minKg}-${slab.maxKg} → charge: $charge');
          break;
        }
      }
      // Open-ended last slab fallback
      if (charge == 0 && slabs.isNotEmpty) {
        final last = slabs.last;
        if (weightKg >= last.minKg) {
          charge = last.charge;
          debugPrint('[DeliveryEstimate] last-slab fallback → charge: $charge');
        }
      }
      if (charge == 0) {
        debugPrint('[DeliveryEstimate] no slab matched weightKg=$weightKg, slabs=$slabs');
      }
      charges[sellerKey] = charge;
    } catch (e) {
      debugPrint('[DeliveryEstimate] fetch error: $e');
      charges[sellerKey] = 0;
    }
  }

  debugPrint('[DeliveryEstimate] final charges: $charges | weights: $weights');

  final totalCharge = charges.values.fold(0.0, (s, v) => s + v);
  final totalWeight = weights.values.fold(0.0, (s, v) => s + v);

  return DeliveryEstimate(
    bySellerCharge: charges,
    bySellerWeight: weights,
    totalCharge: totalCharge,
    totalWeight: totalWeight,
  );
});
