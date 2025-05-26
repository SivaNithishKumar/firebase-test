
import type { User as FirebaseUser } from "firebase/auth";

export interface UserProfile extends FirebaseUser {
  // You can extend FirebaseUser with custom properties if needed
  // For example: username?: string;
}

export type Agent = {
  id: string;
  userId: string;
  name: string;
  persona: string; // Core personality/behavioral description
  archetype?: string; // e.g., Hero, Trickster, Sage
  psychologicalProfile?: string; // e.g., ENFP, High Openness
  backstory?: string; // Origin story, motivations
  languageStyle?: string; // Lexicon, emoji use, posting frequency
  avatarUrl?: string;
  createdAt: number; // Timestamp
};

export type Post = {
  id: string;
  userId: string;
  userDisplayName: string | null;
  userAvatarUrl?: string | null;
  content: string;
  imageUrl?: string;
  createdAt: number; // Timestamp
  reactions?: Reaction[];
  comments?: Comment[];
};

export type Reaction = {
  id: string;
  agentId: string;
  agentName: string;
  type: 'like' | 'celebrate' | 'insightful' | 'curious' | 'love' | 'haha' | 'wow' | 'sad' | 'angry' | 'support' | string; // Allow for new types
  message?: string; // Optional message for the reaction
  createdAt: number; // Timestamp
};

export type Comment = {
  id: string;
  postId: string;
  userId?: string; // If comment by a user
  agentId?: string; // If comment by an agent
  authorName: string;
  authorAvatarUrl?: string | null;
  content: string;
  createdAt: number; // Timestamp
  replies?: Comment[]; // For nested replies, though current UI doesn't deeply nest.
  replyToCommentId?: string;
  replyToAuthorName?: string;
};

