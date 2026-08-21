import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/constants/app_colors.dart';
import '../../core/constants/app_text_styles.dart';

/// One entry inside an `engagement_groups/{id}` doc.
class EngagementEvent {
  /// 'like' | 'comment' | 'follow' | 'repost'
  final String kind;
  final String actorPhone;
  final String actorName;
  final String? reelId;
  final DateTime? at;

  const EngagementEvent({
    required this.kind,
    required this.actorPhone,
    required this.actorName,
    this.reelId,
    this.at,
  });

  factory EngagementEvent.fromMap(Map<String, dynamic> m) => EngagementEvent(
        kind: m['kind'] as String? ?? 'like',
        actorPhone: m['actorPhone'] as String? ?? '',
        actorName: m['actorName'] as String? ?? 'Someone',
        reelId: m['reelId'] as String?,
        at: (m['at'] as Timestamp?)?.toDate(),
      );
}

/// Reads one grouped-engagement doc. Written by
/// `flushEngagementNotifications` (Cloud Functions); rules let only the
/// seller it belongs to read it.
final engagementGroupProvider =
    FutureProvider.family<List<EngagementEvent>, String>((ref, groupId) async {
  final doc = await FirebaseFirestore.instance
      .collection('engagement_groups')
      .doc(groupId)
      .get();
  if (!doc.exists) return const [];
  final raw = doc.data()?['events'] as List? ?? const [];
  final events = raw
      .whereType<Map>()
      .map((m) => EngagementEvent.fromMap(Map<String, dynamic>.from(m)))
      .toList();
  // Newest first — the buffer is drained in write order.
  events.sort((a, b) {
    final at = a.at, bt = b.at;
    if (at == null && bt == null) return 0;
    if (at == null) return 1;
    if (bt == null) return -1;
    return bt.compareTo(at);
  });
  return events;
});

/// The people behind one grouped notification ("Rahul, Priya and 24 others
/// interacted with your content"), so the seller can see exactly who did what
/// and jump to the reel involved.
class EngagementGroupScreen extends ConsumerWidget {
  final String groupId;

  const EngagementGroupScreen({super.key, required this.groupId});

  static const _icons = {
    'like': Icons.favorite,
    'comment': Icons.mode_comment,
    'follow': Icons.person_add_alt_1,
    'repost': Icons.repeat_rounded,
  };

  static const _colors = {
    'like': AppColors.error,
    'comment': AppColors.info,
    'follow': AppColors.success,
    'repost': AppColors.primary,
  };

  static const _labels = {
    'like': 'liked your reel',
    'comment': 'commented on your reel',
    'follow': 'started following you',
    'repost': 'reposted your reel',
  };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        title: Text('Recent activity',
            style: AppTextStyles.heading2.copyWith(color: Colors.white)),
      ),
      body: ref.watch(engagementGroupProvider(groupId)).when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (_, _) =>
                const Center(child: Text('Could not load this activity.')),
            data: (events) {
              if (events.isEmpty) {
                return Center(
                  child: Text('This activity is no longer available.',
                      style: AppTextStyles.bodyMedium),
                );
              }
              return ListView.separated(
                padding: const EdgeInsets.all(12),
                itemCount: events.length,
                separatorBuilder: (_, _) => const SizedBox(height: 8),
                itemBuilder: (context, i) => _EventTile(
                  event: events[i],
                  icon: _icons[events[i].kind] ?? Icons.notifications,
                  color: _colors[events[i].kind] ?? AppColors.primary,
                  label: _labels[events[i].kind] ?? 'interacted with you',
                ),
              );
            },
          ),
    );
  }
}

class _EventTile extends StatelessWidget {
  final EngagementEvent event;
  final IconData icon;
  final Color color;
  final String label;

  const _EventTile({
    required this.event,
    required this.icon,
    required this.color,
    required this.label,
  });

  String _timeAgo(DateTime? dt) {
    if (dt == null) return '';
    final diff = DateTime.now().difference(dt);
    if (diff.inMinutes < 1) return 'just now';
    if (diff.inHours < 1) return '${diff.inMinutes}m ago';
    if (diff.inDays < 1) return '${diff.inHours}h ago';
    return '${diff.inDays}d ago';
  }

  @override
  Widget build(BuildContext context) {
    // A follow has no reel to open, so it goes to the follower's shop instead.
    final target = event.kind == 'follow'
        ? (event.actorPhone.isEmpty ? null : '/shop/${event.actorPhone}')
        : (event.reelId == null ? null : '/reel/${event.reelId}');

    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: target == null ? null : () => context.push(target),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(9),
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(icon, color: color, size: 18),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text.rich(
                      TextSpan(children: [
                        TextSpan(
                          text: event.actorName,
                          style: AppTextStyles.bodyMedium
                              .copyWith(fontWeight: FontWeight.w800),
                        ),
                        TextSpan(
                          text: ' $label',
                          style: AppTextStyles.bodyMedium,
                        ),
                      ]),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 3),
                    Text(_timeAgo(event.at), style: AppTextStyles.caption),
                  ],
                ),
              ),
              if (target != null)
                const Icon(Icons.chevron_right,
                    color: AppColors.onSurfaceVariant, size: 20),
            ],
          ),
        ),
      ),
    );
  }
}
