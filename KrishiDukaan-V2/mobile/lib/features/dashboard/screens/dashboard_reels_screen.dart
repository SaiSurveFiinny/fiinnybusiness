import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/models/reel_model.dart';
import '../../../core/providers/user_provider.dart';
import '../../reels/data/reels_repository.dart';
import '../../reels/providers/reels_provider.dart';

/// Seller "manage my reels" screen — mirrors web's /dashboard/reels (grid of
/// own reels with upload/edit/delete), reusing the existing
/// ReelsRepository.fetchSellerReels/updateReel/deleteReel (already used by
/// ShopProfileScreen's owner-mode reel menu). This replaces the Dashboard
/// drawer's old "Reels" link, which incorrectly pointed at the consumer-facing
/// bottom-nav Reels feed (`/reels`) instead of a management screen — besides
/// showing the wrong content, that route sits inside the app's tab shell and
/// has no back button, which is why it read as "no way back".
class DashboardReelsScreen extends ConsumerWidget {
  const DashboardReelsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider).value;
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        title: Text('Reels',
            style: AppTextStyles.heading2.copyWith(color: Colors.white)),
        actions: [
          IconButton(
            icon: const Icon(Icons.add, color: Colors.white),
            tooltip: 'Upload Reel',
            onPressed: () => context.push('/reels/upload'),
          ),
        ],
      ),
      body: user == null
          ? const Center(child: Text('Not logged in.'))
          : _Body(phone: user.phone),
    );
  }
}

class _Body extends ConsumerWidget {
  final String phone;
  const _Body({required this.phone});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reelsAsync = ref.watch(sellerReelsProvider(phone));

    return reelsAsync.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (_, _) => const Center(child: Text('Failed to load reels.')),
      data: (reels) {
        if (reels.isEmpty) {
          return Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.video_collection_outlined,
                    size: 48, color: AppColors.onSurfaceVariant),
                const SizedBox(height: 12),
                Text('No reels yet', style: AppTextStyles.bodyMedium),
                const SizedBox(height: 12),
                FilledButton.icon(
                  onPressed: () => context.push('/reels/upload'),
                  icon: const Icon(Icons.add),
                  label: const Text('Upload Reel'),
                ),
              ],
            ),
          );
        }
        return RefreshIndicator(
          onRefresh: () async => ref.invalidate(sellerReelsProvider(phone)),
          child: GridView.builder(
            padding: const EdgeInsets.all(12),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              crossAxisSpacing: 10,
              mainAxisSpacing: 10,
              childAspectRatio: 0.72,
            ),
            itemCount: reels.length,
            itemBuilder: (context, i) => _ReelTile(
              reel: reels[i],
              onChanged: () => ref.invalidate(sellerReelsProvider(phone)),
            ),
          ),
        );
      },
    );
  }
}

class _ReelTile extends StatelessWidget {
  final ReelModel reel;
  final VoidCallback onChanged;
  const _ReelTile({required this.reel, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: Stack(
        fit: StackFit.expand,
        children: [
          Container(
            color: AppColors.surfaceVariant,
            child: reel.thumbnailUrl != null
                ? Image.network(reel.thumbnailUrl!, fit: BoxFit.cover)
                : const Icon(Icons.videocam_outlined,
                    size: 32, color: AppColors.onSurfaceVariant),
          ),
          Positioned(
            top: 4,
            right: 4,
            child: PopupMenuButton<String>(
              icon: const Icon(Icons.more_vert, color: Colors.white),
              color: Colors.white,
              onSelected: (value) {
                if (value == 'edit') {
                  showModalBottomSheet(
                    context: context,
                    isScrollControlled: true,
                    backgroundColor: Colors.transparent,
                    builder: (_) => _EditReelSheet(reel: reel, onSaved: onChanged),
                  );
                } else if (value == 'delete') {
                  _confirmDelete(context);
                }
              },
              itemBuilder: (_) => const [
                PopupMenuItem(value: 'edit', child: Text('Edit')),
                PopupMenuItem(value: 'delete', child: Text('Delete')),
              ],
            ),
          ),
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: Container(
              padding: const EdgeInsets.fromLTRB(10, 20, 10, 8),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [Colors.transparent, Colors.black.withValues(alpha: 0.75)],
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    reel.title.isNotEmpty ? reel.title : reel.caption,
                    style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w600,
                        fontSize: 12),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      const Icon(Icons.play_arrow, size: 12, color: Colors.white70),
                      Text(' ${reel.viewsCount}',
                          style: const TextStyle(color: Colors.white70, fontSize: 10)),
                      const SizedBox(width: 8),
                      const Icon(Icons.favorite, size: 12, color: Colors.white70),
                      Text(' ${reel.likesCount}',
                          style: const TextStyle(color: Colors.white70, fontSize: 10)),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _confirmDelete(BuildContext context) {
    showDialog(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Delete Reel'),
        content: const Text('This permanently deletes the reel. This cannot be undone.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.error),
            onPressed: () async {
              Navigator.of(dialogContext).pop();
              await ReelsRepository().deleteReel(reel.id);
              onChanged();
            },
            child: const Text('Delete'),
          ),
        ],
      ),
    );
  }
}

class _EditReelSheet extends StatefulWidget {
  final ReelModel reel;
  final VoidCallback onSaved;
  const _EditReelSheet({required this.reel, required this.onSaved});

  @override
  State<_EditReelSheet> createState() => _EditReelSheetState();
}

class _EditReelSheetState extends State<_EditReelSheet> {
  late final _titleCtrl = TextEditingController(text: widget.reel.title);
  late final _captionCtrl = TextEditingController(text: widget.reel.caption);
  bool _saving = false;

  @override
  void dispose() {
    _titleCtrl.dispose();
    _captionCtrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      await ReelsRepository().updateReel(
        widget.reel.id,
        title: _titleCtrl.text.trim(),
        caption: _captionCtrl.text.trim(),
        linkedProductId: widget.reel.linkedProductId,
        linkedProductName: widget.reel.linkedProductName,
        linkedProductImageUrl: widget.reel.linkedProductImageUrl,
      );
      widget.onSaved();
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Failed to save: $e')));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomPad = MediaQuery.of(context).viewInsets.bottom;
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
          Text('Edit Reel', style: AppTextStyles.heading2),
          const SizedBox(height: 16),
          TextField(
            controller: _titleCtrl,
            decoration: InputDecoration(
              labelText: 'Title',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _captionCtrl,
            maxLines: 3,
            decoration: InputDecoration(
              labelText: 'Caption',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: _saving ? null : _save,
              child: _saving
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : const Text('Save'),
            ),
          ),
        ],
      ),
    );
  }
}
