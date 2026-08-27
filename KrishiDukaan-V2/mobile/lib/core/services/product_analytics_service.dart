import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

/// Writes the seller-facing analytics counters on `products/{id}` — the same
/// fields web's trackProductImpression / trackProductClick write
/// (app/firebase.ts), so both platforms feed one set of numbers.
///
/// Counters live on the shared product doc and are readable by the seller's
/// Overview (lifetime scalar, e.g. `impressions`) and Analytics screen
/// (per-day map, e.g. `impressionsByDay.{yyyy-MM-dd}`). BOTH must be
/// incremented together or those two screens disagree.
///
/// firestore.rules already allows any authenticated shopper to bump exactly
/// these keys on someone else's product, but via `hasOnly([...])` — so an
/// update here must touch NOTHING else (no `updatedAt`), or the whole write
/// is rejected.
class ProductAnalyticsService {
  ProductAnalyticsService._();
  static final instance = ProductAnalyticsService._();

  /// Products whose impression has already been counted in this app session.
  /// Mirrors web's `trackedIds` Set in MarketView.tsx: a product scrolled past
  /// twice, or re-rendered by a rebuild, must not inflate the seller's numbers.
  final _countedImpressions = <String>{};

  /// Impressions waiting to be flushed, mapped id -> summed list position.
  /// Position feeds `positionSum`, which web divides by `impressions` to get
  /// the average search position shown in seller analytics.
  final _pendingImpressions = <String, int>{};
  Timer? _flushTimer;

  static String _dayKey([DateTime? at]) {
    final now = at ?? DateTime.now();
    return '${now.year}-${now.month.toString().padLeft(2, '0')}-'
        '${now.day.toString().padLeft(2, '0')}';
  }

  /// Records that [catalogId] was actually shown to a shopper at [position]
  /// (1-based) in a list.
  ///
  /// Deduplicated per session and BATCHED: a home screen rendering several
  /// rails would otherwise fire one Firestore write per product every time it
  /// rebuilt. Calls made close together are coalesced into a single
  /// WriteBatch.
  void recordImpression(String catalogId, {required int position}) {
    if (catalogId.isEmpty) return;
    // Counters are only writable by an authenticated user (firestore.rules),
    // and an anonymous browse shouldn't inflate a seller's stats anyway.
    if (FirebaseAuth.instance.currentUser == null) return;
    if (!_countedImpressions.add(catalogId)) return;

    _pendingImpressions[catalogId] = position;
    _flushTimer?.cancel();
    _flushTimer = Timer(const Duration(milliseconds: 800), _flushImpressions);
  }

  Future<void> _flushImpressions() async {
    if (_pendingImpressions.isEmpty) return;
    final batchItems = Map<String, int>.from(_pendingImpressions);
    _pendingImpressions.clear();

    final db = FirebaseFirestore.instance;
    final dayKey = _dayKey();
    final entries = batchItems.entries.toList();

    // Firestore caps a batch at 500 writes; chunk defensively even though a
    // single screen will never approach that.
    for (var i = 0; i < entries.length; i += 400) {
      final chunk = entries.sublist(
        i,
        i + 400 > entries.length ? entries.length : i + 400,
      );
      final batch = db.batch();
      for (final entry in chunk) {
        batch.update(db.collection('products').doc(entry.key), {
          'impressions': FieldValue.increment(1),
          'positionSum': FieldValue.increment(entry.value),
          'impressionsByDay.$dayKey': FieldValue.increment(1),
        });
      }
      try {
        await batch.commit();
      } catch (_) {
        // Best-effort analytics: a product doc that was deleted, or a rules
        // rejection, must never surface to the shopper. Deliberately NOT
        // re-queued — a retry loop on a permanently failing doc would spin.
      }
    }
  }

  /// Bumps an arbitrary counter pair (lifetime scalar + per-day map) on a
  /// product. Used for clicks/calls/direction requests, which are single
  /// deliberate actions and so are written immediately rather than batched.
  void recordEvent(String catalogId, String totalField, String byDayField) {
    if (catalogId.isEmpty) return;
    if (FirebaseAuth.instance.currentUser == null) return;
    FirebaseFirestore.instance.collection('products').doc(catalogId).update({
      totalField: FieldValue.increment(1),
      '$byDayField.${_dayKey()}': FieldValue.increment(1),
    }).catchError((_) {});
  }
}
