
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { CreatePostForm } from "@/components/feed/CreatePostForm";
import { PostCard } from "@/components/feed/PostCard";
import type { Post, Agent, Reaction as ReactionType, Comment as CommentType } from "@/types";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  serverTimestamp,
  Timestamp, 
  getDocs,
  where,
  doc,
  updateDoc,
  arrayUnion
} from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { BotMessageSquare, Rss } from "lucide-react";
import { agentDecision, type AgentDecisionInput, type AgentDecisionOutput } from "@/ai/flows/agent-decision-flow";

const convertTimestamp = (timestampField: any): number | any => {
  if (timestampField && typeof timestampField.toMillis === 'function') {
    return timestampField.toMillis();
  }
  return timestampField;
};

export default function FeedPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) { 
      setLoadingPosts(true);
      // Fetch all posts from all users, ordered by creation date
      const q = query(
        collection(db, "posts"),
        orderBy("createdAt", "desc")
      );
      console.log(`[FeedPage] Subscribing to all posts.`);

      const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const postsData: Post[] = [];
        querySnapshot.forEach((docSnap) => {
          const data = docSnap.data();
          postsData.push({
            id: docSnap.id,
            userId: data.userId,
            userDisplayName: data.userDisplayName,
            userAvatarUrl: data.userAvatarUrl,
            content: data.content,
            imageUrl: data.imageUrl,
            createdAt: convertTimestamp(data.createdAt),
            reactions: (data.reactions || []).map((r: any) => ({ ...r, createdAt: convertTimestamp(r.createdAt) })),
            comments: (data.comments || []).map((c: any) => ({ ...c, createdAt: convertTimestamp(c.createdAt) })),
          } as Post);
        });
        setPosts(postsData);
        setLoadingPosts(false);
        console.log(`[FeedPage] Loaded ${postsData.length} total posts.`);
      }, (error) => {
        console.error(`[FeedPage] Error fetching posts with onSnapshot:`, error);
        toast({ title: "Error fetching posts", description: `Snapshot error: ${error.message}`, variant: "destructive" });
        setLoadingPosts(false);
      });
      return () => unsubscribe();
    } else if (!user && !authLoading) { // Ensure posts are cleared if user logs out
      setPosts([]);
      setLoadingPosts(false);
    }
  }, [user, authLoading, toast]);


  const triggerAgentEngagementWithNewPost = async (newPostId: string, postContent: string, postImageUrl: string | undefined | null, postUserId: string, postAuthorDisplayName: string) => {
    console.log(`[AI Engagement Trigger ${newPostId}] For new post by ${postAuthorDisplayName} (ID: ${postUserId})`);
    try {
      const agentsQuery = query(collection(db, "agents"), where("userId", "==", postUserId));
      const agentSnapshot = await getDocs(agentsQuery);
      const agents: Agent[] = [];
      agentSnapshot.forEach(docSnap => agents.push({ id: docSnap.id, ...docSnap.data(), createdAt: convertTimestamp(docSnap.data().createdAt) } as Agent));

      if (agents.length === 0) {
        console.log(`[AI Engagement Trigger ${newPostId}] No agents found for post author ${postUserId}.`);
        return;
      }
      console.log(`[AI Engagement Trigger ${newPostId}] Found ${agents.length} agent(s) for post author ${postUserId}.`);
      const postRef = doc(db, "posts", newPostId);

      for (const agent of agents) {
        console.log(`[AI Engagement Trigger ${newPostId}] Processing engagement for agent: ${agent.name} (ID: ${agent.id})`);
        const decisionInput: AgentDecisionInput = {
          agentName: agent.name, agentPersona: agent.persona, agentArchetype: agent.archetype,
          agentPsychologicalProfile: agent.psychologicalProfile, agentBackstory: agent.backstory, agentLanguageStyle: agent.languageStyle,
          agentMemorySummary: `Considering a new post by ${postAuthorDisplayName}.`,
          postContent: postContent, postImageUrl: postImageUrl, postAuthorName: postAuthorDisplayName,
          existingComments: [], isReplyContext: false,
        };
        console.log(`[AI Engagement Trigger ${newPostId}] Input for agent ${agent.name} (agentDecisionFlow):`, JSON.stringify(decisionInput, null, 2));
        try {
          const decisionOutput: AgentDecisionOutput = await agentDecision(decisionInput);
          console.log(`[AI Engagement Trigger ${newPostId}] Output from agent ${agent.name} (agentDecisionFlow):`, JSON.stringify(decisionOutput, null, 2));

          let firestoreUpdates: Record<string, any> = {};
          if ((decisionOutput.decision === "REACT_ONLY" || decisionOutput.decision === "REACT_AND_COMMENT") && decisionOutput.reactionType) {
            const reactionDataPayload: ReactionType = {
              agentId: agent.id, agentName: agent.name, type: decisionOutput.reactionType,
              createdAt: Date.now(), 
              id: `${agent.id}-${Date.now()}-reaction-${Math.random().toString(36).substring(2, 9)}`,
              ...(decisionOutput.reactionMessage && decisionOutput.reactionMessage.trim() !== "" && { message: decisionOutput.reactionMessage.trim() }),
            };
            firestoreUpdates.reactions = arrayUnion(reactionDataPayload);
          }
          if ((decisionOutput.decision === "COMMENT_ONLY" || decisionOutput.decision === "REACT_AND_COMMENT") && decisionOutput.commentText && decisionOutput.commentText.trim() !== "") {
            const agentCommentData: CommentType = {
              postId: newPostId, agentId: agent.id, authorName: agent.name,
              authorAvatarUrl: agent.avatarUrl || `https://placehold.co/40x40/A9A9A9/000000.png?text=${agent.name.substring(0,2).toUpperCase()}`,
              content: decisionOutput.commentText, createdAt: Date.now(),
              id: `${agent.id}-comment-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            };
            firestoreUpdates.comments = arrayUnion(agentCommentData);
          }
          if (Object.keys(firestoreUpdates).length > 0) {
            await updateDoc(postRef, firestoreUpdates);
            console.log(`[AI Engagement Trigger ${newPostId}] Agent ${agent.name} successfully updated Firestore.`);
          }
        } catch (aiError: any) {
          console.error(`[AI Engagement Trigger ${newPostId}] Error with agent ${agent.name} AI flow:`, aiError);
          toast({ title: "AI Engagement Error", description: `Agent ${agent.name} failed. ${aiError.message || 'Unknown AI error'}`, variant: "destructive" });
        }
      }
    } catch (error: any) {
      console.error(`[AI Engagement Trigger ${newPostId}] Error fetching agents or setting up engagement:`, error);
      toast({ title: "Agent Engagement Setup Error", description: `Failed to process agent engagements. ${error.message || 'Unknown error'}`, variant: "destructive" });
    }
  };

  const handlePostCreated = async (content: string, imageUrl?: string) => {
    if (!user) {
      toast({ title: "Authentication Error", description: "You must be logged in to post.", variant: "destructive" });
      return;
    }
    console.log(`[FeedPage] Attempting to create post by user: ${user.uid}`);
    try {
      const newPostData = {
        userId: user.uid, 
        userDisplayName: user.displayName || "Anonymous User",
        userAvatarUrl: user.photoURL || null,
        content,
        imageUrl: imageUrl || null,
        createdAt: serverTimestamp(),
        reactions: [],
        comments: [],
      };
      console.log("[FeedPage] New post data (before Firestore):", JSON.stringify(newPostData, null, 2));
      const docRef = await addDoc(collection(db, "posts"), newPostData);
      console.log("[FeedPage] Post created successfully in Firestore with ID:", docRef.id);
      toast({ title: "Post Created!", description: "Your post is now live." });
      
      await triggerAgentEngagementWithNewPost(docRef.id, content, imageUrl, user.uid, user.displayName || "Anonymous User");

    } catch (error: any) {
      console.error("[FeedPage] Error creating post in Firestore:", error);
      toast({ title: "Error Creating Post", description: `Firestore error: ${error.message || 'Unknown error'}`, variant: "destructive" });
    }
  };

  if (authLoading || (!user && !authLoading)) { 
    return (
      <div className="space-y-6">
         <div className="flex items-center gap-2 mb-4">
          <Rss className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">PersonaNet Feed</h1>
        </div>
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <header className="flex items-center gap-2 mb-4">
        <Rss className="h-8 w-8 text-primary" />
        <h1 className="text-3xl font-bold tracking-tight">PersonaNet Feed</h1>
      </header>
      <p className="text-sm text-muted-foreground -mt-6">
        See what's happening across the platform.
      </p>

      <CreatePostForm onPostCreated={handlePostCreated} />

      {loadingPosts && (
        <div className="space-y-6">
          <Skeleton className="h-40 w-full rounded-lg" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </div>
      )}

      {!loadingPosts && posts.length === 0 && (
        <div className="text-center py-10">
          <BotMessageSquare className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground text-lg">The feed is empty.</p>
          <p className="text-sm text-muted-foreground">Be the first to post something!</p>
        </div>
      )}

      {!loadingPosts && posts.length > 0 && (
        <div className="space-y-6">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} currentUser={user} />
          ))}
        </div>
      )}
    </div>
  );
}
