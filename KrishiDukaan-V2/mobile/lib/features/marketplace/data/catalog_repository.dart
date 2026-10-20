import 'package:cloud_firestore/cloud_firestore.dart';
import '../../../core/constants/app_config.dart';
import '../../../core/models/catalog_model.dart';
import '../../../core/services/perf_trace.dart';

const _col = 'products';

/// One pre-merged card per product name, built by Cloud Functions
/// (functions/src/marketplace/cards.ts). Replaces the in-app merge that read
/// every `products` doc (~32 copies per name) and every review on each call.
const _cardsCol = 'marketplaceCards';

/// Sources that mark a doc as a seller's COPY of a canonical manufacturer
/// product, rather than the canonical product itself. Copies never carry the
/// canonical doc's own display-only fields (videoUrl, composition, etc.) —
/// see [CatalogRepository.fetchById]'s copy-doc redirect for why that matters.
const _copySources = {
  'retailer_inventory_copy',
  'manufacturer_assigned',
  'admin_assigned',
};

class CatalogRepository {
  final _db = FirebaseFirestore.instance;

  /// Search, category filters and paging all work over this in-memory list,
  /// so it is read at most once per [_cardsTtl] instead of once per keystroke.
  ///
  /// Shared by every CatalogRepository (static): the inventory and catalogue
  /// sheets create their own instance and each used to download the whole
  /// collection again.
  static const _cardsTtl = Duration(minutes: 5);
  static List<CatalogModel>? _cards;
  static DateTime? _cardsAt;
  static Future<List<CatalogModel>>? _cardsLoad;

  /// After a failed load, don't start another full download for this long —
  /// it used to retry on every search keystroke, piling up downloads on slow
  /// networks until the phone ran out of memory and the app closed.
  static const _retryAfterFailure = Duration(seconds: 30);
  static DateTime? _failedAt;

  /// Bounded fetch for Home's preview rails (Trending / Featured / Top
  /// Deals), which only ever show ~30 cards: the newest cards, already merged
  /// across sellers and carrying their ratings.
  Future<List<CatalogModel>> fetchHomeRailProducts({int limit = 60}) async {
    final snap = await _db
        .collection(_cardsCol)
        .orderBy('createdAtMs', descending: true)
        .limit(limit)
        .get();
    return snap.docs
        .map((doc) => CatalogModel.fromCard(doc.data()))
        .where((p) => p.name.isNotEmpty && p.imageUrl.isNotEmpty && p.price.isFinite)
        .toList();
  }

  /// Every marketplace card, newest first (the order the in-app merge used
  /// to produce). Concurrent callers share one read.
  ///
  /// Once loaded, answers immediately: when the list is older than
  /// [_cardsTtl] it is refreshed in the background instead of making the
  /// search wait for a full download (that wait is what made slow searches
  /// look frozen).
  Future<List<CatalogModel>> fetchAllMergedProducts() {
    final cards = _cards;
    if (cards != null) {
      if (DateTime.now().difference(_cardsAt!) >= _cardsTtl && !_inBackoff) {
        _cardsLoad ??= _loadCards();
      }
      return Future.value(cards);
    }
    if (_inBackoff) return Future.value(const <CatalogModel>[]);
    return _cardsLoad ??= _loadCards();
  }

  static List<CatalogModel>? get _freshCards =>
      _cards != null && DateTime.now().difference(_cardsAt!) < _cardsTtl
          ? _cards
          : null;

  bool get _inBackoff =>
      _failedAt != null &&
      DateTime.now().difference(_failedAt!) < _retryAfterFailure;

  Future<List<CatalogModel>> _loadCards() async {
    try {
      final snap = await traced(
          'load_marketplace_cards', () => _db.collection(_cardsCol).get());
      final cards = <CatalogModel>[];
      for (final doc in snap.docs) {
        // One malformed card used to fail the whole load (so nothing was
        // cached and the next keystroke downloaded everything again).
        try {
          cards.add(CatalogModel.fromCard(doc.data()));
        } catch (_) {}
      }
      cards.sort((a, b) {
          if (a.createdAt == null) return b.createdAt == null ? 0 : 1;
          if (b.createdAt == null) return -1;
          return b.createdAt!.compareTo(a.createdAt!);
        });
      _cards = cards;
      _cardsAt = DateTime.now();
      _failedAt = null;
      return cards;
    } catch (_) {
      _failedAt = DateTime.now();
      return _cards ?? [];
    } finally {
      _cardsLoad = null;
    }
  }

  /// All merged products matching [category] / [searchQuery], unpaginated.
  /// The full catalog is fetched + merged in one shot, so the marketplace pages
  /// through this result in memory rather than re-querying Firestore per page.
  Future<List<CatalogModel>> fetchFiltered({
    String? category,
    String? searchQuery,
  }) async {
    final allProducts = await fetchAllMergedProducts();
    return filterProducts(
      allProducts,
      category: category,
      searchQuery: searchQuery,
    );
  }

