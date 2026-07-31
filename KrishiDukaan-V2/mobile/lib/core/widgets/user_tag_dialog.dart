import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

class TaggedUser {
  final String id;
  final String name;
  final String role;
  TaggedUser(this.id, this.name, this.role);
}

/// Module-level cache of every taggable user/seller, loaded once per app
/// session on first use. Avoids both the per-keystroke Firestore reads and
/// the arbitrary-`limit()` truncation that made most users unsearchable.
List<TaggedUser>? _taggableCache;
Future<List<TaggedUser>>? _taggableLoad;

Future<List<TaggedUser>> _loadTaggableUsers() {
  if (_taggableCache != null) return Future.value(_taggableCache);
  return _taggableLoad ??= () async {
    final db = FirebaseFirestore.instance;
    final usersSnap = await db.collection('users').get();
    final retailersSnap = await db.collection('retailers').get();

    final results = <TaggedUser>[];
    for (final doc in usersSnap.docs) {
      final name = doc.data()['name'] as String? ?? 'User';
      results.add(TaggedUser(doc.id, name, 'user'));
    }
    for (final doc in retailersSnap.docs) {
      final data = doc.data();
      final name =
          data['shopName'] as String? ?? data['ownerName'] as String? ?? 'Seller';
      results.add(TaggedUser(doc.id, name, 'seller'));
    }
    _taggableCache = results;
    return results;
  }();
}

/// Filters the cached taggable-user list by [query] (case-insensitive
/// substring match on name). Used by both the tap-to-open dialog and the
/// inline "@" mention suggestions.
Future<List<TaggedUser>> searchTaggableUsers(String query) async {
  final all = await _loadTaggableUsers();
  if (query.isEmpty) return const [];
  final q = query.toLowerCase();
  return all.where((u) => u.name.toLowerCase().contains(q)).take(8).toList();
}

class UserTagDialog extends StatefulWidget {
  const UserTagDialog({super.key});

  @override
  State<UserTagDialog> createState() => _UserTagDialogState();
}

class _UserTagDialogState extends State<UserTagDialog> {
  final _searchController = TextEditingController();
  List<TaggedUser> _results = [];
  bool _loading = false;

  Future<void> _search() async {
    final query = _searchController.text.trim();
    if (query.isEmpty) {
      setState(() => _results = []);
      return;
    }
    setState(() => _loading = true);
    final matches = await searchTaggableUsers(query);
    if (!mounted) return;
    setState(() {
      _results = matches;
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Container(
        padding: const EdgeInsets.all(16),
        height: 400,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Tag User or Seller', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 12),
            TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: 'Search by name...',
                prefixIcon: const Icon(Icons.search),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
              ),
              onChanged: (val) => _search(),
            ),
            const SizedBox(height: 12),
            if (_loading)
              const Center(child: CircularProgressIndicator())
            else
              Expanded(
                child: ListView.builder(
                  itemCount: _results.length,
                  itemBuilder: (context, index) {
                    final u = _results[index];
                    return ListTile(
                      leading: CircleAvatar(
                        backgroundColor: u.role == 'seller' ? Colors.green.shade100 : Colors.blue.shade100,
                        child: Icon(u.role == 'seller' ? Icons.store : Icons.person, size: 16, color: Colors.black87),
                      ),
                      title: Text(u.name),
                      subtitle: Text(u.role.toUpperCase(), style: const TextStyle(fontSize: 10)),
                      onTap: () {
                        Navigator.of(context).pop(u);
                      },
                    );
                  },
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// Inline "@mention" suggestions list — shown above a comment input while
/// the user is mid-way through typing "@partial-name". Distinct from
/// [UserTagDialog] (a tap-to-open modal); this one lives inline in the
/// composer so suggestions appear as you type, Instagram/Twitter-style.
class MentionSuggestions extends StatelessWidget {
  final List<TaggedUser> results;
  final bool loading;
  final String query;
  final ValueChanged<TaggedUser> onSelect;

  const MentionSuggestions({
    super.key,
    required this.results,
    required this.loading,
    required this.query,
    required this.onSelect,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(maxHeight: 180),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.black12),
        boxShadow: const [BoxShadow(color: Colors.black12, blurRadius: 8, offset: Offset(0, -2))],
      ),
      child: loading
          ? const Padding(
              padding: EdgeInsets.all(12),
              child: Center(child: SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))),
            )
          : results.isEmpty
              ? Padding(
                  padding: const EdgeInsets.all(12),
                  child: Text('No matches for "$query"', style: const TextStyle(fontSize: 12, color: Colors.black54)),
                )
              : ListView.builder(
                  shrinkWrap: true,
                  itemCount: results.length,
                  itemBuilder: (context, index) {
                    final u = results[index];
                    return ListTile(
                      dense: true,
                      leading: CircleAvatar(
                        radius: 14,
                        backgroundColor: u.role == 'seller' ? Colors.green.shade100 : Colors.blue.shade100,
                        child: Icon(u.role == 'seller' ? Icons.store : Icons.person, size: 14, color: Colors.black87),
                      ),
                      title: Text(u.name, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                      subtitle: Text(u.role.toUpperCase(), style: const TextStyle(fontSize: 9)),
                      onTap: () => onSelect(u),
                    );
                  },
                ),
    );
  }
}
