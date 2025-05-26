
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { CreatePostForm } from "@/components/feed/CreatePostForm";
import { PostCard } from "@/components/feed/PostCard";
import type { Post, Agent, Reaction as ReactionType, Comment as CommentType } from "@/types";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/lib/firebase";
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, type Timestamp, getDocs, where, doc, updateDoc, arrayUnion } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { BotMessageSquare, MessageSquarePlus } from "lucide-react";
import { intelligentReaction, type IntelligentReactionInput, type IntelligentReactionOutput } from "@/ai/flows/intelligent-reaction";
import { versatileResponse, type VersatileResponseInput, type VersatileResponseOutput } from "@/ai/flows/versatile-response";

// Helper to convert Firestore Timestamp to number or return original if not a Timestamp
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
      const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
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
            reactions: data.reactions?.map((r: any) => ({ ...r, createdAt: convertTimestamp(r.createdAt) })) || [],
            comments: data.comments?.map((c: any) => ({ ...c, createdAt: convertTimestamp(c.createdAt) })) || [],
          } as Post);
        });
        setPosts(postsData);
        setLoadingPosts(false);
      }, (error) => {
        console.error("Error fetching posts with onSnapshot:", error);
        toast({ title: "Error fetching posts", description: `Snapshot error: ${error.message}`, variant: "destructive" });
        setLoadingPosts(false);
      });
      return () => unsubscribe();
    }
  }, [user, toast]);

  const triggerAgentReactionsToNewPost = async (newPostId: string, postContent: string, postUserId: string, postAuthorDisplayName: string) => {
    if (!postUserId) {
      console.warn("[AI Reaction Trigger] postUserId is missing. Cannot trigger AI reactions.");
      return;
    }

    console.log(`[AI Reaction Trigger] For new post ID: ${newPostId}, User ID: ${postUserId}`);
    try {
      const agentsQuery = query(collection(db, "agents"), where("userId", "==", postUserId));
      const agentSnapshot = await getDocs(agentsQuery);
      const agents: Agent[] = [];
      agentSnapshot.forEach(docSnap => agents.push({ id: docSnap.id, ...docSnap.data(), createdAt: convertTimestamp(docSnap.data().createdAt) } as Agent));

      if (agents.length === 0) {
        console.log("[AI Reaction Trigger] No agents found for user to react to post.");
        return;
      }
      console.log(`[AI Reaction Trigger] Found ${agents.length} agent(s) for user ${postUserId}.`);

      const postRef = doc(db, "posts", newPostId);

      for (const agent of agents) {
        console.log(`[AI Reaction Trigger] Processing reaction for agent: ${agent.name} (ID: ${agent.id})`);
        const reactionInput: IntelligentReactionInput = {
          postContent: postContent,
          agentPersona: agent.persona,
        };
        console.log(`[AI Reaction Trigger] Input for agent ${agent.name}:`, JSON.stringify(reactionInput));

        try {
          const reactionOutput: IntelligentReactionOutput = await intelligentReaction(reactionInput);
          console.log(`[AI Reaction Trigger] Output from agent ${agent.name}:`, JSON.stringify(reactionOutput));

          if (reactionOutput.shouldReact) {
            if (reactionOutput.reactionType && reactionOutput.reactionType.trim() !== "") {
              const reactionDataPayload: {
                agentId: string;
                agentName: string;
                type: string;
                createdAt: number;
                id: string;
                message?: string;
              } = {
                agentId: agent.id,
                agentName: agent.name,
                type: reactionOutput.reactionType,
                createdAt: Date.now(),
                id: `${agent.id}-${Date.now()}-${reactionOutput.reactionType.replace(/\s+/g, '-')}-${(Math.random() + 1).toString(36).substring(7)}`,
              };

              if (reactionOutput.reactionMessage && reactionOutput.reactionMessage.trim()) {
                reactionDataPayload.message = reactionOutput.reactionMessage;
              } else {
                // Explicitly do not add the message key if it's empty, to avoid Firestore undefined error
              }
              
              console.log(`[AI Reaction Trigger] Agent ${agent.name} attempting to add reaction to Firestore:`, JSON.stringify(reactionDataPayload));
              await updateDoc(postRef, {
                reactions: arrayUnion(reactionDataPayload as ReactionType)
              });
              console.log(`[AI Reaction Trigger] Agent ${agent.name} successfully added reaction to Firestore.`);
              toast({ title: "Agent Reaction", description: `${agent.name} reacted: ${reactionOutput.reactionType}` });
            } else {
               console.log(`[AI Reaction Trigger] Agent ${agent.name} shouldReact is true, but reactionType is missing/empty. Skipping reaction.`);
            }

            // Now, also try to get a comment from the same agent for the new post
            console.log(`[AI Comment on New Post] Agent ${agent.name} (ID: ${agent.id}) attempting to generate a comment for new post ${newPostId}`);
            try {
              const commentInput: VersatileResponseInput = {
                postContent: postContent,
                authorName: postAuthorDisplayName,
                agentPersona: agent.persona,
                existingComments: [], // No existing comments on a brand new post
              };
              console.log(`[AI Comment on New Post] Input for agent ${agent.name}:`, JSON.stringify(commentInput));

              const commentOutput: VersatileResponseOutput = await versatileResponse(commentInput);
              console.log(`[AI Comment on New Post] Output from agent ${agent.name}:`, JSON.stringify(commentOutput));

              if (commentOutput.response && commentOutput.response.trim() !== "") {
                const agentCommentData = {
                  postId: newPostId,
                  agentId: agent.id,
                  authorName: agent.name,
                  authorAvatarUrl: agent.avatarUrl || `https://placehold.co/40x40/A9A9A9/000000.png?text=${agent.name.substring(0,2).toUpperCase()}`,
                  content: commentOutput.response,
                  createdAt: Date.now(),
                  id: `${agent.id}-comment-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                };

                console.log(`[AI Comment on New Post] Agent ${agent.name} attempting to add comment to Firestore:`, JSON.stringify(agentCommentData));
                await updateDoc(postRef, {
                  comments: arrayUnion(agentCommentData as CommentType)
                });
                console.log(`[AI Comment on New Post] Agent ${agent.name} successfully added comment to Firestore.`);
                toast({ title: "Agent Commented", description: `${agent.name} added a comment on the new post.` });
              } else {
                console.log(`[AI Comment on New Post] Agent ${agent.name} AI returned no response string or empty response for comment.`);
              }
            } catch (aiCommentError: any) {
              console.error(`[AI Comment on New Post] Error with agent ${agent.name} (ID: ${agent.id}) versatileResponse flow for post ${newPostId}:`, aiCommentError);
              toast({
                title: "AI Comment Error",
                description: `Agent ${agent.name} failed to generate a comment. ${aiCommentError.message || 'Unknown AI error'}`,
                variant: "destructive"
              });
            }
          } else {
            console.log(`[AI Reaction Trigger] Agent ${agent.name} decided not to react or reactionType missing/empty. ShouldReact: ${reactionOutput.shouldReact}, ReactionType: ${reactionOutput.reactionType}. Skipping comment generation.`);
          }
        } catch (aiError: any) {
          console.error(`[AI Reaction Trigger] Error with agent ${agent.name} (ID: ${agent.id}) AI flow for post ${newPostId}:`, aiError);
          toast({
            title: "AI Reaction Error",
            description: `Agent ${agent.name} failed to process reaction. ${aiError.message || 'Unknown AI error'}`,
            variant: "destructive"
          });
        }
      }
    } catch (error: any) {
      console.error(`[AI Reaction Trigger] Error fetching agents or setting up reactions for post ${newPostId}:`, error);
      toast({
        title: "Agent Reaction Setup Error",
        description: `Failed to process agent reactions. ${error.message || 'Unknown error'}`,
        variant: "destructive"
      });
    }
  };


  const handlePostCreated = async (content: string, imageUrl?: string) => {
    if (!user) {
      toast({ title: "Authentication Error", description: "You must be logged in to post.", variant: "destructive" });
      return;
    }
    console.log("Attempting to create post by user:", user.uid);
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
      console.log("New post data (before Firestore):", JSON.stringify(newPostData, null, 2));
      const docRef = await addDoc(collection(db, "posts"), newPostData);
      console.log("Post created successfully in Firestore with ID:", docRef.id);
      toast({ title: "Post Created!", description: "Your post is now live on the feed." });

      await triggerAgentReactionsToNewPost(docRef.id, content, user.uid, user.displayName || "Anonymous User");

    } catch (error: any) {
      console.error("Error creating post in Firestore:", error);
      toast({ title: "Error Creating Post", description: `Firestore error: ${error.message || 'Unknown error'}`, variant: "destructive" });
    }
  };

  if (authLoading || (!user && !authLoading)) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <header className="flex items-center gap-2 mb-4">
        <MessageSquarePlus className="h-8 w-8 text-primary" />
        <h1 className="text-3xl font-bold tracking-tight">Social Feed</h1>
      </header>

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
          <p className="text-muted-foreground text-lg">The feed is quiet right now.</p>
          <p className="text-sm text-muted-foreground">Be the first to share something!</p>
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

