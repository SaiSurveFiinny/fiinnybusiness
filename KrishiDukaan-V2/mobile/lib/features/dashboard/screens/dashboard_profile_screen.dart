import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/models/user_model.dart';
import '../../../core/providers/user_provider.dart';
import '../../profile/data/account_service.dart';
import '../widgets/set_username_sheet.dart';

/// Business/account-management screen reached from the Dashboard drawer's
/// "Profile" item. Holds everything that isn't part of the simplified
/// account menu on the Profile tab (Edit Profile, My Shop, Username, Help &
/// Support, Delete Account) — mirrors how web keeps these off its lean
/// Account dropdown and inside the dashboard sidebar instead.
class DashboardProfileScreen extends ConsumerWidget {
  const DashboardProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final userAsync = ref.watch(currentUserProvider);
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        title: Text('Profile',
            style: AppTextStyles.heading2.copyWith(color: Colors.white)),
      ),
      body: userAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, _) => const Center(child: Text('Failed to load profile.')),
        data: (user) {
          if (user == null) {
            return const Center(child: Text('Not logged in.'));
          }
          return _Body(user: user);
        },
      ),
    );
  }
}

class _Body extends StatelessWidget {
  final UserModel user;
  const _Body({required this.user});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _Card(
          children: [
            _LinkRow(
              icon: Icons.edit_outlined,
              label: 'Edit Profile',
              onTap: () => context.push('/profile/edit'),
            ),
            _LinkRow(
              icon: Icons.storefront_outlined,
              label: 'My Shop',
              onTap: () => context.push('/shop/${user.phone}'),
            ),
            _LinkRow(
              icon: Icons.alternate_email,
              label:
                  user.username != null ? '@${user.username}' : 'Set Username',
              onTap: () => showModalBottomSheet(
                context: context,
                isScrollControlled: true,
                backgroundColor: Colors.transparent,
                builder: (_) => SetUsernameSheet(user: user),
              ),
            ),
            _LinkRow(
              icon: Icons.support_agent_outlined,
              label: 'Help & Support',
              onTap: () => context.push('/support'),
            ),
          ],
        ),
        const SizedBox(height: 16),
        OutlinedButton.icon(
          onPressed: () => showDialog(
            context: context,
            barrierDismissible: true,
            builder: (_) => const _DeleteAccountDialog(),
          ),
          icon: const Icon(Icons.delete_forever_outlined,
              color: AppColors.onSurfaceVariant),
          label: const Text('Delete Account',
              style: TextStyle(color: AppColors.onSurfaceVariant)),
          style: OutlinedButton.styleFrom(
            side: const BorderSide(color: AppColors.divider),
            padding: const EdgeInsets.symmetric(vertical: 14),
            minimumSize: const Size(double.infinity, 0),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
        ),
        const SizedBox(height: 40),
      ],
    );
  }
}

class _Card extends StatelessWidget {
  final List<Widget> children;
  const _Card({required this.children});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: AppColors.cardShadow,
            blurRadius: 4,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(children: children),
    );
  }
}

class _LinkRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  const _LinkRow({required this.icon, required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Row(
          children: [
            Icon(icon, size: 18, color: AppColors.primary),
            const SizedBox(width: 10),
            Expanded(child: Text(label, style: AppTextStyles.bodyMedium)),
            const Icon(Icons.chevron_right,
                size: 18, color: AppColors.onSurfaceVariant),
          ],
        ),
      ),
    );
  }
}

class _DeleteAccountDialog extends StatefulWidget {
  const _DeleteAccountDialog();

  @override
  State<_DeleteAccountDialog> createState() => _DeleteAccountDialogState();
}

class _DeleteAccountDialogState extends State<_DeleteAccountDialog> {
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
          _error =
              msg.isNotEmpty ? msg : 'Failed to delete account. Please try again.';
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
          Text(
            'This permanently deletes your profile, listings, subscriptions, reels, reviews, and other account data. Past orders/payments are kept for records. This cannot be undone. Type DELETE to confirm.',
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
