import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../constants/app_config.dart';
import '../models/catalog_model.dart';

/// "₹532 delivered · by Sat, 21 Nov" — the app side of the delivered price
/// (docs/delivered-price-architecture.md §4.4). A DELIBERATE MIRROR of the
/// website's app/lib/delivered-price-client.ts; the server
/// (POST /api/delivery/offers) prices each offer exactly like checkout.
///
///   - Offers from every card being built go in ONE request every 300 ms
///     (at most 60). A grid builds only the cards near the screen, so only
///     those are priced.
///   - Answers are kept 30 minutes on the phone (memory + shared_preferences),
///     keyed by the pincode and everything that changes the price: reopening
///     the app or scrolling back costs no request.
///   - "pending" (couriers still answering a new route) is asked again after
///     3 s, up to 3 times; then the card simply shows no line.

class DeliveredOffer {
  final String id;
  final String sellerKey;
  final String size;
  final double price;
  final bool gstApplicable;
  final double gstRate;
  final bool gstIncluded;
  final double extraDeliveryCharge;
  final bool productFree;
  final double productPct;
  final String manufacturerPhone;

  const DeliveredOffer({
    required this.id,
    required this.sellerKey,
    required this.size,
    required this.price,
    this.gstApplicable = false,
    this.gstRate = 0,
    this.gstIncluded = true,
    this.extraDeliveryCharge = 0,
    this.productFree = false,
    this.productPct = 0,
    this.manufacturerPhone = '',
  });

  Map<String, Object> toJson() => {
        'id': id,
        'sellerKey': sellerKey,
        'size': size,
        'price': price,
        'gstApplicable': gstApplicable,
        'gstRate': gstRate,
        'gstIncluded': gstIncluded,
        'extraDeliveryCharge': extraDeliveryCharge,
        'productFree': productFree,
        'productPct': productPct,
        'manufacturerPhone': manufacturerPhone,
      };
}

class DeliveredResult {
  final String id;
  final String status; // ok | pending | unavailable
  final String? mode; // courier | seller
  final double? itemTotal;
  final double? deliveryCharge;
  final bool free;
  final String? campaign;
  final double? total;
  final String? deliveryBy;

  const DeliveredResult({
    required this.id,
    required this.status,
    this.mode,
    this.itemTotal,
    this.deliveryCharge,
    this.free = false,
    this.campaign,
    this.total,
    this.deliveryBy,
  });

  bool get ok => status == 'ok' && total != null;

  factory DeliveredResult.fromJson(Map<String, dynamic> m) => DeliveredResult(
        id: (m['id'] ?? '').toString(),
        status: (m['status'] ?? '').toString(),
        mode: m['mode']?.toString(),
        itemTotal: (m['itemTotal'] as num?)?.toDouble(),
        deliveryCharge: (m['deliveryCharge'] as num?)?.toDouble(),
        free: m['free'] == true,
        campaign: m['campaign']?.toString(),
        total: (m['total'] as num?)?.toDouble(),
        deliveryBy: m['deliveryBy']?.toString(),
      );

  Map<String, Object?> toJson() => {
        'id': id,
        'status': status,
        'mode': mode,
        'itemTotal': itemTotal,
        'deliveryCharge': deliveryCharge,
        'free': free,
        'campaign': campaign,
        'total': total,
        'deliveryBy': deliveryBy,
      };
}

double _r2(double n) => (n * 100).roundToDouble() / 100;
String _tail10(String? v) {
  final d = (v ?? '').replaceAll(RegExp(r'\D'), '');
  return d.length > 10 ? d.substring(d.length - 10) : d;
}

String _num(double v) => v == v.roundToDouble() ? v.toInt().toString() : v.toString();

