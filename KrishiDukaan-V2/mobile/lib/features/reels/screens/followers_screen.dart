import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/providers/user_provider.dart';
import '../data/reels_repository.dart';
import '../providers/reels_provider.dart';

/// Followers of a shop. Reached from the shop profile header and from a
/// `reel_follow` notification, which is why [shopPhone] is optional — a
/// notification tap has no phone to pass and always means "my followers".
class FollowersScreen extends ConsumerStatefulWidget {
  final String? shopPhone;

  const FollowersScreen({super.key, this.shopPhone});

  @override
  ConsumerState<FollowersScreen> createState() => _FollowersScreenState();
}

class _FollowersScreenState extends ConsumerState<FollowersScreen> {
  final _scroll = ScrollController();
  String? _phone;

  @override
  void initState() {
    super.initState();
    // Load the next page slightly before the list actually ends, so scrolling
    // stays continuous instead of stalling at the bottom.
    _scroll.addListener(() {
      if (!_scroll.hasClients || _phone == null) return;
      if (_scroll.position.pixels >=
          _scroll.position.maxScrollExtent - 400) {
        ref.read(followersProvider(_phone!).notifier).loadMore();
      }
    });
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final me = ref.watch(currentUserProvider).value;
    final phone = widget.shopPhone ?? me?.phone;
    final isMine = phone != null && phone == me?.phone;
    _phone = phone;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        title: Text(
          isMine ? 'Your followers' : 'Followers',
          style: AppTextStyles.heading2.copyWith(color: Colors.white),
        ),
      ),
      body: phone == null
          ? const Center(child: Text('Log in to see followers.'))
          : _body(phone, isMine),
    );
  }

  Widget _body(String phone, bool isMine) {
    final state = ref.watch(followersProvider(phone));
    final notifier = ref.read(followersProvider(phone).notifier);
    // Server-side aggregate: the true total, even though only a page is loaded.
    final total = ref.watch(followerCountProvider(phone)).value;

    if (state.followers.isEmpty) {
      if (state.isLoadingMore) {
        return const Center(child: CircularProgressIndicator());
      }
      if (state.error != null) {
        return RefreshIndicator(
          onRefresh: notifier.refresh,
          child: ListView(
            padding: const EdgeInsets.only(top: 140),
            children: const [
              Center(child: Text('Could not load followers.')),
            ],
          ),
        );
      }
      return RefreshIndicator(
        onRefresh: notifier.refresh,
        child: _empty(isMine),
      );
    }

    return RefreshIndicator(
      onRefresh: notifier.refresh,
      child: _list(context, state, total, phone),
    );
  }

  Widget _empty(bool isMine) => ListView(
        // A ListView (not a Center) so pull-to-refresh still works when empty.
        padding: const EdgeInsets.only(top: 120),
        children: [
          Icon(Icons.people_outline,
              size: 56,
              color: AppColors.onSurfaceVariant.withValues(alpha: 0.5)),
          const SizedBox(height: 12),
          Center(
            child: Text(
              isMine ? 'No followers yet' : 'This shop has no followers yet',
              style: AppTextStyles.bodyMedium,
            ),
          ),
          const SizedBox(height: 4),
          Center(
            child: Text('Post reels to get discovered',
                style: AppTextStyles.caption),
          ),
        ],
      );

  Widget _list(
    BuildContext context,
    FollowersState state,
    int? total,
    String phone,
  ) {
    final followers = state.followers;
    // header + tiles + (optional) trailing loader
    final showLoader = state.hasMore || state.isLoadingMore;
    return ListView.separated(
      controller: _scroll,
      padding: const EdgeInsets.all(12),
      itemCount: followers.length + 1 + (showLoader ? 1 : 0),
      separatorBuilder: (_, _) => const SizedBox(height: 8),
      itemBuilder: (context, i) {
        if (i == 0) {
          // Prefer the aggregate total; fall back to what's loaded so far.
          final count = total ?? followers.length;
          return Padding(
            padding: const EdgeInsets.only(bottom: 4, left: 4),
            child: Text(
              '$count ${count == 1 ? "follower" : "followers"}',
              style: AppTextStyles.caption,
            ),
          );
        }
        if (i <= followers.length) {
          return _FollowerTile(follower: followers[i - 1]);
        }
        return const Padding(
          padding: EdgeInsets.symmetric(vertical: 16),
          child: Center(
            child: SizedBox(
              width: 22,
              height: 22,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
          ),
        );
      },
    );
  }
}

class _FollowerTile extends StatelessWidget {
  final FollowerProfile follower;

  const _FollowerTile({required this.follower});

  String _joined(DateTime? dt) {
    if (dt == null) return '';
    final diff = DateTime.now().difference(dt);
    if (diff.inHours < 1) return 'Followed ${diff.inMinutes}m ago';
    if (diff.inDays < 1) return 'Followed ${diff.inHours}h ago';
    if (diff.inDays < 30) return 'Followed ${diff.inDays}d ago';
    return 'Followed on ${dt.day}/${dt.month}/${dt.year}';
  }

  @override
  Widget build(BuildContext context) {
    final initial =
        follower.name.trim().isEmpty ? '?' : follower.name.trim()[0].toUpperCase();
    final subtitle = _joined(follower.followedAt);

    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: follower.phone.isEmpty
            ? null
            : () => context.push('/shop/${follower.phone}'),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              CircleAvatar(
                radius: 22,
                backgroundColor: AppColors.primaryContainer,
                backgroundImage: (follower.photoUrl ?? '').isNotEmpty
                    ? NetworkImage(follower.photoUrl!)
                    : null,
                child: (follower.photoUrl ?? '').isEmpty
                    ? Text(initial,
                        style: AppTextStyles.bodyMedium
                            .copyWith(fontWeight: FontWeight.w800))
                    : null,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      follower.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTextStyles.bodyMedium
                          .copyWith(fontWeight: FontWeight.w700),
                    ),
                    if (subtitle.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(subtitle, style: AppTextStyles.caption),
                    ],
                  ],
                ),
              ),
              const Icon(Icons.chevron_right,
                  color: AppColors.onSurfaceVariant, size: 20),
            ],
          ),
        ),
      ),
    );
  }
}
