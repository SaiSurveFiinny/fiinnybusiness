import 'package:cached_network_image/cached_network_image.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/models/listing_model.dart';
import '../../../core/providers/app_info_provider.dart';
import '../../../core/providers/locale_provider.dart';
import '../../../core/providers/user_provider.dart';
import '../../../core/widgets/app_brand_icon.dart';
import '../../../core/widgets/app_top_bar.dart';
import '../../dashboard/providers/dashboard_provider.dart';
import '../../manufacturer/providers/manufacturer_provider.dart';
import '../../marketplace/providers/marketplace_provider.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final userAsync = ref.watch(currentUserProvider);
    final locale = ref.watch(localeProvider);
    final isHindi = locale.languageCode == 'hi';

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

/// "Add Product" quick action, shown next to "Add Reel" right under the
/// avatar — one of the most frequent actions for manufacturers, so it's
/// surfaced on Profile itself rather than requiring a detour through the
/// dashboard first. Paid sellers go straight to their add-product form
/// (auto-opened via ?autoAdd=1 — see app_router.dart); farmers/consumers and
/// unpaid sellers are nudged to subscribe, landing on the same
/// /subscription?reason=paywall destination the rest of the app's paywall
/// already uses (the router-level dashboard guard, and the "Dashboard" quick
/// link below), so this doesn't introduce a second paywall flow with
/// different copy/behavior.
class _AddProductButton extends StatelessWidget {
  final dynamic user;
  const _AddProductButton({required this.user});