/// One pack of [size] from seller [a] of product [p], at [price] (after the
/// seller's discount). Everything that changes the answer is in the id.
DeliveredOffer? offerFor(CatalogModel p, AvailabilityEntry a, String size, double price) {
  final sellerKey = (a.storePhone?.isNotEmpty == true ? a.storePhone! : a.storeId).trim();
  if (sellerKey.isEmpty || price <= 0) return null;
  final gstApplicable = a.gstApplicable ?? p.gstApplicable ?? false;
  final gstRate = a.gstRate ?? p.gstRate ?? 0;
  final gstIncluded = a.gstIncluded ?? p.gstIncluded;
  final extra = a.extraDeliveryCharge ?? 0;
  final free = a.freeDelivery ?? false;
  final pct = a.sellerDeliveryPct ?? 0;
  final pr = _r2(price);
  final id = [
    p.id, sellerKey, size, _num(pr), gstApplicable ? _num(gstRate) : '-', gstIncluded ? 'i' : 'x',
    _num(extra), free ? 'F' : _num(pct),
  ].join('|');
  return DeliveredOffer(
    id: id,
    sellerKey: sellerKey,
    size: size,
    price: pr,
    gstApplicable: gstApplicable,
    gstRate: gstRate,
    gstIncluded: gstIncluded,
    extraDeliveryCharge: extra,
    productFree: free,
    productPct: pct,
    manufacturerPhone: p.manufacturerPhone ?? '',
  );
}

bool _sellsOnline(AvailabilityEntry a) =>
    a.isOnline != false && !(a.stockLevel ?? '').toLowerCase().contains('out');

/// A card's offers: the base pack from its 3 cheapest online sellers. A
/// store's own page passes [onlySeller] to price just that store.
List<DeliveredOffer> cardOffers(CatalogModel p, {int perCard = 3, String? onlySeller}) {
  if (p.sellMode == 'offline_store_only') return const [];
  final size = (p.unit?.isNotEmpty == true ? p.unit! : (p.variants?.isNotEmpty == true ? p.variants!.first.label : ''));
  final only = onlySeller == null ? '' : _tail10(onlySeller);
  final list = (p.availability ?? const <AvailabilityEntry>[])
      .where(_sellsOnline)
      .where((a) => only.isEmpty || _tail10(a.storePhone ?? a.storeId) == only)
      .map((a) {
        final pct = a.discountPct > 0 ? (a.discountPct > 99 ? 99 : a.discountPct) : 0;
        return (a: a, price: a.sellingPrice * (1 - pct / 100));
      })
      .where((x) => x.price > 0)
      .toList()
    ..sort((x, y) => x.price.compareTo(y.price));
  return list
      .take(perCard)
      .map((x) => offerFor(p, x.a, size, x.price))
      .whereType<DeliveredOffer>()
      .toList();
}

/// Cheapest delivered first; an earlier date breaks ties; unknown last.
/// Stable: rows with no price keep their order (distance).
List<T> rankDelivered<T>(List<T> rows, DeliveredResult? Function(T) resultOf) {
  double score(DeliveredResult? r) => (r != null && r.ok) ? r.total! : double.infinity;
  final indexed = rows.asMap().entries.toList();
  indexed.sort((a, b) {
    final ra = resultOf(a.value), rb = resultOf(b.value);
    final c = score(ra).compareTo(score(rb));
    if (c != 0) return c;
    final d = (ra?.deliveryBy ?? '9999').compareTo(rb?.deliveryBy ?? '9999');
    return d != 0 ? d : a.key.compareTo(b.key);
  });
  return indexed.map((e) => e.value).toList();
}

class _Waiter {
  final String pin;
  final DeliveredOffer offer;
  final int tries;
  const _Waiter(this.pin, this.offer, this.tries);
}

/// Batches, caches and retries requests to POST /api/delivery/offers.
class DeliveredPriceService {
  DeliveredPriceService._();
  static final instance = DeliveredPriceService._();

  static const _ttl = Duration(minutes: 30);
  static const _prefKey = 'kd_delivered_v1';
  static const _maxStored = 600;
  static const _maxBatch = 60;

  final Map<String, ({int at, DeliveredResult r})> _mem = {};
  final Map<String, List<Completer<DeliveredResult?>>> _waiting = {};
  final List<_Waiter> _queue = [];
  Timer? _timer;
  Timer? _saveTimer;
  Future<void>? _loading;

  String _key(String pin, DeliveredOffer o) => '$pin|${o.id}';

  Future<void> _load() => _loading ??= () async {
        try {
          final raw = (await SharedPreferences.getInstance()).getString(_prefKey);
          if (raw == null) return;
          final now = DateTime.now().millisecondsSinceEpoch;
          (jsonDecode(raw) as Map<String, dynamic>).forEach((k, v) {
            final at = (v['at'] as num?)?.toInt() ?? 0;
            if (now - at < _ttl.inMilliseconds) {
              _mem[k] = (at: at, r: DeliveredResult.fromJson(Map<String, dynamic>.from(v['r'] as Map)));
            }
          });
        } catch (_) {/* nothing stored */}
      }();

