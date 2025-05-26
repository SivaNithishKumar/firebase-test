
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { CreatePostForm } from "@/components/feed/CreatePostForm";
import { PostCard } from "@/components/feed/PostCard";
import type { Post, Agent, Reaction as ReactionType } from "@/types";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/lib/firebase";
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, type Timestamp, getDocs, where, doc, updateDoc, arrayUnion } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { BotMessageSquare, MessageSquarePlus } from "lucide-react";
import { intelligentReaction, type IntelligentReactionInput, type IntelligentReactionOutput } from "@/ai/flows/intelligent-reaction";

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
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          const convertTimestamp = (timestampField: any): number | any => {
            if (timestampField && typeof timestampField.toMillis === 'function') {
              return timestampField.toMillis();
            }
            return timestampField;
          };

          postsData.push({
            id: doc.id,
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
        console.error("Error fetching posts:", error);
        toast({ title: "Error fetching posts", description: error.message, variant: "destructive" });
        setLoadingPosts(false);
      });
      return () => unsubscribe();
    }
  }, [user, toast]);

  const triggerAgentReactionsToNewPost = async (newPostId: string, postContent: string, postUserId: string) => {
    if (!postUserId) return;

    try {
      const agentsQuery = query(collection(db, "agents"), where("userId", "==", postUserId));
      const agentSnapshot = await getDocs(agentsQuery);
      const agents: Agent[] = [];
      agentSnapshot.forEach(doc => agents.push({ id: doc.id, ...doc.data() } as Agent));

      if (agents.length === 0) return;

      const postRef = doc(db, "posts", newPostId);

      for (const agent of agents) {
        try {
          const reactionInput: IntelligentReactionInput = {
            postContent: postContent,
            agentPersona: agent.persona,
          };
          const reactionOutput: IntelligentReactionOutput = await intelligentReaction(reactionInput);

          if (reactionOutput.shouldReact && reactionOutput.reactionType) {
            const newReaction: Omit<ReactionType, 'id' | 'createdAt'> & { createdAt: any } = {
              agentId: agent.id,
              agentName: agent.name,
              type: reactionOutput.reactionType,
              createdAt: serverTimestamp(),
            };
             // Create a version with a client-side ID for arrayUnion, actual ID not critical for reactions here
            const reactionForUnion = {
              ...newReaction,
              id: `${agent.id}-${Date.now()}`
            };

            await updateDoc(postRef, {
              reactions: arrayUnion(reactionForUnion)
            });
            toast({ title: "Agent Reaction", description: `${agent.name} reacted: ${reactionOutput.reactionType}` });
          }
        } catch (aiError: any) {
          console.error(`Error with agent ${agent.name} reacting:`, aiError);
          toast({ title: "AI Reaction Error", description: `Agent ${agent.name} failed to react. ${aiError.message}`, variant: "destructive" });
        }
      }
    } catch (error: any) {
      console.error("Error fetching agents for reaction:", error);
      toast({ title: "Agent Reaction Setup Error", description: error.message, variant: "destructive" });
    }
  };


  const handlePostCreated = async (content: string, imageUrl?: string) => {
    if (!user) {
      toast({ title: "Authentication Error", description: "You must be logged in to post.", variant: "destructive" });
      return;
    }
    try {
      const newPostData = {
        userId: user.uid,
        userDisplayName: user.displayName,
        userAvatarUrl: user.photoURL,
        content,
        imageUrl: imageUrl || null,
        createdAt: serverTimestamp(),
        reactions: [],
        comments: [],
      };
      const docRef = await addDoc(collection(db, "posts"), newPostData);
      toast({ title: "Post Created!", description: "Your post is now live on the feed." });
      
      // Trigger AI agent reactions
      await triggerAgentReactionsToNewPost(docRef.id, content, user.uid);

    } catch (error: any) {
      console.error("Error creating post:", error);
      toast({ title: "Error creating post", description: error.message, variant: "destructive" });
    }
  };

  if (authLoading || !user) {
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
