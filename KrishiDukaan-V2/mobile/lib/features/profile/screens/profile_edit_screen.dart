import 'dart:io';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/providers/user_provider.dart';
import '../../../core/widgets/loading_overlay.dart';
import '../../auth/data/auth_repository.dart';
import '../../dashboard/data/dashboard_repository.dart';
import '../../marketplace/providers/marketplace_provider.dart';

/// Editable profile / "complete your profile" screen.
///
/// Shown right after signup and after a seller's first subscription purchase
/// (reason == 'new_account'), and reachable any time from the Profile tab.
/// Collects the fields the web requires: name, and for sellers a business name
/// plus address/city/state/pincode.
class ProfileEditScreen extends ConsumerStatefulWidget {
  /// 'new_account' when part of the signup/first-purchase flow; null when the
  /// user opened it manually to edit.
  final String? reason;

  const ProfileEditScreen({super.key, this.reason});

  @override
  ConsumerState<ProfileEditScreen> createState() => _ProfileEditScreenState();
}

class _ProfileEditScreenState extends ConsumerState<ProfileEditScreen> {
  final _formKey = GlobalKey<FormState>();
  final _repo = AuthRepository();

  final _nameCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _businessCtrl = TextEditingController();
  final _addressCtrl = TextEditingController();
  final _cityCtrl = TextEditingController();
  final _stateCtrl = TextEditingController();
  final _pincodeCtrl = TextEditingController();
  final _gstinCtrl = TextEditingController();
  final _mapsUrlCtrl = TextEditingController();

  bool _saving = false;
  bool _prefilled = false;
  String? _error;

  // Shop/profile logo — picked file shown immediately, uploaded on Save.
  File? _logoFile;
  String? _existingLogoUrl;
  bool _uploadingLogo = false;

  @override
  void dispose() {
    _nameCtrl.dispose();
    _emailCtrl.dispose();
    _businessCtrl.dispose();
    _addressCtrl.dispose();
    _cityCtrl.dispose();
    _stateCtrl.dispose();
    _pincodeCtrl.dispose();
    _gstinCtrl.dispose();
    _mapsUrlCtrl.dispose();
    super.dispose();
  }

  /// The canonical GSTIN + Google Maps link live on retailers/{phone} (what
  /// the web dashboard edits), so when the users-doc mirrors are empty pull
  /// them from there — otherwise values set on web would look blank here.
  Future<void> _prefillFromRoleDoc(String role, String phone) async {
    final col = role == 'manufacturer' ? 'manufacturers' : 'retailers';
    try {
      final snap = await FirebaseFirestore.instance
          .collection(col)
          .doc(phone)
          .get();
      final d = snap.data();
      if (!mounted || d == null) return;
      final gstin = d['gstin'] as String?;
      if (gstin != null && gstin.isNotEmpty && _gstinCtrl.text.isEmpty) {
        _gstinCtrl.text = gstin;
      }
      final mapsUrl = d['googleMapsUrl'] as String?;
      if (mapsUrl != null && mapsUrl.isNotEmpty && _mapsUrlCtrl.text.isEmpty) {
        _mapsUrlCtrl.text = mapsUrl;
      }
      final logo = d['logo'] as String?;
      if (logo != null && logo.isNotEmpty && _existingLogoUrl == null) {
        setState(() => _existingLogoUrl = logo);
      }
    } catch (_) {}
  }

  String? _required(String? v) =>
      (v == null || v.trim().isEmpty) ? 'Required' : null;

