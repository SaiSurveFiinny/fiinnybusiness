import 'package:in_app_review/in_app_review.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Prompts the OS-native Play Store / App Store review sheet at a positive
/// moment (after a successful order). Never shows a custom sentiment gate in
/// front of it — Play Store and App Store guidelines prohibit filtering who
/// sees the review prompt based on in-app responses.
class AppReviewService {
  static const _successfulOrdersKey = 'review_successful_orders';
  static const _lastPromptedAtKey = 'review_last_prompted_at';

  static const _minOrdersBeforePrompt = 2;
  static const _cooldown = Duration(days: 90);

  Future<void> onOrderCompleted() async {
    final prefs = await SharedPreferences.getInstance();
    final orders = (prefs.getInt(_successfulOrdersKey) ?? 0) + 1;
    await prefs.setInt(_successfulOrdersKey, orders);

    if (orders < _minOrdersBeforePrompt) return;

    final lastPromptedMs = prefs.getInt(_lastPromptedAtKey);
    if (lastPromptedMs != null) {
      final since = DateTime.now().difference(
        DateTime.fromMillisecondsSinceEpoch(lastPromptedMs),
      );
      if (since < _cooldown) return;
    }

    final inAppReview = InAppReview.instance;
    if (!await inAppReview.isAvailable()) return;

    await prefs.setInt(_lastPromptedAtKey, DateTime.now().millisecondsSinceEpoch);
    await inAppReview.requestReview();
  }
}
