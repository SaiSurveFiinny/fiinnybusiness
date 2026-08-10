import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/models/catalog_model.dart';
import '../../../core/models/network_retailer_model.dart';
import '../../../core/providers/user_provider.dart';
import '../../../core/utils/currency_utils.dart';
import '../../../core/widgets/error_view.dart';
import '../data/manufacturer_repository.dart';
import '../providers/manufacturer_provider.dart';

class AssignProductScreen extends ConsumerStatefulWidget {
  final String? initialRetailerPhone;
  const AssignProductScreen({super.key, this.initialRetailerPhone});

  @override
  ConsumerState<AssignProductScreen> createState() =>
      _AssignProductScreenState();
}

class _AssignProductScreenState
    extends ConsumerState<AssignProductScreen> {
  CatalogModel? _selectedProduct;
  final Set<String> _selectedRetailers = {};
  bool _saving = false;

  final _productSearchCtrl = TextEditingController();
  final _retailerSearchCtrl = TextEditingController();
  String _productQuery = '';
  String _retailerQuery = '';

  // Reveal-more pagination for the retailer list — a manufacturer with a
  // large network only pays the render cost for the retailers actually
  // shown, not the whole list at once. Resets whenever the search query
  // changes so "Show more" always starts fresh against the new filter.
  static const _kRetailerPageSize = 10;
  int _retailerRevealCount = _kRetailerPageSize;

  @override
  void initState() {
    super.initState();
    if (widget.initialRetailerPhone != null) {
      _selectedRetailers.add(widget.initialRetailerPhone!);
    }
  }

  @override
  void dispose() {
    _productSearchCtrl.dispose();
    _retailerSearchCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final userAsync = ref.watch(currentUserProvider);
    return userAsync.when(
      loading: () =>
          const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (_, _) =>
          const Scaffold(body: ErrorView(message: 'Not logged in.')),
      data: (user) {
        if (user == null) {
          return const Scaffold(body: ErrorView(message: 'Not logged in.'));
        }
        return _buildScaffold(user.phone, user.name);
      },
    );
  }

  Widget _buildScaffold(String phone, String name) {
    final catalogAsync = ref.watch(manufacturerCatalogProvider(phone));
    final networkAsync = ref.watch(retailerNetworkProvider(phone));

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        title: Text('Assign Products',
            style: AppTextStyles.heading2.copyWith(color: Colors.white)),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Step 1: Choose product
            _StepHeader(
                number: '1', title: 'Choose a product to assign'),
            const SizedBox(height: 12),
            catalogAsync.when(
              loading: () =>
                  const Center(child: CircularProgressIndicator()),
              error: (_, _) =>
                  const ErrorView(message: 'Could not load catalog.'),
              data: (products) {
                if (products.isEmpty) {
                  return const Text(
                    'No products in catalog. Add products first.',
                    style: TextStyle(color: AppColors.onSurfaceVariant),
                  );
                }
                final q = _productQuery.trim().toLowerCase();
                final filtered = q.isEmpty
                    ? products
                    : products
                        .where((p) =>
                            p.name.toLowerCase().contains(q) ||
                            p.category.toLowerCase().contains(q))
                        .toList();
                return Column(
                  children: [
                    _SearchField(
                      controller: _productSearchCtrl,
                      hintText: 'Search products...',
                      onChanged: (v) => setState(() => _productQuery = v),
                    ),
                    const SizedBox(height: 10),
                    if (filtered.isEmpty)
                      Text(
                        'No products match "$_productQuery"',
                        style: const TextStyle(color: AppColors.onSurfaceVariant),
                      )
                    else
                      ...filtered.map((p) => _ProductSelectionTile(
                            product: p,
                            isSelected: _selectedProduct?.id == p.id,
                            onTap: () =>
                                setState(() => _selectedProduct = p),
                          )),
                  ],
                );
              },
            ),
            const SizedBox(height: 24),

            // Step 2: Choose retailers
            _StepHeader(
                number: '2',
                title: 'Select retailers to assign to'),
            const SizedBox(height: 12),
            networkAsync.when(
              loading: () =>
                  const Center(child: CircularProgressIndicator()),
              error: (_, _) =>
                  const ErrorView(message: 'Could not load network.'),
              data: (retailers) {
                // Every non-revoked retailer, active or still invited —
                // assignProductToRetailer writes purely by phone number, no
                // existing account required, so the assignment is already
                // waiting for an invited retailer the moment they sign in
                // and open their store/profile. Hiding them here was a
                // mobile-only restriction; web imposes none.
                if (retailers.isEmpty) {
                  return const Text(
                    'No retailers in your network yet. Invite retailers first.',
                    style: TextStyle(color: AppColors.onSurfaceVariant),
                  );
                }
                final q = _retailerQuery.trim().toLowerCase();
                final filtered = q.isEmpty
                    ? retailers
                    : retailers
                        .where((r) =>
                            r.shopName.toLowerCase().contains(q) ||
                            r.ownerName.toLowerCase().contains(q) ||
                            r.phone.toLowerCase().contains(q))
                        .toList();
                return Column(
                  children: [
                    _SearchField(
                      controller: _retailerSearchCtrl,
                      hintText: 'Search retailers...',
                      onChanged: (v) => setState(() {
                        _retailerQuery = v;
                        _retailerRevealCount = _kRetailerPageSize;
                      }),
                    ),
                    const SizedBox(height: 10),
                    if (filtered.isEmpty)
                      Text(
                        'No retailers match "$_retailerQuery"',
                        style: const TextStyle(color: AppColors.onSurfaceVariant),
                      )
                    else ...[
                      ...filtered
                          .take(_retailerRevealCount)
                          .map((r) => _RetailerSelectionTile(
                                retailer: r,
                                isSelected:
                                    _selectedRetailers.contains(r.phone),
                                onToggle: () => setState(() {
                                  if (_selectedRetailers
                                      .contains(r.phone)) {
                                    _selectedRetailers.remove(r.phone);
                                  } else {
                                    _selectedRetailers.add(r.phone);
                                  }
                                }),
                              )),
                      if (_retailerRevealCount < filtered.length)
                        Padding(
                          padding: const EdgeInsets.only(top: 4),
                          child: OutlinedButton(
                            onPressed: () => setState(() {
                              _retailerRevealCount +=
                                  _kRetailerPageSize;
                            }),
                            child: Text(
                              'Show ${(filtered.length - _retailerRevealCount).clamp(0, _kRetailerPageSize)} more',
                            ),
                          ),
                        ),
                    ],
                  ],
                );
              },
            ),
            const SizedBox(height: 24),

            // Assign button — always visible so the user knows it exists
            Builder(builder: (context) {
              final canAssign = _selectedProduct != null &&
                  _selectedRetailers.isNotEmpty &&
                  !_saving;
              String label;
              if (_saving) {
                label = 'Assigning…';
              } else if (_selectedProduct == null &&
                  _selectedRetailers.isEmpty) {
                label = 'Select a product and retailer(s) above';
              } else if (_selectedProduct == null) {
                label = 'Select a product first (Step 1)';
              } else if (_selectedRetailers.isEmpty) {
                label = 'Select at least one retailer (Step 2)';
              } else {
                label =
                    'Assign to ${_selectedRetailers.length} retailer${_selectedRetailers.length != 1 ? 's' : ''}';
              }
              return SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: canAssign ? () => _assign(phone) : null,
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    disabledBackgroundColor:
                        AppColors.primary.withValues(alpha: 0.4),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                  child: _saving
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white))
                      : Text(label, style: AppTextStyles.button),
                ),
              );
            }),
            const SizedBox(height: 80),
          ],
        ),
      ),
    );
  }

  Future<void> _assign(String manufacturerPhone) async {
    final product = _selectedProduct!;
    final networkAsync =
        ref.read(retailerNetworkProvider(manufacturerPhone));
    final retailers = networkAsync.value ?? [];

    setState(() => _saving = true);
    try {
      final repo = ManufacturerRepository();
      for (final phone in _selectedRetailers) {
        final retailer = retailers.firstWhere((r) => r.phone == phone);
        await repo.assignProductToRetailer(
          catalogId: product.id,
          catalogName: product.name,
          retailerPhone: phone,
          retailerName: retailer.shopName,
          manufacturerPhone: manufacturerPhone,
          price: product.price,
        );
      }
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
                'Assigned "${product.name}" to ${_selectedRetailers.length} retailer(s)'),
            backgroundColor: AppColors.success,
          ),
        );
        setState(() {
          _selectedProduct = null;
          _selectedRetailers.clear();
        });
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }
}

