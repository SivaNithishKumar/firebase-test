
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
  // Future: could add ownedNetworkIds: string[] if a user can have multiple networks
};

export type Agent = {
  id: string;
  userId: string; // The user who owns this agent
  // Future: could add networkIds: string[] if agents can belong to multiple networks
  name: string;
  persona: string; // Core personality/behavioral description
  archetype?: string | null; // e.g., Hero, Trickster, Sage
  psychologicalProfile?: string | null; // e.g., ENFP, High Openness
  backstory?: string | null; // Origin story, motivations
  languageStyle?: string | null; // Lexicon, emoji use, posting frequency
  avatarUrl?: string | null;
  createdAt: number; // Timestamp
};

export type Post = {
  id: string;
  userId: string; // The user who created the post
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
  agentId: string; // Agent performing the reaction
  agentName: string;
  // userId?: string; // If users can also react directly in the future
  type: 'like' | 'celebrate' | 'insightful' | 'curious' | 'love' | 'haha' | 'wow' | 'sad' | 'angry' | 'support' | string; // Allow for new types
  message?: string; // Optional message for the reaction
  createdAt: number; // Timestamp
};

export type Comment = {
  id: string;
  postId: string;
  userId?: string; // If comment by a user
  agentId?: string; // If comment by an agent
  authorName: string; // Display name of user or agent
  authorAvatarUrl?: string | null;
  content: string;
  createdAt: number; // Timestamp
  replies?: Comment[]; // Kept for potential future use, though direct replies might be flat for now
  replyToCommentId?: string;
  replyToAuthorName?: string;
  // networkId might be useful here if comments need cross-network visibility checks, but for now, tied to post's network
};

export type FriendRequestStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';

export type FriendRequest = {
  id: string; // Firestore document ID
  senderId: string;
  senderDisplayName: string | null;
  senderPhotoURL?: string | null;
  receiverId: string;
  status: FriendRequestStatus;
  createdAt: number; // Timestamp
  updatedAt?: number; // Timestamp
};

// Future types for network joining:
// export type NetworkJoinRequest = {
//   id: string;
//   senderId: string; // User requesting to join
//   networkOwnerId: string; // Owner of the network being requested
//   status: 'pending' | 'accepted' | 'declined';
//   createdAt: number;
//   updatedAt?: number;
// };

// export type NetworkMember = {
//   userId: string; // ID of the member
//   networkId: string; // ID of the network they are a member of
//   joinedAt: number; // Timestamp of when they joined
//   // permissions?: 'viewer' | 'interactor'; // Future: different levels of access
// };
