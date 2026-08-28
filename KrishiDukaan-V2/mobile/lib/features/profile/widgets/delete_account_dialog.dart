import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../data/account_service.dart';

/// Confirmation dialog for permanently deleting the signed-in user's account.
///
/// Shared by every screen that offers account deletion (the main Profile
/// tab's Account menu, and the seller Dashboard's Business Settings screen)
/// so there is exactly one implementation of the "type DELETE to confirm"
/// flow and one place that knows what [AccountService.deleteMyAccount]
/// actually does.
class DeleteAccountDialog extends StatefulWidget {
  const DeleteAccountDialog({super.key});

  @override
  State<DeleteAccountDialog> createState() => _DeleteAccountDialogState();
}

class _DeleteAccountDialogState extends State<DeleteAccountDialog> {
  final _ctrl = TextEditingController();
  bool _deleting = false;
  String? _error;

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _confirm() async {
    setState(() {
      _deleting = true;
      _error = null;
    });
    try {
      await AccountService().deleteMyAccount();
      // The backend deletes the Firestore data first and the Auth user last
      // (see app/api/account/delete/route.ts), so by the time this call
      // returns the Auth account is already gone server-side. signOut()
      // here just clears the now-stale local session so the app doesn't
      // keep believing it's logged in as a deleted user.
      await FirebaseAuth.instance.signOut();
      if (mounted) {
        Navigator.of(context).pop();
        context.go('/');
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _deleting = false;
          final msg = e.toString().replaceAll('Exception: ', '');
          _error = msg.isNotEmpty
              ? msg
              : 'Failed to delete account. Please try again.';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final canConfirm = _ctrl.text.trim().toUpperCase() == 'DELETE' && !_deleting;
    return AlertDialog(
      title: Text(
        'Delete Account',
        style: AppTextStyles.heading3.copyWith(color: AppColors.error),
      ),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'This permanently deletes your profile, listings, subscriptions, '
            'reels, reviews, and other account data. Past orders/payments are '
            'kept for records. This cannot be undone. Type DELETE to confirm.',
            style: AppTextStyles.bodySmall,
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _ctrl,
            enabled: !_deleting,
            textCapitalization: TextCapitalization.characters,
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(
              hintText: 'DELETE',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
              isDense: true,
              contentPadding:
                  const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 10),
            Text(_error!, style: const TextStyle(color: AppColors.error, fontSize: 12)),
          ],
        ],
      ),
      actions: [
        TextButton(
          onPressed: _deleting ? null : () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: canConfirm ? _confirm : null,
          style: FilledButton.styleFrom(backgroundColor: AppColors.error),
          child: _deleting
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                )
              : const Text('Delete'),
        ),
      ],
    );
  }
}
