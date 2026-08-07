import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/providers/app_info_provider.dart';
import '../../../core/providers/locale_provider.dart';
import '../../../core/providers/user_provider.dart';
import '../../../core/widgets/app_brand_icon.dart';
import '../../../core/widgets/app_top_bar.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final userAsync = ref.watch(currentUserProvider);
    final locale = ref.watch(localeProvider);
    final isHindi = locale.languageCode == 'hi';
    final user = userAsync.value;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        elevation: 0,
        backgroundColor: Colors.transparent,
        foregroundColor: AppColors.onSurface,
        systemOverlayStyle: topBarOverlayStyle,
        flexibleSpace: const TopBarBackdrop(),
        titleSpacing: 16,
        title: Row(
          children: [
            const AppBrandIcon(size: 30),
            const SizedBox(width: 10),
            Text(
              isHindi ? 'प्रोफ़ाइल' : 'Profile',
              style: AppTextStyles.heading2.copyWith(
                  color: AppColors.onSurface,
                  fontSize: 18,
                  fontWeight: FontWeight.w800),
            ),
          ],
        ),
        // Explicit "go home" rather than a plain pop: Profile can be reached
        // through nested pushes (e.g. Profile → Dashboard → back to Profile
        // via the person icon), where a plain back arrow would only bounce
        // to whatever screen happens to be underneath (Dashboard) instead of
        // actually leaving the account area. go('/') always exits cleanly to
        // Home no matter how Profile was reached.
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/'),
        ),
        actions: user != null
            ? [
                Padding(
                  padding: const EdgeInsets.only(right: 12),
                  child: _AddProductButton(user: user),
                ),
              ]
            : null,
      ),
      body: userAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, _) => const Center(child: Text('Failed to load profile.')),
        data: (user) {
          if (user == null) {
            return _GuestView(isHindi: isHindi);
          }
          return _ProfileBody(user: user, isHindi: isHindi, locale: locale);
        },
      ),
    );
  }
}

/// "Add Product" shortcut in the Profile AppBar — one of the most frequent
/// actions for manufacturers, so it's surfaced here rather than requiring a
/// detour through the dashboard first. Paid sellers go straight to their
/// add-product form (auto-opened via ?autoAdd=1 — see app_router.dart);
/// farmers/consumers and unpaid sellers are nudged to subscribe, landing on
/// the same /subscription?reason=paywall destination the rest of the app's
/// paywall already uses (the router-level dashboard guard, and the "Seller
/// Dashboard" quick link below), so this doesn't introduce a second paywall
/// flow with different copy/behavior.
class _AddProductButton extends StatelessWidget {
  final dynamic user;
  const _AddProductButton({required this.user});

  @override
  Widget build(BuildContext context) {
    return TextButton.icon(
      onPressed: () => _onTap(context),
      style: TextButton.styleFrom(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
        ),
      ),
      icon: const Icon(Icons.add, size: 18),
      label: const Text(
        'Add Product',
        style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
      ),
    );
  }

  void _onTap(BuildContext context) {
    final bool canAccess = user.canAccessDashboard == true;
    if (canAccess) {
      final bool isManufacturer = user.isManufacturer == true;
      context.push(
        isManufacturer
            ? '/dashboard/manufacturer/catalog?autoAdd=1'
            : '/dashboard/inventory?autoAdd=1',
      );
      return;
    }
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Upgrade to add products')),
    );
    context.push('/subscription?reason=paywall');
  }
}

class _ProfileBody extends ConsumerWidget {
  final dynamic user;
  final bool isHindi;
  final dynamic locale;
  const _ProfileBody({
    required this.user,
    required this.isHindi,
    required this.locale,
  });

