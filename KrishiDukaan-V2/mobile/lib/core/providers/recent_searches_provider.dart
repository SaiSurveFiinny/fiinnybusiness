import 'package:flutter_riverpod/legacy.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _kRecentSearchesKey = 'recent_marketplace_searches';
const _kMaxRecentSearches = 8;

/// Locally-persisted recent marketplace search terms — same
/// SharedPreferences persistence idiom as `locale_provider.dart`, using
/// `getStringList`/`setStringList` directly since string lists don't need
/// JSON encoding.
final recentSearchesProvider =
    StateNotifierProvider<RecentSearchesNotifier, List<String>>((ref) {
  return RecentSearchesNotifier();
});

class RecentSearchesNotifier extends StateNotifier<List<String>> {
  RecentSearchesNotifier() : super(const []) {
    _load();
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    state = prefs.getStringList(_kRecentSearchesKey) ?? const [];
  }

  /// Adds [query] to the front of the list, de-duplicating case-insensitively
  /// and capping at [_kMaxRecentSearches] entries.
  Future<void> addSearch(String query) async {
    final trimmed = query.trim();
    if (trimmed.isEmpty) return;

    final lower = trimmed.toLowerCase();
    final updated = [
      trimmed,
      ...state.where((s) => s.toLowerCase() != lower),
    ].take(_kMaxRecentSearches).toList();

    state = updated;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(_kRecentSearchesKey, updated);
  }

  Future<void> clearAll() async {
    state = const [];
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_kRecentSearchesKey);
  }
}