class _SearchField extends StatelessWidget {
  final TextEditingController controller;
  final String hintText;
  final ValueChanged<String> onChanged;
  const _SearchField({
    required this.controller,
    required this.hintText,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      onChanged: onChanged,
      decoration: InputDecoration(
        hintText: hintText,
        prefixIcon: const Icon(Icons.search, size: 20),
        suffixIcon: controller.text.isNotEmpty
            ? IconButton(
                icon: const Icon(Icons.clear, size: 18),
                onPressed: () {
                  controller.clear();
                  onChanged('');
                },
              )
            : null,
        isDense: true,
        filled: true,
        fillColor: AppColors.surfaceVariant,
        contentPadding:
            const EdgeInsets.symmetric(vertical: 10, horizontal: 12),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide.none,
        ),
      ),
    );
  }
}

class _StepHeader extends StatelessWidget {
  final String number;
  final String title;
  const _StepHeader({required this.number, required this.title});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 28,
          height: 28,
          decoration: const BoxDecoration(
            color: AppColors.primary,
            shape: BoxShape.circle,
          ),
          child: Center(
            child: Text(number,
                style: AppTextStyles.bodyMedium
                    .copyWith(color: Colors.white)),
          ),
        ),
        const SizedBox(width: 10),
        Text(title, style: AppTextStyles.heading3),
      ],
    );
  }
}