  Future<void> _pickLogo() async {
    final picker = ImagePicker();
    final source = await showDialog<ImageSource>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Select image source'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, ImageSource.camera),
            child: const Text('Camera'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, ImageSource.gallery),
            child: const Text('Gallery'),
          ),
        ],
      ),
    );
    if (source == null) return;
    final xFile = await picker.pickImage(
      source: source,
      maxWidth: 1024,
      imageQuality: 85,
    );
    if (xFile == null || !mounted) return;
    final file = File(xFile.path);
    // Matches storage.rules' 5 MB cap on profile-images/** — fail fast with a
    // clear message instead of letting the upload get rejected server-side.
    final bytes = await file.length();
    if (bytes > 5 * 1024 * 1024) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Image must be less than 5MB')),
        );
      }
      return;
    }
    setState(() => _logoFile = file);
  }

  Future<void> _save(String role, String phone) async {
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _saving = true;
      _error = null;
    });

    try {
      String? logoUrl = _existingLogoUrl;
      if (_logoFile != null) {
        setState(() => _uploadingLogo = true);
        try {
          logoUrl =
              await DashboardRepository().uploadProfileLogo(_logoFile!, phone);
        } finally {
          if (mounted) setState(() => _uploadingLogo = false);
        }
      }

      await _repo.saveProfile(
        phone: phone,
        role: role,
        name: _nameCtrl.text.trim(),
        email: _emailCtrl.text.trim(),
        businessName: _businessCtrl.text.trim(),
        address: _addressCtrl.text.trim(),
        city: _cityCtrl.text.trim(),
        state: _stateCtrl.text.trim(),
        pincode: _pincodeCtrl.text.trim(),
        gstin: _gstinCtrl.text.trim().toUpperCase(),
        googleMapsUrl: _mapsUrlCtrl.text.trim(),
        logoUrl: logoUrl,
      );

      ref.invalidate(currentUserProvider);
      // The avatar on Profile reads retailerProfileProvider, which is keyed
      // by phone and won't otherwise know the logo doc just changed.
      ref.invalidate(retailerProfileProvider(phone));
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Profile saved'),
          backgroundColor: AppColors.success,
        ),
      );

      // Route onward. During signup/first purchase, continue into the app;
      // otherwise just return to wherever they came from.
      if (widget.reason == 'new_account') {
        final isSeller = role == 'retailer' || role == 'manufacturer';
        context.go(isSeller ? '/dashboard' : '/');
      } else if (context.canPop()) {
        context.pop();
      } else {
        context.go('/profile');
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = 'Could not save profile. Please try again.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final userAsync = ref.watch(currentUserProvider);

    return userAsync.when(
      loading: () =>
          const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (_, _) => const Scaffold(
          body: Center(child: Text('Failed to load profile.'))),
      data: (user) {
        if (user == null) {
          return const Scaffold(body: Center(child: Text('Not logged in.')));
        }

        // Prefill once from the loaded user doc.
        if (!_prefilled) {
          _nameCtrl.text = user.name;
          _emailCtrl.text = user.email ?? '';
          _businessCtrl.text = user.businessName ?? '';
          _addressCtrl.text = user.address ?? '';
          _cityCtrl.text = user.city ?? '';
          _stateCtrl.text = user.state ?? '';
          _pincodeCtrl.text = user.pincode ?? '';
          _gstinCtrl.text = user.gstin ?? '';
          _mapsUrlCtrl.text = user.googleMapsUrl ?? '';
          // Always fetch for sellers — not just when gstin/mapsUrl are
          // empty — since this is also the only place the existing logo
          // (never mirrored to users/{phone}) can be prefilled from.
          if (user.isSeller) {
            _prefillFromRoleDoc(user.role, user.phone);
          }
          _prefilled = true;
        }

        final isSeller = user.isSeller;
        final isNew = widget.reason == 'new_account';

        return LoadingOverlay(
          isLoading: _saving,
          message: 'Saving…',
          child: Scaffold(
            backgroundColor: AppColors.background,
            appBar: AppBar(
              backgroundColor: AppColors.primary,
              foregroundColor: Colors.white,
              title: Text(isNew ? 'Complete Your Profile' : 'Edit Profile',
                  style: AppTextStyles.heading2.copyWith(color: Colors.white)),
              automaticallyImplyLeading: !isNew,
            ),
            body: SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (isNew)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 16),
                        child: Text(
                          isSeller
                              ? 'Add your shop details so customers can find and trust you.'
                              : 'Add a few details to finish setting up your account.',
                          style: AppTextStyles.body
                              .copyWith(color: AppColors.onSurfaceVariant),
                        ),
                      ),

                    // Shop/profile logo — sellers only, same field
                    // (retailers/manufacturers/{phone}.logo, mirrored to
                    // profiles/{phone}.logo) the web dashboard's logo
                    // uploader sets.
                    if (isSeller) ...[
                      Center(child: _LogoPicker(
                        file: _logoFile,
                        existingUrl: _existingLogoUrl,
                        uploading: _uploadingLogo,
                        onTap: _pickLogo,
                      )),
                      const SizedBox(height: 24),
                    ],

                    Text('Your Details', style: AppTextStyles.heading3),
                    const SizedBox(height: 12),
                    _field(_nameCtrl, 'Full Name', Icons.person_outline,
                        validator: _required),
                    const SizedBox(height: 12),
                    _field(_emailCtrl, 'Email (optional)', Icons.email_outlined,
                        keyboardType: TextInputType.emailAddress),

                    if (isSeller) ...[
                      const SizedBox(height: 24),
                      Text('Shop Details', style: AppTextStyles.heading3),
                      const SizedBox(height: 12),
                      _field(_businessCtrl, 'Shop / Business Name',
                          Icons.storefront_outlined,
                          validator: _required),
                      const SizedBox(height: 12),
                      _field(_addressCtrl, 'Address', Icons.home_outlined,
                          maxLines: 2, validator: _required),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: _field(_cityCtrl, 'City',
                                Icons.location_city_outlined,
                                validator: _required),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: _field(
                                _stateCtrl, 'State', Icons.map_outlined),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      _field(_pincodeCtrl, 'Pincode', Icons.pin_outlined,
                          keyboardType: TextInputType.number,
                          inputFormatters: [
                            FilteringTextInputFormatter.digitsOnly,
                            LengthLimitingTextInputFormatter(6),
                          ]),
                      const SizedBox(height: 12),
                      // Printed on invoices (web + mobile). 15-char GSTIN.
                      _field(_gstinCtrl, 'GSTIN (optional)',
                          Icons.receipt_long_outlined,
                          inputFormatters: [
                            LengthLimitingTextInputFormatter(15),
                            FilteringTextInputFormatter.allow(
                                RegExp(r'[a-zA-Z0-9]')),
                            TextInputFormatter.withFunction(
                              (oldValue, newValue) => newValue.copyWith(
                                  text: newValue.text.toUpperCase()),
                            ),
                          ],
                          validator: (v) {
                            final s = v?.trim() ?? '';
                            if (s.isEmpty) return null;
                            return s.length == 15
                                ? null
                                : 'GSTIN must be 15 characters';
                          }),
                      const SizedBox(height: 12),
                      // Shown to buyers in the Store Locator "Directions"
                      // flow instead of raw coordinates — paste the "Share"
                      // link of your Google Business / Maps listing.
                      _field(_mapsUrlCtrl, 'Google Maps store link (optional)',
                          Icons.map_outlined,
                          keyboardType: TextInputType.url,
                          validator: (v) {
                            final s = v?.trim() ?? '';
                            if (s.isEmpty) return null;
                            return s.startsWith('http')
                                ? null
                                : 'Paste a full link starting with https://';
                          }),
                      Padding(
                        padding: const EdgeInsets.only(top: 4, left: 4),
                        child: Text(
                          'Open your shop on Google Maps → Share → Copy link, '
                          'and paste it here. Buyers will see your Google '
                          'listing with photos & reviews.',
                          style: AppTextStyles.caption
                              .copyWith(color: AppColors.onSurfaceVariant),
                        ),
                      ),
                    ] else ...[
                      const SizedBox(height: 24),
                      Text('Delivery Address (optional)',
                          style: AppTextStyles.heading3),
                      const SizedBox(height: 12),
                      _field(_addressCtrl, 'Address', Icons.home_outlined,
                          maxLines: 2),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: _field(_cityCtrl, 'City',
                                Icons.location_city_outlined),
                          ),
                          const SizedBox(width: 12),
                          SizedBox(
                            width: 120,
                            child: _field(_pincodeCtrl, 'Pincode',
                                Icons.pin_outlined,
                                keyboardType: TextInputType.number,
                                inputFormatters: [
                                  FilteringTextInputFormatter.digitsOnly,
                                  LengthLimitingTextInputFormatter(6),
                                ]),
                          ),
                        ],
                      ),
                    ],

                    if (_error != null) ...[
                      const SizedBox(height: 16),
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: AppColors.error.withValues(alpha: 0.08),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(_error!,
                            style: AppTextStyles.bodySmall
                                .copyWith(color: AppColors.error)),
                      ),
                    ],

                    const SizedBox(height: 28),
                    SizedBox(
                      width: double.infinity,
                      height: 52,
                      child: FilledButton(
                        onPressed:
                            _saving ? null : () => _save(user.role, user.phone),
                        style: FilledButton.styleFrom(
                          backgroundColor: AppColors.primary,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                        child: Text(isNew ? 'Save & Continue' : 'Save',
                            style: AppTextStyles.button),
                      ),
                    ),
                    if (isNew && !isSeller) ...[
                      const SizedBox(height: 8),
                      Center(
                        child: TextButton(
                          onPressed: _saving ? null : () => context.go('/'),
                          child: const Text('Skip for now'),
                        ),
                      ),
                    ],
                    const SizedBox(height: 24),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _field(
    TextEditingController controller,
    String label,
    IconData icon, {
    String? Function(String?)? validator,
    TextInputType? keyboardType,
    int maxLines = 1,
    List<TextInputFormatter>? inputFormatters,
  }) {
    return TextFormField(
      controller: controller,
      validator: validator,
      keyboardType: keyboardType,
      maxLines: maxLines,
      inputFormatters: inputFormatters,
      style: AppTextStyles.body,
      decoration: InputDecoration(
        labelText: label,
        prefixIcon: Icon(icon),
        filled: true,
        fillColor: Colors.white,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.primary, width: 2),
        ),
      ),
    );
  }
}

