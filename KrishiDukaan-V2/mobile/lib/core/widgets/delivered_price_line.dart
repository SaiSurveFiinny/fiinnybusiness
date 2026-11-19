import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../constants/app_colors.dart';
import '../constants/app_text_styles.dart';
import '../models/catalog_model.dart';
import '../providers/deliver_to_provider.dart';
import '../services/delivered_price_service.dart';
import '../utils/delivery_date.dart';

/// Under a card's price: "₹532 delivered · by Sat, 21 Nov" (or "FREE
/// delivery · by …") for the shopper's "Deliver to" pincode — the cheapest of
/// the product's sellers once delivery is counted. Mirror of the web's
/// DeliveredPriceLine. Grids build only the cards near the screen, so only
/// those are priced. Nothing shows without a pincode, while loading, or when
/// it can't be priced, so the card never shows a wrong number.
class DeliveredPriceLine extends ConsumerStatefulWidget {
  final CatalogModel product;

  /// A store's own page: price only this store's offer.
  final String? seller;

  /// Shown until (and unless) there is a delivered price — e.g. the card's
  /// "2 km away" row, which this line replaces so the card keeps its height.
  final Widget fallback;
  final double fontSize;
  const DeliveredPriceLine({
    super.key,
    required this.product,
    this.seller,
    this.fallback = const SizedBox.shrink(),
    this.fontSize = 10,
  });

  @override
  ConsumerState<DeliveredPriceLine> createState() => _DeliveredPriceLineState();
}

class _DeliveredPriceLineState extends ConsumerState<DeliveredPriceLine> {
  DeliveredResult? _best;
  String _asked = '';

  void _ask(String? pin) {
    final offers = cardOffers(widget.product, onlySeller: widget.seller);
    final sig = '${pin ?? ''}#${offers.map((o) => o.id).join('¦')}';
    if (sig == _asked) return;
    _asked = sig;
    // Called from build: no setState here, only from the async answers below.
    _best = null;
    if (pin == null || offers.isEmpty) return;
    final svc = DeliveredPriceService.instance;
    final results = <String, DeliveredResult?>{};
    void update() {
      if (!mounted || _asked != sig) return;
      final ranked = rankDelivered(offers, (o) => results[o.id]);
      final r = ranked.isEmpty ? null : results[ranked.first.id];
      setState(() => _best = (r != null && r.ok) ? r : null);
    }

    for (final o in offers) {
      svc.get(pin, o).then((r) {
        results[o.id] = r;
        update();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final pin = ref.watch(deliverToProvider)?.pincode;
    _ask(pin);
    final best = _best;
    if (best == null) return widget.fallback;
    final date = formatDeliveryDate(best.deliveryBy);
    final total = best.total!;
    return Row(
      children: [
        Icon(
          Icons.local_shipping_outlined,
          size: widget.fontSize + 2,
          color: AppColors.success,
        ),
        const SizedBox(width: 3),
        Flexible(
          child: Text(
            [
              best.free
                  ? 'FREE delivery'
                  : '₹${total == total.roundToDouble() ? total.toInt() : total.toStringAsFixed(2)} delivered',
              if (date != null) 'by $date',
            ].join(' · '),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: AppTextStyles.caption.copyWith(
              fontSize: widget.fontSize,
              fontWeight: FontWeight.w600,
              color: best.free ? AppColors.success : AppColors.onSurfaceVariant,
            ),
          ),
        ),
      ],
    );
  }
}
