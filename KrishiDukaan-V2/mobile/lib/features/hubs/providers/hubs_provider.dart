import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/models/hub_model.dart';
import '../data/hubs_repository.dart';

final _repo = HubsRepository();

final hubsListProvider = FutureProvider<List<HubModel>>((ref) {
  return _repo.fetchHubs();
});

final hubDetailProvider =
    FutureProvider.family<HubModel?, String>((ref, id) async {
  // Already loaded with the list (Home's Shop by Crop / the Hubs tab)?
  // Then opening one costs no extra read.
  final cached = ref.read(hubsListProvider).value;
  for (final h in cached ?? const <HubModel>[]) {
    if (h.id == id) return h;
  }
  return _repo.fetchHubById(id);
});