  void _persistSoon() {
    _saveTimer ??= Timer(const Duration(seconds: 1), () async {
      _saveTimer = null;
      try {
        final now = DateTime.now().millisecondsSinceEpoch;
        final fresh = _mem.entries.where((e) => now - e.value.at < _ttl.inMilliseconds).toList();
        final keep = fresh.length > _maxStored ? fresh.sublist(fresh.length - _maxStored) : fresh;
        await (await SharedPreferences.getInstance()).setString(
          _prefKey,
          jsonEncode({for (final e in keep) e.key: {'at': e.value.at, 'r': e.value.r.toJson()}}),
        );
      } catch (_) {/* memory only */}
    });
  }

  /// The answer already on the phone, or null (call [load] once first).
  DeliveredResult? cached(String pin, DeliveredOffer o) {
    final c = _mem[_key(pin, o)];
    if (c == null) return null;
    return DateTime.now().millisecondsSinceEpoch - c.at < _ttl.inMilliseconds ? c.r : null;
  }

  Future<void> load() => _load();

  /// The delivered price of one offer at [pin] (null: unknown for now).
  Future<DeliveredResult?> get(String pin, DeliveredOffer o) async {
    await _load();
    final hit = cached(pin, o);
    if (hit != null) return hit;
    final key = _key(pin, o);
    final c = Completer<DeliveredResult?>();
    final list = _waiting[key];
    if (list != null) {
      list.add(c);
      return c.future;
    }
    _waiting[key] = [c];
    _queue.add(_Waiter(pin, o, 0));
    _schedule(_queue.length >= _maxBatch ? Duration.zero : const Duration(milliseconds: 300));
    return c.future;
  }

  void _schedule(Duration d) {
    _timer ??= Timer(d, () {
      _timer = null;
      unawaited(_flush());
    });
  }

  void _finish(String pin, DeliveredOffer o, DeliveredResult? r) {
    final key = _key(pin, o);
    for (final c in _waiting.remove(key) ?? const <Completer<DeliveredResult?>>[]) {
      if (!c.isCompleted) c.complete(r);
    }
  }

  Future<void> _flush() async {
    final batch = _queue.take(_maxBatch).toList();
    _queue.removeRange(0, batch.length);
    if (_queue.isNotEmpty) _schedule(Duration.zero);
    final byPin = <String, List<_Waiter>>{};
    for (final w in batch) {
      byPin.putIfAbsent(w.pin, () => []).add(w);
    }
    await Future.wait(byPin.entries.map((e) async {
      final pin = e.key;
      final ws = e.value;
      var results = <String, DeliveredResult>{};
      try {
        final res = await http
            .post(
              Uri.parse('${AppConfig.apiBaseUrl}/api/delivery/offers'),
              headers: {'Content-Type': 'application/json'},
              body: jsonEncode({'pincode': pin, 'offers': ws.map((w) => w.offer.toJson()).toList()}),
            )
            .timeout(const Duration(seconds: 15));
        if (res.statusCode == 200) {
          final list = (jsonDecode(res.body)['results'] as List?) ?? const [];
          results = {
            for (final m in list)
              if (m is Map) (m['id'] ?? '').toString(): DeliveredResult.fromJson(Map<String, dynamic>.from(m)),
          };
        }
      } catch (_) {/* network: no line on the card */}
      for (final w in ws) {
        final r = results[w.offer.id];
        if (r?.status == 'pending' && w.tries + 1 < 3) {
          Timer(const Duration(seconds: 3), () {
            _queue.add(_Waiter(w.pin, w.offer, w.tries + 1));
            _schedule(const Duration(milliseconds: 300));
          });
          continue;
        }
        if (r != null && (r.status == 'ok' || r.status == 'unavailable')) {
          _mem[_key(pin, w.offer)] = (at: DateTime.now().millisecondsSinceEpoch, r: r);
          _persistSoon();
        }
        _finish(pin, w.offer, r != null && r.status != 'pending' ? r : null);
      }
    }));
  }
}
