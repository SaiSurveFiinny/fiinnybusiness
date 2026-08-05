import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/providers/user_provider.dart';

class _DrawerItem {
  final IconData icon;
  final String label;
  final String route;
  const _DrawerItem(this.icon, this.label, this.route);
}

/// Mirrors web's persistent dashboard sidebar (app/dashboard/_components/
/// sidebar.tsx) — same 11 destinations, same order, same role conditionals.
/// Opened only from the Overview screen's AppBar; leaf dashboard screens keep
/// their normal back-button navigation instead of repeating this drawer.
class DashboardDrawer extends ConsumerWidget {
  const DashboardDrawer({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider).value;
    final isManufacturer = ref.watch(isManufacturerProvider);
    final isSeller = user?.isSeller ?? false;

    final items = <_DrawerItem>[
      const _DrawerItem(Icons.dashboard_outlined, 'Overview', '/dashboard'),
      const _DrawerItem(
          Icons.bar_chart_outlined, 'Analytics', '/dashboard/analytics'),
      _DrawerItem(
        Icons.inventory_2_outlined,
        'Inventory',
        isManufacturer
            ? '/dashboard/manufacturer/catalog'
            : '/dashboard/inventory',
      ),
      if (isManufacturer)
        const _DrawerItem(Icons.groups_outlined, 'Retailer network',
            '/dashboard/manufacturer/retailers'),
      if (isSeller)
        const _DrawerItem(
            Icons.credit_card_outlined, 'Subscription', '/subscription'),
      const _DrawerItem(
          Icons.video_collection_outlined, 'Reels', '/dashboard/reels'),
      const _DrawerItem(
          Icons.receipt_long_outlined, 'Orders', '/dashboard/orders'),
      const _DrawerItem(Icons.local_shipping_outlined, 'Delivery Settings',
          '/dashboard/delivery'),
      const _DrawerItem(
          Icons.star_outline, 'Reviews', '/dashboard/reviews'),
      if (isManufacturer)
        const _DrawerItem(Icons.business_outlined, 'Company Page',
            '/dashboard/manufacturer/brand'),
      const _DrawerItem(
          Icons.account_circle_outlined, 'Profile', '/dashboard/profile'),
    ];

    return Drawer(
      child: SafeArea(
        child: ListView(
          padding: EdgeInsets.zero,
          children: [
            Container(
              padding: const EdgeInsets.fromLTRB(20, 24, 20, 20),
              color: AppColors.primary,
              child: Row(
                children: [
                  const Icon(Icons.storefront, color: Colors.white, size: 28),
                  const SizedBox(width: 10),
                  Text('Dashboard',
                      style:
                          AppTextStyles.heading2.copyWith(color: Colors.white)),
                ],
              ),
            ),
            for (final item in items)
              ListTile(
                leading: Icon(item.icon, color: AppColors.primary),
                title: Text(item.label, style: AppTextStyles.bodyMedium),
                onTap: () {
                  Navigator.of(context).pop();
                  context.push(item.route);
                },
              ),
          ],
        ),
      ),
    );
  }
}
