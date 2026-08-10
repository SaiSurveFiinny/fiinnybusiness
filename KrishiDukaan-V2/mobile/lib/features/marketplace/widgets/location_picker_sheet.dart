import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_config.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/providers/location_provider.dart';
import '../../../core/services/places_service.dart';
import '../providers/selected_location_provider.dart';

/// Opens the "change location" bottom sheet for the Store Locator — pick a
/// manual browsing area (via Places search) or switch back to live GPS.
void showLocationPickerSheet({
  required BuildContext context,
  required WidgetRef ref,
}) {
  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) => const _LocationPickerSheet(),
  );
}

/// Mirrors `locationNameProvider`'s label precedence exactly, so labels
/// picked here look consistent with the GPS-derived label shown elsewhere.
String _labelFromDetails(PlaceDetails details) {
  if (details.sublocality != null && details.sublocality!.isNotEmpty) {
    if (details.city != null &&
        details.city!.isNotEmpty &&
        details.city != details.sublocality) {
      return '${details.sublocality}, ${details.city}';
    }
    return details.sublocality!;
  }
  if (details.city != null && details.city!.isNotEmpty) {
    if (details.state != null &&
        details.state!.isNotEmpty &&
        details.state != details.city) {
      return '${details.city}, ${details.state}';
    }
    return details.city!;
  }
  if (details.formattedAddress != null && details.formattedAddress!.isNotEmpty) {
    return details.formattedAddress!;
  }
  return details.name;
}

class _LocationPickerSheet extends ConsumerStatefulWidget {
  const _LocationPickerSheet();

  @override
  ConsumerState<_LocationPickerSheet> createState() => _LocationPickerSheetState();
}

class _LocationPickerSheetState extends ConsumerState<_LocationPickerSheet> {
  final _searchCtrl = TextEditingController();
  Timer? _debounce;
  List<PlaceSuggestion> _suggestions = [];
  bool _searching = false;
  bool _resolvingDetails = false;
  bool _searchedOnce = false;

  @override
  void dispose() {
    _debounce?.cancel();
    _searchCtrl.dispose();
    super.dispose();
  }

  void _onQueryChanged(String q) {
    _debounce?.cancel();
    if (q.trim().isEmpty) {
      setState(() {
        _suggestions = [];
        _searching = false;
        _searchedOnce = false;
      });
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 350), () async {
      setState(() => _searching = true);
      final results = await PlacesService.autocomplete(q, AppConfig.googleMapsApiKey);
      if (!mounted) return;
      setState(() {
        _suggestions = results;
        _searching = false;
        _searchedOnce = true;
      });
    });
  }

  Future<void> _useCurrentLocation() async {
    // Explicit user gesture — the right place to actually prompt for
    // permission, unlike locationProvider itself which only ever checks the
    // cached status. Regardless of outcome we clear the manual override and
    // let locationProvider's own existing fallback (default lat/lng) handle
    // a denial exactly as it already does today.
    try {
      await Geolocator.requestPermission();
    } catch (_) {
      // Ignore — fall through to the same handling as any other failure.
    }
    await ref.read(selectedLocationProvider.notifier).clear();
    ref.invalidate(locationProvider);
    if (!mounted) return;
    final permission = await Geolocator.checkPermission();
    if (!mounted) return;
    final denied = permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever;
    Navigator.pop(context);
    if (denied) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Location permission denied — showing default area. You can still search for a location above.',
          ),
        ),
      );
    }
  }

  Future<void> _pickSuggestion(PlaceSuggestion s) async {
    setState(() => _resolvingDetails = true);
    final details = await PlacesService.getDetails(s.placeId, AppConfig.googleMapsApiKey);
    if (!mounted) return;
    setState(() => _resolvingDetails = false);
    if (details == null || details.lat == null || details.lng == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Couldn't get location details, try again.")),
      );
      return;
    }
    await ref.read(selectedLocationProvider.notifier).setLocation(
          lat: details.lat!,
          lng: details.lng!,
          label: _labelFromDetails(details),
        );
    if (!mounted) return;
    Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final bottomPad = MediaQuery.of(context).viewInsets.bottom;
    return Padding(
      padding: EdgeInsets.only(bottom: bottomPad),
      child: DraggableScrollableSheet(
        initialChildSize: 0.6,
        minChildSize: 0.4,
        maxChildSize: 0.9,
        expand: false,
        builder: (context, scrollController) {
          return Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 10),
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: AppColors.divider,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
                child: Row(
                  children: [
                    Expanded(
                      child: Text('Change Location', style: AppTextStyles.heading2),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close),
                      onPressed: () => Navigator.pop(context),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: InkWell(
                  onTap: _resolvingDetails ? null : _useCurrentLocation,
                  borderRadius: BorderRadius.circular(12),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    child: Row(
                      children: [
                        const Icon(Icons.my_location, color: AppColors.primary),
                        const SizedBox(width: 12),
                        Text('Use current location',
                            style: AppTextStyles.bodyMedium.copyWith(
                              color: AppColors.primary,
                              fontWeight: FontWeight.w700,
                            )),
                      ],
                    ),
                  ),
                ),
              ),
              const Divider(height: 24),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: TextField(
                  controller: _searchCtrl,
                  autofocus: false,
                  onChanged: _onQueryChanged,
                  decoration: InputDecoration(
                    hintText: 'Search city, area or town...',
                    prefixIcon: const Icon(Icons.search, size: 20),
                    suffixIcon: _searchCtrl.text.isNotEmpty
                        ? IconButton(
                            icon: const Icon(Icons.clear, size: 18),
                            onPressed: () {
                              _searchCtrl.clear();
                              _onQueryChanged('');
                            },
                          )
                        : null,
                    isDense: true,
                    filled: true,
                    fillColor: AppColors.surfaceVariant,
                    contentPadding:
                        const EdgeInsets.symmetric(vertical: 10, horizontal: 12),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide.none,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 8),
              if (_searching || _resolvingDetails)
                const Padding(
                  padding: EdgeInsets.all(16),
                  child: SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                )
              else if (_searchedOnce && _suggestions.isEmpty)
                Padding(
                  padding: const EdgeInsets.all(20),
                  child: Text(
                    'No results found. Check spelling or try a nearby town.',
                    style: AppTextStyles.bodySmall
                        .copyWith(color: AppColors.onSurfaceVariant),
                  ),
                )
              else
                Expanded(
                  child: ListView.builder(
                    controller: scrollController,
                    itemCount: _suggestions.length,
                    itemBuilder: (_, i) {
                      final s = _suggestions[i];
                      return ListTile(
                        leading: const Icon(Icons.place_outlined,
                            color: AppColors.onSurfaceVariant),
                        title: Text(s.description),
                        onTap: _resolvingDetails ? null : () => _pickSuggestion(s),
                      );
                    },
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}
