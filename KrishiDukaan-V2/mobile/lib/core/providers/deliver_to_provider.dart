import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'user_provider.dart';

/// "Deliver to 411038": the pincode delivered prices are worked out for
/// (docs/delivered-price-architecture.md §4.1). Mirror of the web's
/// app/lib/deliver-to.ts.
///
///   - Logged in: the profile's delivery address pincode (follows the user
///     doc, so saving an address in profile or checkout updates it).
///   - Anyone can type another pincode in the "Deliver to" chip; that choice
///     is kept on the phone and wins until they save an address again.
/// Null → prices show as before.
class DeliverTo {
  final String pincode;
  final String source; // profile | user
  final String? city;
  const DeliverTo(this.pincode, this.source, {this.city});
}

final _pin = RegExp(r'^[1-9]\d{5}$');
const _prefKey = 'kd_deliver_to_v1';
// The product page's earlier "Deliver to" box kept its own key.
const _legacyKey = 'kd_delivery_pincode';

class DeliverToNotifier extends Notifier<DeliverTo?> {
  String? _typed;
  String? _lastProfilePin;

  @override
  DeliverTo? build() {
    _restore();
    ref.listen(currentUserProvider, (_, next) {
      final da = next.value?.deliveryAddress;
      final pin = da?.pincode ?? '';
      final changed = _lastProfilePin != null && pin != _lastProfilePin;
      _lastProfilePin = pin;
      if (!_pin.hasMatch(pin)) {
        // Logged out (or no address): a typed pincode stays, the profile's goes.
        if (state?.source == 'profile') state = null;
        return;
      }
      // A newly saved address replaces a typed pincode; otherwise typed wins.
      if (_typed != null && !changed) return;
      if (changed) _clearTyped();
      state = DeliverTo(pin, 'profile', city: da!.city.isEmpty ? null : da.city);
    }, fireImmediately: true);
    return null;
  }

  Future<void> _restore() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final saved = prefs.getString(_prefKey) ?? prefs.getString(_legacyKey) ?? '';
      if (_pin.hasMatch(saved)) {
        _typed = saved;
        state = DeliverTo(saved, 'user');
      }
    } catch (_) {/* nothing saved */}
  }

  void _clearTyped() {
    _typed = null;
    SharedPreferences.getInstance().then((p) async {
      await p.remove(_prefKey);
      await p.remove(_legacyKey);
    }).catchError((_) {});
  }

  /// The shopper typed a pincode.
  Future<void> choose(String pincode) async {
    if (!_pin.hasMatch(pincode)) return;
    _typed = pincode;
    state = DeliverTo(pincode, 'user');
    try {
      await (await SharedPreferences.getInstance()).setString(_prefKey, pincode);
    } catch (_) {}
  }
}

final deliverToProvider = NotifierProvider<DeliverToNotifier, DeliverTo?>(DeliverToNotifier.new);
