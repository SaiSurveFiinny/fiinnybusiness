import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../constants/app_colors.dart';
import '../constants/app_text_styles.dart';
import '../providers/deliver_to_provider.dart';

/// "📍 Deliver to 411038" in the marketplace chip row. Logged-in shoppers
/// start with their profile address; anyone can type another pincode to see
/// prices and dates delivered there. Mirror of the web's DeliverToChip.
class DeliverToChip extends ConsumerWidget {
  const DeliverToChip({super.key});

  Future<void> _change(BuildContext context, WidgetRef ref, String current) async {
    final ctrl = TextEditingController(text: current);
    final next = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Deliver to'),
        content: TextField(
          controller: ctrl,
          autofocus: true,
          keyboardType: TextInputType.number,
          maxLength: 6,
          decoration: const InputDecoration(hintText: 'Enter 6-digit pincode'),
          onSubmitted: (v) => Navigator.pop(ctx, v.trim()),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, ctrl.text.trim()), child: const Text('Apply')),
        ],
      ),
    );
    if (next == null) return;
    await ref.read(deliverToProvider.notifier).choose(next);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final to = ref.watch(deliverToProvider);
    final label = to == null
        ? 'Pincode for delivered prices'
        : 'Deliver to ${to.city != null ? '${to.city} ' : ''}${to.pincode}';
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: ActionChip(
        avatar: const Icon(Icons.location_on_outlined, size: 16, color: AppColors.primary),
        label: Text(label, style: AppTextStyles.caption.copyWith(fontWeight: FontWeight.w600)),
        backgroundColor: Colors.white,
        side: const BorderSide(color: AppColors.divider),
        onPressed: () => _change(context, ref, to?.pincode ?? ''),
      ),
    );
  }
}