  @override
  Widget build(BuildContext context) {
    return _ProfileActionButton(
      icon: Icons.add_box_outlined,
      label: 'Add Product',
      filled: true,
      onTap: () => _onTap(context),
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

/// "Add Reel" quick action — same placement/style as Add Product. No paywall
/// gate: matches the existing /reels/upload route today, which has no
/// subscription/role guard anywhere. Icon matches the one every other
/// "post a reel" entry point in the app already uses (shop_profile_screen.dart,
/// reels_feed_screen.dart) — `video_call_outlined` isn't in the bundled icon
/// font subset and rendered blank, which is why the button looked missing.
class _AddReelButton extends StatelessWidget {
  const _AddReelButton();

  @override
  Widget build(BuildContext context) {
    return _ProfileActionButton(
      icon: Icons.video_call_rounded,
      label: 'Add Reel',
      filled: false,
      onTap: () => context.push('/reels/upload'),
    );
  }
}

class _ProfileActionButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool filled;
  final VoidCallback onTap;
  const _ProfileActionButton({
    required this.icon,
    required this.label,
    required this.filled,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: TextButton.icon(
        onPressed: onTap,
        style: TextButton.styleFrom(
          backgroundColor: filled ? AppColors.primary : Colors.white,
          foregroundColor: filled ? Colors.white : AppColors.primary,
          padding: const EdgeInsets.symmetric(vertical: 12),
          side: filled ? null : const BorderSide(color: AppColors.primary),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
        ),
        icon: Icon(icon, size: 18),
        label: Text(
          label,
          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
        ),
      ),
    );
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
              _ProfileAvatar(user: user),
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
        const SizedBox(height: 16),

        // Add Product / Add Reel — right under the avatar rather than the
        // AppBar, where two labeled buttons plus the brand icon and title
        // had no room to breathe.
        if (user.isSeller) ...[
          Row(
            children: [
              _AddProductButton(user: user),
              const SizedBox(width: 10),
              const _AddReelButton(),
            ],
          ),
          const SizedBox(height: 24),
        ] else
          const SizedBox(height: 8),

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

        // Real, live mini-dashboard — sellers can glance at their basic
        // numbers without leaving Profile for the full Dashboard.
        if (user.isSeller) ...[
          _MiniDashboardCard(user: user),
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

        // Account menu — mirrors web's Account dropdown (Dashboard / My
        // Orders / Settings / Logout). Language now lives in Settings along
        // with any future non-essential options, keeping this list lean.
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
            if (user.isSeller)
              _LinkRow(
                icon: Icons.star_outline,
                label: isHindi ? 'सदस्यता' : 'Subscription',
                onTap: () => context.push('/subscription'),
              ),
            if (user.isSeller)
              _LinkRow(
                icon: Icons.video_collection_outlined,
                label: isHindi ? 'रील्स' : 'Reels',
                onTap: () => context.push('/dashboard/reels'),
              ),
            _LinkRow(
              icon: Icons.receipt_long_outlined,
              label: isHindi ? 'ऑर्डर' : 'Orders',
              onTap: () => context.push('/orders'),
            ),
            _LinkRow(
              icon: Icons.settings_outlined,
              label: isHindi ? 'सेटिंग्स' : 'Settings',
              onTap: () => context.push('/profile/settings'),
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

/// Shows the seller's real profile photo when they've set one — on web or
/// mobile — falling back to the initial-letter avatar otherwise. Sellers set
/// this photo via the web dashboard's Profile page today (`profiles/{phone}
/// .logo`, mirrored to `retailers/{phone}.logo`); no separate mobile upload
/// flow exists yet. Reuses `retailerProfileProvider`, the same provider
/// `ShopProfileScreen` already reads this field from — no new Firestore
/// query. Consumers have no `profiles/{phone}` doc, so this only queries for
/// sellers.
class _ProfileAvatar extends ConsumerWidget {
  final dynamic user;
  const _ProfileAvatar({required this.user});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final String? logo = user.isSeller
        ? ref.watch(retailerProfileProvider(user.phone as String)).value?.logo
        : null;
    final hasLogo = logo != null && logo.isNotEmpty;

    return CircleAvatar(
      radius: 40,
      backgroundColor: AppColors.primaryContainer,
      backgroundImage: hasLogo ? CachedNetworkImageProvider(logo) : null,
      child: hasLogo
          ? null
          : Text(
              user.name.isNotEmpty ? user.name[0].toUpperCase() : '?',
              style: AppTextStyles.heading1.copyWith(
                color: AppColors.primary,
                fontSize: 32,
              ),
            ),
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

/// Real, live stats summary for sellers — reuses the exact same providers
/// `DashboardHomeScreen`'s `_OverviewGrid` and `storeReviewsProvider`
/// (`marketplace_provider.dart`, already used by `brand_screen.dart`) rely
/// on, just rendered compactly, so numbers here always match elsewhere in
/// the app. Shown for paid and unpaid sellers alike since it's read-only.
class _MiniDashboardCard extends ConsumerWidget {
  final dynamic user;
  const _MiniDashboardCard({required this.user});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final String phone = user.phone as String;
    final isManufacturer = ref.watch(isManufacturerProvider);
    final listingsAsync = ref.watch(myListingsProvider(phone));
    final reviewsAsync = ref.watch(storeReviewsProvider(phone));
    final analyticsAsync =
        isManufacturer ? ref.watch(manufacturerAnalyticsProvider(phone)) : null;
    // networkStatsProvider's 'total' counts every non-revoked retailer
    // (active AND still-invited/pending) — manufacturerAnalyticsProvider's
    // 'activeRetailers' only counts active ones, which is why this tile
    // read 0 for a manufacturer who had only invited retailers so far.
    final networkStatsAsync =
        isManufacturer ? ref.watch(networkStatsProvider(phone)) : null;

    final loading = listingsAsync.isLoading || reviewsAsync.isLoading;

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
          Text('My Business', style: AppTextStyles.heading3),
          const SizedBox(height: 12),
          if (loading)
            const SizedBox(
              height: 60,
              child: Center(
                  child: CircularProgressIndicator(strokeWidth: 2)),
            )
          else
            _statsGrid(
              context,
              listingsAsync.value ?? const [],
              reviewsAsync.value ?? const [],
              analyticsAsync?.value,
              networkStatsAsync?.value,
              isManufacturer,
            ),
          Align(
            alignment: Alignment.centerRight,
            child: TextButton(
              onPressed: () => context.push('/dashboard'),
              child: const Text('View Full Dashboard'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _statsGrid(
    BuildContext context,
    List<ListingModel> listings,
    List<dynamic> reviews,
    Map<String, int>? analytics,
    Map<String, int>? networkStats,
    bool isManufacturer,
  ) {
    final products = isManufacturer
        ? (analytics?['catalogProducts'] ?? listings.length)
        : listings.length;
    final views = listings.fold<int>(0, (sum, l) => sum + l.clicks);

    final tiles = <Widget>[
      _MiniStat(
        icon: Icons.inventory_2_outlined,
        label: 'Products',
        value: '$products',
        color: AppColors.primary,
        onTap: () => context.push(isManufacturer
            ? '/dashboard/manufacturer/catalog'
            : '/dashboard/inventory'),
      ),
      if (isManufacturer)
        _MiniStat(
          icon: Icons.store_outlined,
          label: 'Retailers',
          // Total (active + still-invited), not just active — a
          // manufacturer who's only invited retailers so far should still
          // see that count here, not 0. Tapping through to the Retailer
          // Network screen shows which ones are pending vs active.
          value: '${networkStats?['total'] ?? 0}',
          color: AppColors.success,
          onTap: () => context.push('/dashboard/manufacturer/retailers'),
        ),
      _MiniStat(
        icon: Icons.star_outline,
        label: 'Reviews',
        value: '${reviews.length}',
        color: AppColors.secondary,
        onTap: () => context.push('/dashboard/reviews'),
      ),
      _MiniStat(
        icon: Icons.visibility_outlined,
        label: 'Views',
        value: '$views',
        color: AppColors.info,
        onTap: () => context.push('/dashboard/analytics'),
      ),
    ];

    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisSpacing: 10,
      mainAxisSpacing: 10,
      childAspectRatio: 2.4,
      children: tiles,
    );
  }
}

class _MiniStat extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final Color color;
  final VoidCallback? onTap;
  const _MiniStat({
    required this.icon,
    required this.label,
    required this.value,
    required this.color,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final content = Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          Icon(icon, color: color, size: 18),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerLeft,
                  child: Text(
                    value,
                    style: AppTextStyles.bodyMedium
                        .copyWith(fontWeight: FontWeight.w800, color: color),
                  ),
                ),
                Text(
                  label,
                  style: AppTextStyles.caption,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
        ],
      ),
    );

    if (onTap == null) return content;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: content,
    );
  }
}