class _ProductSelectionTile extends StatelessWidget {
  final CatalogModel product;
  final bool isSelected;
  final VoidCallback onTap;
  const _ProductSelectionTile(
      {required this.product,
      required this.isSelected,
      required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color:
              isSelected ? AppColors.primaryContainer.withValues(alpha: 0.3) : Colors.white,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: isSelected ? AppColors.primary : AppColors.divider,
            width: isSelected ? 2 : 1,
          ),
        ),
        child: Row(
          children: [
            Icon(
              isSelected
                  ? Icons.check_circle
                  : Icons.radio_button_unchecked,
              color: isSelected
                  ? AppColors.primary
                  : AppColors.onSurfaceVariant,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(product.name, style: AppTextStyles.bodyMedium),
                  Text(product.category,
                      style: AppTextStyles.caption),
                ],
              ),
            ),
            Text(CurrencyUtils.format(product.price),
                style: AppTextStyles.price),
          ],
        ),
      ),
    );
  }
}

class _RetailerSelectionTile extends StatelessWidget {
  final NetworkRetailerModel retailer;
  final bool isSelected;
  final VoidCallback onToggle;
  const _RetailerSelectionTile(
      {required this.retailer,
      required this.isSelected,
      required this.onToggle});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onToggle,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: isSelected
              ? AppColors.primaryContainer.withValues(alpha: 0.3)
              : Colors.white,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: isSelected ? AppColors.primary : AppColors.divider,
            width: isSelected ? 2 : 1,
          ),
        ),
        child: Row(
          children: [
            Icon(
              isSelected
                  ? Icons.check_box
                  : Icons.check_box_outline_blank,
              color: isSelected
                  ? AppColors.primary
                  : AppColors.onSurfaceVariant,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(retailer.shopName,
                            style: AppTextStyles.bodyMedium,
                            overflow: TextOverflow.ellipsis),
                      ),
                      if (!retailer.isActive) ...[
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 6, vertical: 1),
                          decoration: BoxDecoration(
                            color: Colors.orange.withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            retailer.isInvited ? 'Invited' : retailer.status,
                            style: AppTextStyles.caption.copyWith(
                              color: Colors.orange.shade800,
                              fontWeight: FontWeight.w700,
                              fontSize: 9,
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                  Text(retailer.ownerName,
                      style: AppTextStyles.caption),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