  String _roleLabel(String role, bool hindi) {
    switch (role) {
      case 'manufacturer':
        return hindi ? 'निर्माता' : 'Manufacturer';
      case 'retailer':
        return hindi ? 'खुदरा विक्रेता' : 'Retailer';
      default:
        return hindi ? 'उपभोक्ता' : 'Consumer';
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Avatar + name
        Center(
          child: Column(
            children: [
              const SizedBox(height: 8),
              CircleAvatar(
                radius: 40,
                backgroundColor: AppColors.primaryContainer,
                child: Text(
                  user.name.isNotEmpty ? user.name[0].toUpperCase() : '?',
                  style: AppTextStyles.heading1.copyWith(
                    color: AppColors.primary,
                    fontSize: 32,
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Text(
                user.name,
                style: AppTextStyles.heading2,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 4),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 4,
                ),
                decoration: BoxDecoration(
                  color: AppColors.primaryContainer,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  _roleLabel(user.role, isHindi),
                  style: AppTextStyles.caption.copyWith(
                    color: AppColors.primary,
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 24),

        // Prompt to finish profile when key fields are missing.
        if (!user.isProfileComplete) ...[
          InkWell(
            onTap: () => context.push('/profile/edit'),
            borderRadius: BorderRadius.circular(12),
            child: Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppColors.secondaryContainer.withValues(alpha: 0.4),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: AppColors.secondary.withValues(alpha: 0.4),
                ),
              ),
              child: Row(
                children: [
                  const Icon(Icons.info_outline, color: AppColors.secondary),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      isHindi
                          ? 'अपनी प्रोफ़ाइल पूरी करें (नाम, पता${user.isSeller ? ', दुकान का नाम' : ''})'
                          : 'Complete your profile (name, address${user.isSeller ? ', shop name' : ''})',
                      style: AppTextStyles.bodySmall,
                    ),
                  ),
                  const Icon(Icons.chevron_right,
                      size: 18, color: AppColors.onSurfaceVariant),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
        ],

        // Account info card
        _Card(
          title: isHindi ? 'खाता जानकारी' : 'Account Info',
          children: [
            _InfoRow(
              icon: Icons.phone_outlined,
              label: isHindi ? 'फ़ोन' : 'Phone',
              value: user.phone,
            ),
            _InfoRow(
              icon: Icons.badge_outlined,
              label: isHindi ? 'भूमिका' : 'Role',
              value: _roleLabel(user.role, isHindi),
            ),
          ],
        ),
        const SizedBox(height: 12),

        // Account menu — mirrors web's Account dropdown (Language / Dashboard
        // / My Orders / Logout) instead of mixing in the business-management
        // links, which now live under the Dashboard's Profile section.
        _Card(
          title: isHindi ? 'भाषा' : 'Language',
          children: [
            _LanguageTile(
              label: 'English',
              selected: !isHindi,
              onTap: () => ref
                  .read(localeProvider.notifier)
                  .setLocale(const Locale('en')),
            ),
            _LanguageTile(
              label: 'हिंदी (Hindi)',
              selected: isHindi,
              onTap: () => ref
                  .read(localeProvider.notifier)
                  .setLocale(const Locale('hi')),
            ),
          ],
        ),
        const SizedBox(height: 12),
        _Card(
          title: isHindi ? 'त्वरित लिंक' : 'Quick Links',
          children: [
            if (user.isSeller)
              _LinkRow(
                icon: Icons.dashboard_outlined,
                label: isHindi ? 'डैशबोर्ड' : 'Dashboard',
                // Unpaid sellers are redirected to the paywall by the router
                // guard on /dashboard, so they can purchase a subscription.
                onTap: () => context.push('/dashboard'),
              ),
            _LinkRow(
              icon: Icons.receipt_long_outlined,
              label: isHindi ? 'ऑर्डर' : 'Orders',
              onTap: () => context.push('/orders'),
            ),
          ],
        ),
        const SizedBox(height: 24),

        // Logout
        OutlinedButton.icon(
          onPressed: () async {
            await FirebaseAuth.instance.signOut();
            if (context.mounted) context.go('/');
          },
          icon: const Icon(Icons.logout, color: AppColors.error),
          label: Text(
            isHindi ? 'लॉग आउट' : 'Logout',
            style: AppTextStyles.bodyMedium.copyWith(color: AppColors.error),
          ),
          style: OutlinedButton.styleFrom(
            side: const BorderSide(color: AppColors.error),
            padding: const EdgeInsets.symmetric(vertical: 14),
            minimumSize: const Size(double.infinity, 0),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
        ),
        const SizedBox(height: 8),
        Center(
          child: Text(
            ref.watch(appVersionProvider).maybeWhen(
                  data: (v) => 'KrishiDukan v$v',
                  orElse: () => 'KrishiDukan',
                ),
            style: AppTextStyles.caption,
          ),
        ),
        const SizedBox(height: 80),
      ],
    );
  }
}

class _GuestView extends StatelessWidget {
  final bool isHindi;
  const _GuestView({required this.isHindi});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(
            Icons.person_outline,
            size: 72,
            color: AppColors.onSurfaceVariant,
          ),
          const SizedBox(height: 16),
          Text(
            isHindi
                ? 'खाते तक पहुंचने के लिए लॉगिन करें'
                : 'Login to access your account',
            style: AppTextStyles.body,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 24),
          FilledButton(
            onPressed: () => context.push('/login'),
            child: Text(isHindi ? 'साइन इन करें' : 'Sign In'),
          ),
        ],
      ),
    );
  }
}

class _Card extends StatelessWidget {
  final String title;
  final List<Widget> children;
  const _Card({required this.title, required this.children});

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
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: AppTextStyles.heading3),
          const SizedBox(height: 8),
          ...children,
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  const _InfoRow({
    required this.icon,
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Icon(icon, size: 18, color: AppColors.onSurfaceVariant),
          const SizedBox(width: 10),
          Text(
            label,
            style: AppTextStyles.caption.copyWith(
              color: AppColors.onSurfaceVariant,
            ),
          ),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              value,
              style: AppTextStyles.bodyMedium,
              textAlign: TextAlign.end,
            ),
          ),
        ],
      ),
    );
  }
}

class _LinkRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  const _LinkRow({
    required this.icon,
    required this.label,
    required this.onTap,
  });

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
            const Icon(
              Icons.chevron_right,
              size: 18,
              color: AppColors.onSurfaceVariant,
            ),
          ],
        ),
      ),
    );
  }
}

class _LanguageTile extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  const _LanguageTile({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Row(
          children: [
            Icon(
              selected ? Icons.radio_button_checked : Icons.radio_button_off,
              color: selected ? AppColors.primary : AppColors.onSurfaceVariant,
              size: 20,
            ),
            const SizedBox(width: 10),
            Text(label, style: AppTextStyles.bodyMedium),
          ],
        ),
      ),
    );
  }
}
