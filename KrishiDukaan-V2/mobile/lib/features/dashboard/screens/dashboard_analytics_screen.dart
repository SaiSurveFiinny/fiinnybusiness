import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/models/order_model.dart';
import '../../../core/providers/user_provider.dart';
import '../../../core/utils/currency_utils.dart';
import '../data/store_analytics.dart';
import '../providers/dashboard_provider.dart';

/// Seller Analytics: orders and revenue from the seller's own orders, plus the
/// reach and engagement figures the weekly/monthly/yearly digest notification
/// quotes (store views, product views, calls, followers, reel interactions).
///
/// The digest links here with `?period=week|month|year`, so whichever window
/// the notification summarised is the one that opens.
class DashboardAnalyticsScreen extends ConsumerStatefulWidget {
  /// 'week' | 'month' | 'year' from an analytics_digest notification.
  final String? initialPeriod;

  const DashboardAnalyticsScreen({super.key, this.initialPeriod});

  @override
  ConsumerState<DashboardAnalyticsScreen> createState() =>
      _DashboardAnalyticsScreenState();
}

class _DashboardAnalyticsScreenState
    extends ConsumerState<DashboardAnalyticsScreen> {
  late AnalyticsPeriod _period;

  @override
  void initState() {
    super.initState();
    _period = AnalyticsPeriod.fromKey(widget.initialPeriod);
  }

  @override
  Widget build(BuildContext context) {
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
          : Column(
              children: [
                _PeriodSelector(
                  selected: _period,
                  onChanged: (p) => setState(() => _period = p),
                ),
                Expanded(
                  child: _Body(sellerPhone: user.phone, period: _period),
                ),
              ],
            ),
    );
  }
}

/// Week / Month / Year segmented control.
class _PeriodSelector extends StatelessWidget {
  final AnalyticsPeriod selected;
  final ValueChanged<AnalyticsPeriod> onChanged;

  const _PeriodSelector({required this.selected, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Container(
      color: Colors.white,
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
      child: Row(
        children: [
          for (final p in AnalyticsPeriod.values) ...[
            Expanded(
              child: GestureDetector(
                onTap: () => onChanged(p),
                child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 9),
                  decoration: BoxDecoration(
                    color: p == selected
                        ? AppColors.primary
                        : AppColors.primaryContainer.withValues(alpha: 0.3),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(
                    p.label,
                    textAlign: TextAlign.center,
                    style: AppTextStyles.bodyMedium.copyWith(
                      color: p == selected
                          ? Colors.white
                          : AppColors.onSurfaceVariant,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),
            ),
            if (p != AnalyticsPeriod.values.last) const SizedBox(width: 8),
          ],
        ],
      ),
    );
  }
}

class _Body extends ConsumerWidget {
  final String sellerPhone;
  final AnalyticsPeriod period;
  const _Body({required this.sellerPhone, required this.period});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ordersAsync = ref.watch(sellerOrdersProvider(sellerPhone));
    final reachAsync = ref.watch(
        storeAnalyticsProvider((phone: sellerPhone, period: period)));

    return ordersAsync.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (_, _) => const Center(child: Text('Failed to load analytics.')),
      data: (orders) => _Content(
        orders: orders,
        period: period,
        reach: reachAsync,
      ),
    );
  }
}

class _Content extends StatelessWidget {
  final List<OrderModel> orders;
  final AnalyticsPeriod period;
  final AsyncValue<StoreAnalytics> reach;

  const _Content({
    required this.orders,
    required this.period,
    required this.reach,
  });

  @override
  Widget build(BuildContext context) {
    // Scope orders to the selected window so the revenue figure and the reach
    // figures below it describe the same stretch of time.
    final cutoff = DateTime.now().subtract(Duration(days: period.days));
    final inPeriod = orders
        .where((o) => o.createdAt == null || o.createdAt!.isAfter(cutoff))
        .toList();
    final valid = inPeriod.where((o) => o.status != 'cancelled').toList();
    final totalRevenue = valid.fold<double>(0, (sum, o) => sum + o.total);
    final totalOrders = inPeriod.length;

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

        // ── Reach & engagement ────────────────────────────────────────────
        // The same counters the analytics_digest notification quotes.
        Text('Reach & Engagement', style: AppTextStyles.heading3),
        const SizedBox(height: 12),
        reach.when(
          loading: () => const _Card(
            children: [
              SizedBox(
                height: 80,
                child: Center(child: CircularProgressIndicator()),
              ),
            ],
          ),
          error: (_, _) =>
              _EmptyCard(message: 'Could not load engagement stats'),
          data: (r) => _ReachGrid(reach: r),
        ),
        const SizedBox(height: 20),

        // The trend chart is always a 7-day view — a 365-bar chart on the
        // Year tab would be unreadable on a phone.
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

/// Two-column grid of reach counters. Zeroes are shown rather than hidden —
/// "0 store views this week" is itself the useful signal for a seller.
class _ReachGrid extends StatelessWidget {
  final StoreAnalytics reach;
  const _ReachGrid({required this.reach});

  @override
  Widget build(BuildContext context) {
    final tiles = <({String label, int value, IconData icon, Color color})>[
      (
        label: 'Store views',
        value: reach.storeViews,
        icon: Icons.storefront_outlined,
        color: AppColors.primary
      ),
      (
        label: 'Product views',
        value: reach.productViews,
        icon: Icons.visibility_outlined,
        color: AppColors.info
      ),
      (
        label: 'Product taps',
        value: reach.productClicks,
        icon: Icons.touch_app_outlined,
        color: AppColors.info
      ),
      (
        label: 'Calls',
        value: reach.calls,
        icon: Icons.call_outlined,
        color: AppColors.success
      ),
      (
        label: 'Directions',
        value: reach.directionRequests,
        icon: Icons.directions_outlined,
        color: AppColors.success
      ),
      (
        label: 'Followers',
        value: reach.followers,
        icon: Icons.people_alt_outlined,
        color: AppColors.primary
      ),
      (
        label: 'Reel views',
        value: reach.reelViews,
        icon: Icons.play_circle_outline,
        color: AppColors.info
      ),
      (
        label: 'Interactions',
        value: reach.interactions,
        icon: Icons.favorite_border,
        color: AppColors.error
      ),
    ];

    return Column(
      children: [
        for (var i = 0; i < tiles.length; i += 2) ...[
          if (i > 0) const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _StatCard(
                  label: tiles[i].label,
                  value: '${tiles[i].value}',
                  icon: tiles[i].icon,
                  color: tiles[i].color,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: i + 1 < tiles.length
                    ? _StatCard(
                        label: tiles[i + 1].label,
                        value: '${tiles[i + 1].value}',
                        icon: tiles[i + 1].icon,
                        color: tiles[i + 1].color,
                      )
                    : const SizedBox(),
              ),
            ],
          ),
        ],
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
