import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/legacy.dart';
import 'package:go_router/go_router.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/models/user_model.dart';
import '../../../core/providers/user_provider.dart';

/// Whether the "complete your profile" prompt has already been shown in this
/// app session.
///
/// Session-scoped on purpose: a user who taps "Later" should not be nagged
/// again while they keep using the app, but should be reminded next launch —
/// the details being asked for are the ones buyers need to find and trust the
/// shop, so silently dropping the reminder forever isn't right either.
final profilePromptShownProvider = StateProvider<bool>((ref) => false);

/// Shows the profile-completion dialog once per session, then renders [child]
/// untouched.
///
/// Wraps the bottom-nav shell rather than a single screen so the reminder
/// surfaces wherever the user lands after opening the app. The matching
/// `profile_incomplete` push notification stays as-is; this is the in-app
/// counterpart for users who never opened it.
class ProfileCompletionPrompt extends ConsumerStatefulWidget {
  final Widget child;
  const ProfileCompletionPrompt({super.key, required this.child});

  @override
  ConsumerState<ProfileCompletionPrompt> createState() =>
      _ProfileCompletionPromptState();
}

class _ProfileCompletionPromptState
    extends ConsumerState<ProfileCompletionPrompt> {
  @override
  Widget build(BuildContext context) {
    // Watch rather than read: the user doc resolves asynchronously after
    // launch, so the first build almost always has no profile yet.
    final user = ref.watch(currentUserProvider).value;
    final alreadyShown = ref.watch(profilePromptShownProvider);

    if (user != null && !alreadyShown && !user.isProfileComplete) {
      // Can't open a dialog during build.
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        if (ref.read(profilePromptShownProvider)) return; // raced with another frame
        ref.read(profilePromptShownProvider.notifier).state = true;
        _show(context, user);
      });
    }

    return widget.child;
  }

  Future<void> _show(BuildContext context, UserModel user) async {
    final missing = user.missingProfileFields;
    if (missing.isEmpty) return;

    await showDialog<void>(
      context: context,
      barrierDismissible: true,
      builder: (dialogContext) => _ProfileCompletionDialog(
        missing: missing,
        isSeller: user.isSeller,
      ),
    );
  }
}

class _ProfileCompletionDialog extends StatelessWidget {
  final List<String> missing;
  final bool isSeller;

  const _ProfileCompletionDialog({
    required this.missing,
    required this.isSeller,
  });

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: Colors.white,
      insetPadding: const EdgeInsets.symmetric(horizontal: 28, vertical: 24),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 24, 20, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 56,
                height: 56,
                decoration: const BoxDecoration(
                  color: AppColors.primaryContainer,
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.badge_outlined,
                    color: AppColors.primary, size: 28),
              ),
            ),
            const SizedBox(height: 14),
            Center(
              child: Text(
                'Complete your profile',
                style: AppTextStyles.heading3,
                textAlign: TextAlign.center,
              ),
            ),
            const SizedBox(height: 6),
            Center(
              child: Text(
                isSeller
                    ? 'Buyers need these details to find your shop and trust it.'
                    : 'We need a few details to deliver your orders correctly.',
                style: AppTextStyles.bodySmall
                    .copyWith(color: AppColors.onSurfaceVariant),
                textAlign: TextAlign.center,
              ),
            ),
            const SizedBox(height: 16),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.background,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppColors.divider),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Still needed',
                    style: AppTextStyles.caption.copyWith(
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.8,
                    ),
                  ),
                  const SizedBox(height: 8),
                  ...missing.map(
                    (f) => Padding(
                      padding: const EdgeInsets.symmetric(vertical: 3),
                      child: Row(
                        children: [
                          const Icon(Icons.radio_button_unchecked,
                              size: 15, color: AppColors.secondary),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(f, style: AppTextStyles.bodyMedium),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 18),
            Row(
              children: [
                Expanded(
                  child: TextButton(
                    onPressed: () => Navigator.of(context).pop(),
                    style: TextButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 13),
                      foregroundColor: AppColors.onSurfaceVariant,
                    ),
                    child: const Text('Later'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  flex: 2,
                  child: FilledButton(
                    onPressed: () {
                      Navigator.of(context).pop();
                      // Same destination and highlight payload the
                      // profile_incomplete notification uses, so the edit
                      // screen opens with the missing fields outlined.
                      context.push(
                        '/profile/edit?highlight='
                        '${Uri.encodeComponent(missing.join('|'))}',
                      );
                    },
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.primary,
                      padding: const EdgeInsets.symmetric(vertical: 13),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    child: const Text('Complete now',
                        style: TextStyle(fontWeight: FontWeight.w700)),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