/// Tappable circular avatar with a camera badge — shows the freshly-picked
/// file if there is one, else the existing logo URL, else an icon
/// placeholder. Upload itself happens on Save (see `_save`), not on pick, so
/// there's a single write path and no orphaned-then-abandoned edit state.
class _LogoPicker extends StatelessWidget {
  final File? file;
  final String? existingUrl;
  final bool uploading;
  final VoidCallback onTap;
  const _LogoPicker({
    required this.file,
    required this.existingUrl,
    required this.uploading,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final hasExisting = existingUrl != null && existingUrl!.isNotEmpty;

    return GestureDetector(
      onTap: uploading ? null : onTap,
      child: Stack(
        children: [
          CircleAvatar(
            radius: 44,
            backgroundColor: AppColors.primaryContainer,
            backgroundImage: file != null
                ? FileImage(file!)
                : hasExisting
                    ? CachedNetworkImageProvider(existingUrl!) as ImageProvider
                    : null,
            child: (file == null && !hasExisting)
                ? const Icon(Icons.storefront_outlined,
                    size: 36, color: AppColors.primary)
                : null,
          ),
          if (uploading)
            const Positioned.fill(
              child: CircleAvatar(
                backgroundColor: Colors.black38,
                child: SizedBox(
                  width: 24,
                  height: 24,
                  child: CircularProgressIndicator(
                    strokeWidth: 2, color: Colors.white),
                ),
              ),
            )
          else
            Positioned(
              right: 0,
              bottom: 0,
              child: Container(
                padding: const EdgeInsets.all(6),
                decoration: const BoxDecoration(
                  color: AppColors.primary,
                  shape: BoxShape.circle,
                  border: Border.fromBorderSide(
                      BorderSide(color: Colors.white, width: 2)),
                ),
                child: const Icon(Icons.camera_alt,
                    size: 16, color: Colors.white),
              ),
            ),
        ],
      ),
    );
  }
}
