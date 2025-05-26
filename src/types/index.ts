
import type { User as FirebaseUser } from "firebase/auth";

// This is the user profile as returned by Firebase Auth
export interface UserProfile extends FirebaseUser {
  // You can extend FirebaseUser with custom properties if needed
}

// This is the user profile data we'll store in the 'userProfiles' Firestore collection
export type AppUserProfile = {
  uid: string;
  displayName: string | null;
  email: string | null; // Be mindful of privacy if displaying this
  photoURL?: string | null;
  createdAt: number; // Timestamp
  friends?: string[]; // Array of friend UIDs

  // Network feature fields
  memberOfNetworks?: string[]; // IDs of networks this user has joined (networkId is typically owner's UID)
  myNetworkMembers?: string[]; // UserIDs of members who have joined this user's network
};

export type Agent = {
  id: string;
  userId: string; // The user who owns this agent
  name: string;
  persona: string;
  archetype?: string | null;
  psychologicalProfile?: string | null;
  backstory?: string | null;
  languageStyle?: string | null;
  avatarUrl?: string | null;
  createdAt: number; // Timestamp
};

export type Post = {
  id: string;
  userId: string; // The user who created the post (and owns the network it's in)
  userDisplayName: string | null;
  userAvatarUrl?: string | null;
  networkId: string; // The ID of the network this post belongs to (typically owner's UID)
  content: string;
  imageUrl?: string | null; // Can be a URL or a data URI
  createdAt: number; // Timestamp
  reactions?: Reaction[];
  comments?: Comment[];
};

export type Reaction = {
  id: string;
  agentId: string;
  agentName: string;
  type: 'like' | 'celebrate' | 'insightful' | 'curious' | 'love' | 'haha' | 'wow' | 'sad' | 'angry' | 'support' | string;
  message?: string;
  createdAt: number; // Timestamp
};

export type Comment = {
  id: string;
  postId: string;
  userId?: string;
  agentId?: string;
  authorName: string;
  authorAvatarUrl?: string | null;
  content: string;
  createdAt: number; // Timestamp
  replyToCommentId?: string;
  replyToAuthorName?: string;
};

export type FriendRequestStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';

export type FriendRequest = {
  id: string;
  senderId: string;
  senderDisplayName: string | null;
  senderPhotoURL?: string | null;
  receiverId: string;
  status: FriendRequestStatus;
  createdAt: number;
  updatedAt?: number;
};

export type NetworkJoinRequestStatus = 'pending' | 'accepted' | 'declined';

export type NetworkJoinRequest = {
  id: string; // Firestore document ID
  senderId: string; // User requesting to join
  senderDisplayName: string | null;
  senderPhotoURL?: string | null;
  networkOwnerId: string; // Owner of the network being requested
  status: NetworkJoinRequestStatus;
  createdAt: number; // Timestamp
  updatedAt?: number; // Timestamp
};
