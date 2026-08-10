import 'dart:convert';
import 'package:flutter_riverpod/legacy.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _kSelectedLocationKey = 'store_locator_selected_location';

/// A manually-picked "browsing location" for the Store Locator — distinct
/// from the device's live GPS position. `null` in [SelectedLocationNotifier]
/// means "use current GPS location" (today's default behavior).
class SelectedLocation {
  final double lat;
  final double lng;
  final String label;
  const SelectedLocation({required this.lat, required this.lng, required this.label});
}

/// Persisted the same way `locale_provider.dart`/`recent_searches_provider.dart`
/// persist their state — SharedPreferences, loaded async in the constructor.
final selectedLocationProvider =
    StateNotifierProvider<SelectedLocationNotifier, SelectedLocation?>((ref) {
  return SelectedLocationNotifier();
});

class SelectedLocationNotifier extends StateNotifier<SelectedLocation?> {
  SelectedLocationNotifier() : super(null) {
    _load();
  }

  Future<void> _load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_kSelectedLocationKey);
      if (raw == null) return;
      final map = jsonDecode(raw) as Map<String, dynamic>;
      final lat = (map['lat'] as num?)?.toDouble();
      final lng = (map['lng'] as num?)?.toDouble();
      final label = map['label'] as String?;
      if (lat == null || lng == null || label == null) return;
      state = SelectedLocation(lat: lat, lng: lng, label: label);
    } catch (_) {
      // Corrupt/stale data — just stay null (falls back to GPS/default).
    }
  }

  Future<void> setLocation({
    required double lat,
    required double lng,
    required String label,
  }) async {
    state = SelectedLocation(lat: lat, lng: lng, label: label);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      _kSelectedLocationKey,
      jsonEncode({'lat': lat, 'lng': lng, 'label': label}),
    );
  }

  Future<void> clear() async {
    state = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_kSelectedLocationKey);
  }
}
