import type { User as FirebaseUser } from "firebase/auth";

export interface UserProfile extends FirebaseUser {
  // You can extend FirebaseUser with custom properties if needed
  // For example: username?: string;
}

export type Agent = {
  id: string;
  userId: string; 
  name: string;
  persona: string; 
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
  type: 'like' | 'celebrate' | 'insightful' | 'curious' | string; 
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
  replies?: Comment[]; 
};
