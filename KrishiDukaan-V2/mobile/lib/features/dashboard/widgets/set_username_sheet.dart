import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/models/user_model.dart';
import '../../reels/data/reels_repository.dart';

enum _CheckState { idle, checking, available, taken, invalid }

/// Bottom sheet for setting/editing a seller's @username handle. Shared by
/// the Dashboard Profile screen (moved here from the Profile tab, which now
/// only holds the simplified account menu: Language/Dashboard/Orders/Logout).
class SetUsernameSheet extends ConsumerStatefulWidget {
  final UserModel user;
  const SetUsernameSheet({super.key, required this.user});

  @override
  ConsumerState<SetUsernameSheet> createState() => _SetUsernameSheetState();
}

class _SetUsernameSheetState extends ConsumerState<SetUsernameSheet> {
  final _ctrl = TextEditingController();
  _CheckState _checkState = _CheckState.idle;
  bool _saving = false;

  static final _validPattern = RegExp(r'^[a-z0-9_]{3,20}$');

  @override
  void initState() {
    super.initState();
    if (widget.user.username != null) {
      _ctrl.text = widget.user.username!;
      _checkState = _CheckState.available;
    }
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _onChanged(String raw) async {
    final val = raw.toLowerCase().trim();
    if (val.isEmpty) {
      setState(() => _checkState = _CheckState.idle);
      return;
    }
    if (!_validPattern.hasMatch(val)) {
      setState(() => _checkState = _CheckState.invalid);
      return;
    }
    setState(() => _checkState = _CheckState.checking);
    final repo = ReelsRepository();
    final available = await repo.checkUsernameAvailable(val, widget.user.phone);
    if (!mounted) return;
    setState(() =>
        _checkState = available ? _CheckState.available : _CheckState.taken);
  }

  Future<void> _save() async {
    final handle = _ctrl.text.toLowerCase().trim();
    if (!_validPattern.hasMatch(handle)) return;
    setState(() => _saving = true);
    try {
      final repo = ReelsRepository();
      await repo.setUsername(
        username: handle,
        phone: widget.user.phone,
        businessName: widget.user.businessName ?? widget.user.name,
        role: widget.user.role,
        oldUsername: widget.user.username,
      );
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to save: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomPad = MediaQuery.of(context).viewInsets.bottom;
    final canSave = _checkState == _CheckState.available && !_saving;

    Widget? statusWidget;
    switch (_checkState) {
      case _CheckState.checking:
        statusWidget = const Row(children: [
          SizedBox(
              width: 14,
              height: 14,
              child: CircularProgressIndicator(strokeWidth: 2)),
          SizedBox(width: 8),
          Text('Checking…'),
        ]);
      case _CheckState.available:
        statusWidget = Row(children: [
          const Icon(Icons.check_circle, color: Colors.green, size: 16),
          const SizedBox(width: 6),
          Text('@${_ctrl.text.toLowerCase()} is available',
              style: const TextStyle(color: Colors.green)),
        ]);
      case _CheckState.taken:
        statusWidget = Row(children: [
          const Icon(Icons.cancel, color: Colors.red, size: 16),
          const SizedBox(width: 6),
          Text('@${_ctrl.text.toLowerCase()} is taken',
              style: const TextStyle(color: Colors.red)),
        ]);
      case _CheckState.invalid:
        statusWidget = const Text(
          'Only a–z, 0–9 and _ allowed (3–20 chars)',
          style: TextStyle(color: Colors.orange),
        );
      case _CheckState.idle:
        statusWidget = null;
    }

    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      padding: EdgeInsets.fromLTRB(24, 24, 24, 24 + bottomPad),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              margin: const EdgeInsets.only(bottom: 20),
              decoration: BoxDecoration(
                color: AppColors.divider,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          Text('Set Username', style: AppTextStyles.heading2),
          const SizedBox(height: 6),
          Text(
            'A unique handle others can use to find your shop. Once set, it can be changed later.',
            style: AppTextStyles.bodySmall
                .copyWith(color: AppColors.onSurfaceVariant),
          ),
          const SizedBox(height: 20),
          TextField(
            controller: _ctrl,
            inputFormatters: [
              FilteringTextInputFormatter.allow(RegExp(r'[a-zA-Z0-9_]')),
              LengthLimitingTextInputFormatter(20),
            ],
            onChanged: (v) {
              _ctrl.value = _ctrl.value.copyWith(
                text: v.toLowerCase(),
                selection:
                    TextSelection.collapsed(offset: v.toLowerCase().length),
              );
              _onChanged(v);
            },
            decoration: InputDecoration(
              prefixText: '@',
              prefixStyle: AppTextStyles.bodyMedium.copyWith(
                  color: AppColors.primary, fontWeight: FontWeight.bold),
              hintText: 'yourshopname',
              border:
                  OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide:
                    const BorderSide(color: AppColors.primary, width: 2),
              ),
            ),
            autofocus: true,
          ),
          if (statusWidget != null) ...[
            const SizedBox(height: 8),
            statusWidget,
          ],
          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: canSave ? _save : null,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.primary,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape:
                    RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              child: _saving
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white))
                  : const Text('Save Username'),
            ),
          ),
        ],
      ),
    );
  }
}