  /// [fetchFiltered]'s filter + relevance sort over an already-loaded list.
  static List<CatalogModel> filterProducts(
    List<CatalogModel> allProducts, {
    String? category,
    String? searchQuery,
  }) {
    var filtered = allProducts;

    if (category != null && category.isNotEmpty) {
      filtered = filtered
          .where((p) => p.category.toLowerCase() == category.toLowerCase())
          .toList();
    }

    if (searchQuery != null && searchQuery.trim().isNotEmpty) {
      final query = searchQuery.trim().toLowerCase();
      filtered = filtered.where((p) {
        final nameMatch = p.name.toLowerCase().contains(query);
        final descMatch = p.description?.toLowerCase().contains(query) ?? false;
        final catMatch = p.category.toLowerCase().contains(query);
        final storeMatch = p.store?.toLowerCase().contains(query) ?? false;
        final availMatch = (p.availability ?? []).any((av) =>
            av.storeName?.toLowerCase().contains(query) ?? false);

        return nameMatch || descMatch || catMatch || storeMatch || availMatch;
      }).toList();

      // Sort by relevance: name match > category/store match > description match
      filtered.sort((a, b) {
        final aName = a.name.toLowerCase();
        final bName = b.name.toLowerCase();
        
        final aNameStarts = aName.startsWith(query);
        final bNameStarts = bName.startsWith(query);
        if (aNameStarts && !bNameStarts) return -1;
        if (!aNameStarts && bNameStarts) return 1;

        final aNameContains = aName.contains(query);
        final bNameContains = bName.contains(query);
        if (aNameContains && !bNameContains) return -1;
        if (!aNameContains && bNameContains) return 1;

        return 0; // maintain original order for other matches
      });
    }

    return filtered;
  }

  Future<List<CatalogModel>> fetchPage({
    String? category,
    String? searchQuery,
    DocumentSnapshot? startAfter,
    int limit = AppConfig.firestorePageSize,
  }) async {
    final filtered =
        await fetchFiltered(category: category, searchQuery: searchQuery);

    int startIdx = 0;
    if (startAfter != null) {
      final idx = filtered.indexWhere((p) => p.id == startAfter.id);
      if (idx != -1) {
        startIdx = idx + 1;
      }
    }

    return filtered.skip(startIdx).take(limit).toList();
  }

  /// The card that [productId] (a canonical or copy doc id) was merged into.
  Future<CatalogModel?> _cardContaining(String productId) async {
    bool owns(CatalogModel p) =>
        p.id == productId || (p.mergedProductIds?.contains(productId) ?? false);
    final cached = _freshCards?.where(owns).firstOrNull;
    if (cached != null) return cached;
    try {
      final card = await _db
          .collection(_cardsCol)
          .where('mergedProductIds', arrayContains: productId)
          .limit(1)
          .get();
      if (card.docs.isNotEmpty) return CatalogModel.fromCard(card.docs.first.data());
    } catch (_) {}
    return null;
  }

  Future<CatalogModel?> fetchById(String catalogId) async {
    // One indexed read instead of loading the whole catalogue. Any doc merged
    // into a card resolves to it, so a seller COPY's id (e.g. from "More
    // products from this seller") opens the canonical product with its
    // videoUrl/composition — what the copy-doc redirect below used to do.
    final card = await _cardContaining(catalogId);
    if (card != null) return card;

    try {
      final doc = await _db.collection('products').doc(catalogId).get();
      if (!doc.exists) return null;
      // A stale deep link (share message, notification, browser history) can
      // still name a deactivated product after it was taken down.
      final data = doc.data();
      if (data != null && data['isActive'] == false) return null;

      // A copy whose name no longer matches its manufacturer product isn't in
      // that product's card: redirect by manufacturerProductId.
      final source = data?['source']?.toString();
      final manufacturerProductId = data?['manufacturerProductId']?.toString();
      if (source != null &&
          _copySources.contains(source) &&
          manufacturerProductId != null &&
          manufacturerProductId.isNotEmpty) {
        final canonical = await _cardContaining(manufacturerProductId);
        if (canonical != null) return canonical;
      }

      return CatalogModel.fromFirestore(doc);
    } catch (_) {}
    return null;
  }

  Future<List<CatalogModel>> fetchFeatured({int limit = 6}) async {
    final list = await fetchAllMergedProducts();
    return list.take(limit).toList();
  }

  /// "More products from this seller" rail on the product page's Retailer
  /// Profile section. Queries the global `products` collection directly by
  /// `retailerPhone` rather than a per-retailer subcollection mirror — that
  /// mirror (`retailers/{phone}/products`) is only written by the web
  /// dashboard, so a retailer who only ever used the mobile app to manage
  /// their inventory would show an empty rail if this read it instead.
  ///
  /// Equality-only filter, sorted in memory rather than via `orderBy` — an
  /// `orderBy` on a field other than the equality filter needs a composite
  /// index (this repo has been bitten by undeployed indexes before, see
  /// ReelsRepository.fetchSellerReels), so a plain `retailerPhone==` query is
  /// deliberately kept index-free.
  Future<List<CatalogModel>> fetchMoreFromRetailer(
    String retailerPhone, {
    required String excludeId,
    int limit = 8,
  }) async {
    if (retailerPhone.isEmpty) return [];
    try {
      final snap = await _db
          .collection(_col)
          .where('retailerPhone', isEqualTo: retailerPhone)
          .get();
      final products = snap.docs
          .map(CatalogModel.fromFirestore)
          .where((p) => p.id != excludeId && p.isActive && p.name.isNotEmpty)
          .toList()
        ..sort((a, b) => (b.createdAt ?? DateTime(0)).compareTo(a.createdAt ?? DateTime(0)));
      return products.take(limit).toList();
    } catch (_) {
      return [];
    }
  }
}
