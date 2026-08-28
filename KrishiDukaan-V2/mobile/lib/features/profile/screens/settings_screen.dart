import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/providers/locale_provider.dart';
import '../../../core/providers/user_provider.dart';
import '../../dashboard/data/dashboard_repository.dart';

/// Home for account settings that don't belong on the main Profile screen
/// (currently just Language) — moved out of Profile to keep that screen a
/// lean account menu, with room for more settings later without cluttering
/// Profile again.
class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final locale = ref.watch(localeProvider);
    final isHindi = locale.languageCode == 'hi';
    final user = ref.watch(currentUserProvider).value;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        title: Text('Settings',
            style: AppTextStyles.heading2.copyWith(color: Colors.white)),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _Card(
            title: 'Language',
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
          // Sellers only — a consumer account has nothing to sell online.
          if (user != null && user.isSeller) ...[
            const SizedBox(height: 16),
            _Card(
              title: isHindi ? 'ऑनलाइन बिक्री' : 'Online Selling',
              children: [
                _OnlineDeliveryToggle(
                  sellerPhone: user.phone,
                  isManufacturer: user.isManufacturer,
                  isHindi: isHindi,
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

/// One switch that turns the seller's online selling on or off across their
/// WHOLE catalogue, so they never have to edit every product individually.
///
/// Writes the same `onlineDelivery` flag web reads (users/ + profiles/ +
/// retailers|manufacturers/), so the two platforms always agree — see
/// DashboardRepository.setAccountOnlineDelivery.
class _OnlineDeliveryToggle extends ConsumerStatefulWidget {
  final String sellerPhone;
  final bool isManufacturer;
  final bool isHindi;

  const _OnlineDeliveryToggle({
    required this.sellerPhone,
    required this.isManufacturer,
    required this.isHindi,
  });

  @override
  ConsumerState<_OnlineDeliveryToggle> createState() =>
      _OnlineDeliveryToggleState();
}

class _OnlineDeliveryToggleState extends ConsumerState<_OnlineDeliveryToggle> {
  final _repo = DashboardRepository();
  bool? _enabled;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final value = await _repo.fetchAccountOnlineDelivery(
      widget.sellerPhone,
      isManufacturer: widget.isManufacturer,
    );
    if (mounted) setState(() => _enabled = value);
  }

  Future<void> _set(bool value) async {
    final previous = _enabled;
    // Optimistic: the switch should feel instant, but revert on failure so it
    // never shows a state the server didn't accept.
    setState(() {
      _enabled = value;
      _saving = true;
    });
    try {
      await _repo.setAccountOnlineDelivery(
        widget.sellerPhone,
        enabled: value,
        isManufacturer: widget.isManufacturer,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(value
              ? 'Online selling turned on.'
              : 'Online selling turned off for all your products.'),
          backgroundColor: AppColors.primary,
        ),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => _enabled = previous);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Could not update: $e'),
          backgroundColor: AppColors.error,
        ),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isHindi = widget.isHindi;
    if (_enabled == null) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 12),
        child: Center(
          child: SizedBox(
            width: 20,
            height: 20,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
        ),
      );
    }
    return SwitchListTile(
      contentPadding: EdgeInsets.zero,
      value: _enabled!,
      activeThumbColor: AppColors.primary,
      onChanged: _saving ? null : _set,
      title: Text(
        isHindi ? 'ऑनलाइन डिलीवरी' : 'Online delivery',
        style: AppTextStyles.bodyMedium,
      ),
      subtitle: Text(
        _enabled!
            ? (isHindi
                ? 'ग्राहक आपके उत्पाद ऑनलाइन ऑर्डर कर सकते हैं।'
                : 'Customers can order your products online.')
            : (isHindi
                ? 'ऑनलाइन ऑर्डर बंद हैं। आपकी दुकान अब भी दिखेगी।'
                : 'Online ordering is off. Your store still stays listed.'),
        style: AppTextStyles.bodySmall
            .copyWith(color: AppColors.onSurfaceVariant),
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
