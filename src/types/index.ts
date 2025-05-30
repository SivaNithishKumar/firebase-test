
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
  photoURL?: string | null; // Will be null for email/password users unless explicitly set
  createdAt: number; // Timestamp
  friends?: string[]; // Array of friend UIDs
  hasCompletedOnboarding: boolean; // New field
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
  userId: string; // The user who created the post
  userDisplayName: string | null;
  userAvatarUrl?: string | null;
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
