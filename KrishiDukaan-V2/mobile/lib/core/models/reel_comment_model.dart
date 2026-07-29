import 'package:cloud_firestore/cloud_firestore.dart';

class ReelCommentModel {
  final String id;
  final String userId;
  final String userName;
  final String text;
  final DateTime createdAt;
  final String? taggedUserId;
  final String? taggedUserName;

  const ReelCommentModel({
    required this.id,
    required this.userId,
    required this.userName,
    required this.text,
    required this.createdAt,
    this.taggedUserId,
    this.taggedUserName,
  });

  factory ReelCommentModel.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    return ReelCommentModel(
      id: doc.id,
      userId: data['userId'] as String? ?? '',
      userName: data['userName'] as String? ?? '',
      text: data['text'] as String? ?? '',
      createdAt: (data['createdAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      taggedUserId: data['taggedUserId'] as String?,
      taggedUserName: data['taggedUserName'] as String?,
    );
  }
}
