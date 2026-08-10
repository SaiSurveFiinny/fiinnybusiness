import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/models/order_model.dart';
import '../../../core/providers/user_provider.dart';
import '../../../core/utils/currency_utils.dart';
import '../providers/dashboard_provider.dart';

/// Minimal seller Analytics screen mirroring web's /dashboard/analytics
/// (orders/revenue + top products), built entirely from data already fetched
/// elsewhere in the app (DashboardRepository.watchSellerOrders — no new
/// backend work). Web's engagement metrics (impressions/CTR/views) are
/// skipped: mobile never writes those tracking fields, so there's nothing
/// real to show for them yet.
class DashboardAnalyticsScreen extends ConsumerWidget {
  const DashboardAnalyticsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider).value;
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        title: Text('Analytics',
            style: AppTextStyles.heading2.copyWith(color: Colors.white)),
      ),
      body: user == null
          ? const Center(child: Text('Not logged in.'))
          : _Body(sellerPhone: user.phone),
    );
  }
}

class _Body extends ConsumerWidget {
  final String sellerPhone;
  const _Body({required this.sellerPhone});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ordersAsync = ref.watch(sellerOrdersProvider(sellerPhone));

    return ordersAsync.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (_, _) => const Center(child: Text('Failed to load analytics.')),
      data: (orders) => _Content(orders: orders),
    );
  }
}

class _Content extends StatelessWidget {
  final List<OrderModel> orders;
  const _Content({required this.orders});

  @override
  Widget build(BuildContext context) {
    final valid = orders.where((o) => o.status != 'cancelled').toList();
    final totalRevenue = valid.fold<double>(0, (sum, o) => sum + o.total);
    final totalOrders = orders.length;

    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final days = List.generate(7, (i) => today.subtract(Duration(days: 6 - i)));
    final dayRevenue = {for (final d in days) d: 0.0};
    for (final o in valid) {
      final created = o.createdAt;
      if (created == null) continue;
      final day = DateTime(created.year, created.month, created.day);
      if (dayRevenue.containsKey(day)) {
        dayRevenue[day] = dayRevenue[day]! + o.total;
      }
    }
    final maxRevenue = dayRevenue.values.fold<double>(0, (m, v) => v > m ? v : m);

    final productRevenue = <String, double>{};
    final productQty = <String, int>{};
    for (final o in valid) {
      for (final item in o.items) {
        final name = item.name.isNotEmpty ? item.name : 'Product';
        productRevenue[name] = (productRevenue[name] ?? 0) + item.lineTotal;
        productQty[name] = (productQty[name] ?? 0) + item.quantity;
      }
    }
    final topProducts = productRevenue.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Row(
          children: [
            Expanded(
              child: _StatCard(
                label: 'Total Orders',
                value: '$totalOrders',
                icon: Icons.receipt_long_outlined,
                color: AppColors.primary,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _StatCard(
                label: 'Total Revenue',
                value: CurrencyUtils.format(totalRevenue),
                icon: Icons.currency_rupee,
                color: AppColors.success,
              ),
            ),
          ],
        ),
        const SizedBox(height: 20),
        Text('Last 7 Days', style: AppTextStyles.heading3),
        const SizedBox(height: 12),
        _TrendCard(days: days, revenue: dayRevenue, maxRevenue: maxRevenue),
        const SizedBox(height: 20),
        Text('Top Products', style: AppTextStyles.heading3),
        const SizedBox(height: 12),
        if (topProducts.isEmpty)
          _EmptyCard(message: 'No sales yet')
        else
          _Card(
            children: [
              for (var i = 0; i < topProducts.length && i < 10; i++) ...[
                if (i > 0) const Divider(height: 1),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(topProducts[i].key, style: AppTextStyles.bodyMedium),
                  subtitle: Text('${productQty[topProducts[i].key]} sold'),
                  trailing: Text(
                    CurrencyUtils.format(topProducts[i].value),
                    style: AppTextStyles.bodyMedium
                        .copyWith(fontWeight: FontWeight.w700),
                  ),
                ),
              ],
            ],
          ),
        const SizedBox(height: 40),
      ],
    );
  }
}

class _StatCard extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color color;
  const _StatCard(
      {required this.label,
      required this.value,
      required this.icon,
      required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
              color: AppColors.cardShadow, blurRadius: 4, offset: const Offset(0, 2)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: color, size: 20),
          const SizedBox(height: 8),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(value, style: AppTextStyles.heading2.copyWith(color: color)),
          ),
          Text(label, style: AppTextStyles.caption),
        ],
      ),
    );
  }
}

class _TrendCard extends StatelessWidget {
  final List<DateTime> days;
  final Map<DateTime, double> revenue;
  final double maxRevenue;
  const _TrendCard(
      {required this.days, required this.revenue, required this.maxRevenue});

  static const _weekdayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
              color: AppColors.cardShadow, blurRadius: 4, offset: const Offset(0, 2)),
        ],
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: [
          for (final day in days)
            Column(
              children: [
                Text(
                  maxRevenue > 0
                      ? CurrencyUtils.format(revenue[day] ?? 0)
                      : '',
                  style: AppTextStyles.caption.copyWith(fontSize: 9),
                ),
                const SizedBox(height: 4),
                Container(
                  width: 20,
                  height: 4 +
                      (maxRevenue > 0
                          ? ((revenue[day] ?? 0) / maxRevenue) * 80
                          : 0),
                  decoration: BoxDecoration(
                    color: AppColors.primary,
                    borderRadius: BorderRadius.circular(4),
                  ),
                ),
                const SizedBox(height: 6),
                Text(_weekdayLabels[day.weekday - 1], style: AppTextStyles.caption),
              ],
            ),
        ],
      ),
    );
  }
}

class _Card extends StatelessWidget {
  final List<Widget> children;
  const _Card({required this.children});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
              color: AppColors.cardShadow, blurRadius: 4, offset: const Offset(0, 2)),
        ],
      ),
      child: Column(children: children),
    );
  }
}

class _EmptyCard extends StatelessWidget {
  final String message;
  const _EmptyCard({required this.message});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.divider),
      ),
      child: Center(child: Text(message, style: AppTextStyles.bodyMedium)),
    );
  }
}
