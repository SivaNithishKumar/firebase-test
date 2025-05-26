
"use client";

import type { Post, Comment as CommentType, Reaction as ReactionType, UserProfile, Agent } from "@/types";
import Image from "next/image";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ThumbsUp, MessageCircle, Share2, Bot, Send, Trash2 } from "lucide-react";
import { formatDistanceToNow } from 'date-fns';
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { db } from "@/lib/firebase";
import { doc, updateDoc, arrayUnion, arrayRemove, deleteDoc, collection, getDocs, query, where, type Timestamp } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { versatileResponse, type VersatileResponseInput, type VersatileResponseOutput } from "@/ai/flows/versatile-response";

interface PostCardProps {
  post: Post;
  currentUser: UserProfile | null;
}

// Helper to convert Firestore Timestamp to number or return original if not a Timestamp
const convertTimestamp = (timestampField: any): number | any => {
    if (timestampField && typeof timestampField.toMillis === 'function') {
      return timestampField.toMillis();
    }
    return timestampField;
  };

export function PostCard({ post, currentUser }: PostCardProps) {
  const [showComments, setShowComments] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [isCommenting, setIsCommenting] = useState(false);
  const [userAgents, setUserAgents] = useState<Agent[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    const fetchUserAgents = async () => {
      if (currentUser) {
        try {
          const agentsQuery = query(collection(db, "agents"), where("userId", "==", currentUser.uid));
          const agentSnapshot = await getDocs(agentsQuery);
          const agentsData: Agent[] = [];
          agentSnapshot.forEach(docSnap => {
            const data = docSnap.data();
            agentsData.push({
              id: docSnap.id,
              ...data,
              createdAt: convertTimestamp(data.createdAt),
            } as Agent);
          });
          setUserAgents(agentsData);
          console.log(`[PostCard] Fetched ${agentsData.length} agents for user ${currentUser.uid}`);
        } catch (error: any) {
          console.error("[PostCard] Error fetching user agents:", error);
          toast({ title: "Error Fetching Agents", description: `Could not load your AI agents: ${error.message || 'Unknown error'}`, variant: "destructive" });
        }
      }
    };
    fetchUserAgents();
  }, [currentUser, toast]);

  const timeAgo = post.createdAt ? formatDistanceToNow(new Date(post.createdAt), { addSuffix: true }) : 'just now';

  const getInitials = (name?: string | null) => {
    if (!name) return "??";
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().substring(0,2);
  };

  const handleReaction = async (newReactionType: string) => {
    if (!currentUser) {
      toast({ title: "Login Required", description: "Please login to react.", variant: "destructive" });
      return;
    }
    if (userAgents.length === 0) {
      toast({ title: "No Agents Available", description: "You need to create an AI agent first to perform reactions.", variant: "destructive" });
      return;
    }

    const reactingAgent = userAgents[0]; // Current user's first agent reacts
    const postRef = doc(db, "posts", post.id);
    console.log(`[User Reaction] Agent ${reactingAgent.name} (ID: ${reactingAgent.id}) attempting to '${newReactionType}' post ${post.id}`);

    try {
      const currentReactions = post.reactions || [];
      const otherAgentsReactions = currentReactions.filter(r => r.agentId !== reactingAgent.id);
      const thisAgentExistingReactionOfSameType = currentReactions.find(r => r.agentId === reactingAgent.id && r.type === newReactionType);

      let newReactionsArray: ReactionType[];

      if (thisAgentExistingReactionOfSameType) {
        // User is toggling OFF this specific reaction type for this agent
        newReactionsArray = otherAgentsReactions.concat(
          currentReactions.filter(r => r.agentId === reactingAgent.id && r.type !== newReactionType)
        );
        console.log(`[User Reaction] Agent ${reactingAgent.name} removing reaction '${newReactionType}' from post ${post.id}`);
        toast({ title: "Reaction Removed", description: `${reactingAgent.name} removed their ${newReactionType} reaction.` });
      } else {
        // User is adding this newReactionType or changing to it.
        // Remove all other reactions by this agent, then add the new one.
        const newReactionToAdd: ReactionType = {
          agentId: reactingAgent.id,
          agentName: reactingAgent.name,
          type: newReactionType,
          createdAt: Date.now(), // Client-side timestamp for arrayUnion
          id: `${reactingAgent.id}-${Date.now()}-${newReactionType.replace(/\s+/g, '-')}-${(Math.random() + 1).toString(36).substring(7)}`,
        };
        newReactionsArray = [...otherAgentsReactions, newReactionToAdd];
        console.log(`[User Reaction] Agent ${reactingAgent.name} adding/changing to reaction '${newReactionType}' on post ${post.id}. Previous reactions by this agent removed.`);
        toast({ title: "Agent Reacted!", description: `${reactingAgent.name} reacted with ${newReactionType}.` });
      }
      
      await updateDoc(postRef, { reactions: newReactionsArray });
      console.log("[User Reaction] Reactions updated successfully in Firestore.");

    } catch (error: any) {
      console.error(`[User Reaction] Error for agent ${reactingAgent.name} reacting to post ${post.id}:`, error);
      toast({ title: "Reaction Error", description: `Could not process reaction: ${error.message || 'Unknown error'}`, variant: "destructive" });
    }
  };

  const triggerAgentCommentResponse = async (currentPost: Post, triggeringUserCommentContent: string, triggeringUserDisplayName: string) => {
    if (!currentUser || userAgents.length === 0) {
        console.warn("[AI Comment Trigger] Current user or userAgents missing. Cannot trigger AI comment.");
        return;
    }

    // Pick a random agent of the current user to respond
    const respondingAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
    console.log(`[AI Comment Trigger] Agent ${respondingAgent.name} (ID: ${respondingAgent.id}) preparing to respond to comment on post ${currentPost.id}`);

    const existingCommentsStrings = (currentPost.comments || []).map(c => `${c.authorName}: ${c.content}`);
    
    // Construct the thread so the AI knows what it's replying to directly
    const currentThreadForAI = [
        ...existingCommentsStrings,
        `Context: You are replying to '${triggeringUserDisplayName}' who just said: "${triggeringUserCommentContent}"`
    ];


    const aiInput: VersatileResponseInput = {
      postContent: currentPost.content, // Base post content
      authorName: currentPost.userDisplayName || "Original Poster", // Author of the original post
      agentPersona: respondingAgent.persona,
      existingComments: currentThreadForAI, 
    };
    console.log(`[AI Comment Trigger] Input for agent ${respondingAgent.name}:`, JSON.stringify(aiInput, null, 2));

    try {
      const aiOutput: VersatileResponseOutput = await versatileResponse(aiInput);
      console.log(`[AI Comment Trigger] Output from agent ${respondingAgent.name}:`, JSON.stringify(aiOutput, null, 2));

      if (aiOutput.response && aiOutput.response.trim() !== "") {
        const agentCommentData: CommentType = {
          postId: currentPost.id,
          agentId: respondingAgent.id,
          authorName: respondingAgent.name,
          authorAvatarUrl: respondingAgent.avatarUrl || `https://placehold.co/40x40/A9A9A9/000000.png?text=${getInitials(respondingAgent.name)}`,
          content: aiOutput.response,
          createdAt: Date.now(), // Client-side timestamp for arrayUnion
          id: `${respondingAgent.id}-comment-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        };

        console.log(`[AI Comment Trigger] Agent ${respondingAgent.name} attempting to add comment to Firestore:`, JSON.stringify(agentCommentData));
        const postRef = doc(db, "posts", currentPost.id);
        await updateDoc(postRef, {
          comments: arrayUnion(agentCommentData)
        });
        console.log(`[AI Comment Trigger] Agent ${respondingAgent.name} successfully added comment to Firestore.`);
        toast({ title: "Agent Responded", description: `${respondingAgent.name} added a comment.` });
      } else {
        console.log(`[AI Comment Trigger] Agent ${respondingAgent.name} AI returned no response string or empty response.`);
      }
    } catch (error: any) {
      console.error(`[AI Comment Trigger] Error with agent ${respondingAgent.name} (ID: ${respondingAgent.id}) AI flow or Firestore update:`, error);
      toast({
        title: "AI Comment Error",
        description: `Agent ${respondingAgent.name} failed to comment. ${error.message || 'Unknown AI error'}`,
        variant: "destructive"
      });
    }
  };


  const handleAddComment = async () => {
    if (!newComment.trim() || !currentUser) return;
    setIsCommenting(true);
    const submittedCommentContent = newComment;
    const userDisplayNameForAI = currentUser.displayName || "Anonymous User";
    console.log(`[User Comment] User ${currentUser.uid} attempting to add comment to post ${post.id}: "${submittedCommentContent}"`);

    const newCommentData: CommentType = {
      postId: post.id,
      userId: currentUser.uid,
      authorName: userDisplayNameForAI,
      authorAvatarUrl: currentUser.photoURL || null,
      content: submittedCommentContent,
      createdAt: Date.now(), // Client-side timestamp for arrayUnion
      id: `${currentUser.uid}-comment-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    };

    try {
      const postRef = doc(db, "posts", post.id);
      console.log(`[User Comment] User comment data for Firestore:`, JSON.stringify(newCommentData));
      await updateDoc(postRef, {
        comments: arrayUnion(newCommentData)
      });
      console.log("[User Comment] User comment added successfully to Firestore.");

      setNewComment(""); // Clear input after successful submission
      toast({ title: "Comment Added", description: "Your comment has been posted." });

      // Prepare updated post object for AI, ensuring comments array exists and includes the new comment
       const updatedCommentsForAI = [
        ...(post.comments || []).map(c => ({...c, createdAt: convertTimestamp(c.createdAt)})), // Ensure existing timestamps are numbers
        { ...newCommentData, createdAt: newCommentData.createdAt } // Already a number
      ];
      
      const updatedPostForAI: Post = {
        ...post,
        createdAt: convertTimestamp(post.createdAt), // Ensure post timestamp is number
        comments: updatedCommentsForAI,
        reactions: (post.reactions || []).map(r => ({...r, createdAt: convertTimestamp(r.createdAt)})), // Ensure reaction timestamps are numbers
      };

      // Trigger agent response after user's comment is successfully added
      await triggerAgentCommentResponse(updatedPostForAI, submittedCommentContent, userDisplayNameForAI);

    } catch (error: any) {
      console.error(`[User Comment] Error adding user comment to post ${post.id}:`, error);
      toast({ title: "Comment Error", description: `Could not post comment: ${error.message || 'Unknown error'}`, variant: "destructive" });
    } finally {
      setIsCommenting(false);
    }
  };

  const handleDeletePost = async () => {
    if (!currentUser || currentUser.uid !== post.userId) {
        toast({ title: "Permission Denied", description: "You can only delete your own posts.", variant: "destructive" });
        return;
    }
    console.log(`[Post Delete] User ${currentUser.uid} attempting to delete post ${post.id}`);
    try {
      await deleteDoc(doc(db, "posts", post.id));
      console.log(`[Post Delete] Post ${post.id} deleted successfully from Firestore.`);
      toast({ title: "Post Deleted", description: "Your post has been successfully removed." });
    } catch (error: any) {
      console.error(`[Post Delete] Error deleting post ${post.id}:`, error);
      toast({ title: "Delete Error", description: `Could not delete post: ${error.message || 'Unknown error'}`, variant: "destructive" });
    }
  };

  return (
    <Card className="overflow-hidden shadow-lg rounded-xl border">
      <CardHeader className="p-4">
        <div className="flex items-center space-x-3">
          <Avatar className="h-10 w-10 border">
            <AvatarImage src={post.userAvatarUrl || undefined} alt={post.userDisplayName || "User"} />
            <AvatarFallback>{getInitials(post.userDisplayName)}</AvatarFallback>
          </Avatar>
          <div>
            <CardTitle className="text-base font-semibold">{post.userDisplayName || "Anonymous User"}</CardTitle>
            <p className="text-xs text-muted-foreground">{timeAgo}</p>
          </div>
          {currentUser && currentUser.uid === post.userId && (
             <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="ml-auto">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete your post.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeletePost} className={buttonVariants({ variant: "destructive" })}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{post.content}</p>
        {post.imageUrl && (
          <div className="mt-3 rounded-lg overflow-hidden aspect-video relative">
            <Image
              src={post.imageUrl}
              alt="Post image"
              fill
              style={{objectFit: "cover"}}
              className="bg-muted"
              data-ai-hint="social media image"
            />
          </div>
        )}
      </CardContent>
      <CardFooter className="p-4 pt-2 flex-col items-start">
        {post.reactions && post.reactions.length > 0 && (
          <div className="flex items-center space-x-2 mb-3 flex-wrap gap-y-1">
            {post.reactions.slice(0, 5).map(reaction => (
              <div
                key={reaction.id || `${reaction.agentId}-${reaction.type}-${reaction.createdAt}-${reaction.message || 'no-msg'}`}
                className="flex items-center p-1 px-2 bg-accent rounded-full text-accent-foreground text-xs"
                title={`${reaction.agentName} reacted: ${reaction.type}${reaction.message ? `\nMessage: "${reaction.message}"` : ''}`}
              >
                 <Bot className="h-3 w-3 mr-1"/> {reaction.type}
                 {reaction.message && <span className="ml-1 italic text-muted-foreground/80">&quot;{reaction.message}&quot;</span>}
              </div>
            ))}
            {post.reactions.length > 5 && (
              <span className="text-xs text-muted-foreground">+{post.reactions.length - 5} more</span>
            )}
          </div>
        )}

        <div className="flex w-full justify-around border-t pt-2">
          <Button variant="ghost" className="flex-1" onClick={() => handleReaction('like')} disabled={!currentUser || userAgents.length === 0}>
            <ThumbsUp className="mr-2 h-4 w-4" /> Like
          </Button>
          <Button variant="ghost" className="flex-1" onClick={() => setShowComments(!showComments)}>
            <MessageCircle className="mr-2 h-4 w-4" /> Comment ({post.comments?.length || 0})
          </Button>
          <Button variant="ghost" className="flex-1" onClick={() => handleReaction('share')} disabled={!currentUser || userAgents.length === 0}> {/* Example: Share could be another reaction type */}
            <Share2 className="mr-2 h-4 w-4" /> Share
          </Button>
        </div>

        {showComments && (
          <div className="w-full mt-4 space-y-3">
            {post.comments && post.comments.length > 0 ? (
              post.comments.sort((a, b) => (convertTimestamp(a.createdAt) || 0) - (convertTimestamp(b.createdAt) || 0)).map((comment) => (
                <div key={comment.id || `${comment.authorName}-${convertTimestamp(comment.createdAt)}`} className="flex items-start space-x-2 p-2 bg-secondary/50 rounded-md">
                  <Avatar className="h-8 w-8 border">
                    <AvatarImage src={comment.authorAvatarUrl || undefined} />
                    <AvatarFallback>{getInitials(comment.authorName)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                       <p className="text-xs font-semibold">
                        {comment.authorName} {comment.agentId && <Bot className="inline h-3 w-3 ml-1 text-primary" />}
                      </p>
                       <p className="text-xs text-muted-foreground">
                        {comment.createdAt ? formatDistanceToNow(new Date(convertTimestamp(comment.createdAt)), { addSuffix: true }) : 'just now'}
                      </p>
                    </div>
                    <p className="text-xs whitespace-pre-wrap">{comment.content}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground text-center py-2">No comments yet. Be the first to comment!</p>
            )}

            {currentUser && (
              <div className="flex items-start space-x-2 pt-3 border-t">
                <Avatar className="h-8 w-8 border">
                  <AvatarImage src={currentUser.photoURL || undefined} />
                  <AvatarFallback>{getInitials(currentUser.displayName)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 flex items-center">
                <Textarea
                  placeholder="Write a comment..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  className="mr-2 text-sm min-h-[40px] h-10 resize-none"
                  rows={1}
                  onKeyPress={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddComment(); }}}
                />
                <Button size="icon" onClick={handleAddComment} disabled={isCommenting || !newComment.trim()}>
                  {isCommenting ? <Bot className="h-4 w-4 animate-spin text-primary" /> : <Send className="h-4 w-4" />}
                </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </CardFooter>
    </Card>
  );
}

