
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
import { doc, updateDoc, arrayUnion, arrayRemove, deleteDoc, collection, serverTimestamp, getDocs, query, where, type Timestamp } from "firebase/firestore";
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
          agentSnapshot.forEach(docSnap => { // Renamed to docSnap
            const data = docSnap.data();
            agentsData.push({ 
              id: docSnap.id, 
              ...data,
              createdAt: convertTimestamp(data.createdAt),
            } as Agent);
          });
          setUserAgents(agentsData);
        } catch (error: any) {
          console.error("Error fetching user agents for PostCard:", error);
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

  const handleReaction = async (reactionType: string) => {
    if (!currentUser) {
      toast({ title: "Login Required", description: "Please login to react.", variant: "destructive" });
      return;
    }
    if (userAgents.length === 0) {
      toast({ title: "No Agents Available", description: "You need to create an AI agent first to perform reactions.", variant: "destructive" });
      return;
    }

    const reactingAgent = userAgents[0]; 
    const postRef = doc(db, "posts", post.id);

    try {
      // Find if this agent already made this specific type of reaction
      const existingReaction = post.reactions?.find(r => r.agentId === reactingAgent.id && r.type === reactionType);

      if (existingReaction) {
        // Reaction exists, remove it
        console.log(`Attempting to remove reaction for post ${post.id}:`, existingReaction);
        await updateDoc(postRef, {
          reactions: arrayRemove(existingReaction) 
        });
        console.log("Reaction removed successfully.");
        toast({ title: "Reaction Removed", description: `${reactingAgent.name} removed their ${reactionType} reaction.` });
      } else {
        // Reaction doesn't exist, add it
        const newReactionData = {
          agentId: reactingAgent.id,
          agentName: reactingAgent.name,
          type: reactionType,
          createdAt: serverTimestamp(),
        };
         const reactionForUnion = {
            ...newReactionData,
            id: `${reactingAgent.id}-${Date.now()}-${reactionType}`, // More unique client ID
        };
        console.log(`Attempting to add reaction for post ${post.id}:`, reactionForUnion);
        await updateDoc(postRef, {
          reactions: arrayUnion(reactionForUnion) 
        });
        console.log("Reaction added successfully.");
        toast({ title: "Agent Reacted!", description: `${reactingAgent.name} reacted with ${reactionType}.` });
      }
    } catch (error: any) {
      console.error(`Error reacting to post ${post.id}:`, error);
      toast({ title: "Reaction Error", description: `Could not process reaction: ${error.message || 'Unknown error'}`, variant: "destructive" });
    }
  };

  const triggerAgentCommentResponse = async (currentPost: Post, triggeringUserCommentContent: string) => {
    if (!currentUser || userAgents.length === 0) {
        console.warn("triggerAgentCommentResponse: Current user or userAgents missing.");
        return;
    }

    const respondingAgent = userAgents[Math.floor(Math.random() * userAgents.length)]; 
    console.log(`Agent ${respondingAgent.name} attempting to respond to comment on post ${currentPost.id}`);

    const existingCommentsStrings = (currentPost.comments || []).map(c => `${c.authorName}: ${c.content}`);
    
    // Include the triggering user comment in the context for the AI
    const currentThreadForAI = [...existingCommentsStrings, `${currentUser.displayName || "User"}: ${triggeringUserCommentContent}`];


    const aiInput: VersatileResponseInput = {
      postContent: currentPost.content, // The original post content
      authorName: currentUser.displayName || "User", // The author of the comment the agent is responding to
      agentPersona: respondingAgent.persona,
      existingComments: currentThreadForAI,
    };

    try {
      const aiOutput: VersatileResponseOutput = await versatileResponse(aiInput);
      if (aiOutput.response) {
        const agentCommentData = {
          postId: currentPost.id,
          agentId: respondingAgent.id,
          authorName: respondingAgent.name,
          authorAvatarUrl: respondingAgent.avatarUrl || `https://placehold.co/40x40/000000/FFFFFF.png?text=${getInitials(respondingAgent.name)}`,
          content: aiOutput.response,
          createdAt: serverTimestamp(),
        };
        const agentCommentForUnion = {
            ...agentCommentData,
            id: doc(collection(db, "dummy")).id, 
        };
        
        console.log(`Agent ${respondingAgent.name} attempting to add comment:`, agentCommentForUnion);
        const postRef = doc(db, "posts", currentPost.id);
        await updateDoc(postRef, {
          comments: arrayUnion(agentCommentForUnion)
        });
        console.log(`Agent ${respondingAgent.name} successfully added comment.`);
        toast({ title: "Agent Responded", description: `${respondingAgent.name} added a comment.` });
      } else {
        console.log(`Agent ${respondingAgent.name} AI returned no response string.`);
      }
    } catch (error: any) {
      console.error(`Error with agent ${respondingAgent.name} generating or adding comment:`, error);
      toast({ title: "AI Comment Error", description: `Agent ${respondingAgent.name} failed to comment. ${error.message || 'Unknown error'}`, variant: "destructive" });
    }
  };


  const handleAddComment = async () => {
    if (!newComment.trim() || !currentUser) return;
    setIsCommenting(true);
    const submittedCommentContent = newComment; 
    console.log(`User ${currentUser.uid} attempting to add comment to post ${post.id}: "${submittedCommentContent}"`);

    const userCommentData = {
      postId: post.id,
      userId: currentUser.uid,
      authorName: currentUser.displayName || "Anonymous User",
      authorAvatarUrl: currentUser.photoURL || null,
      content: submittedCommentContent,
      createdAt: serverTimestamp(), 
    };
    const newCommentForUnion = { 
        ...userCommentData, 
        id: doc(collection(db, "dummy")).id, 
    };

    try {
      const postRef = doc(db, "posts", post.id);
      await updateDoc(postRef, {
        comments: arrayUnion(newCommentForUnion) 
      });
      console.log("User comment added successfully.");
      
      setNewComment(""); 
      toast({ title: "Comment Added", description: "Your comment has been posted." });

      // Create a representation of the post *as it would be* after this comment is added for the AI
      // This avoids relying on onSnapshot to update the 'post' prop immediately for the AI call
      const updatedPostForAI = {
        ...post,
        comments: [
          ...(post.comments || []),
          {
            ...newCommentForUnion,
            createdAt: Date.now() // Use client time for this temporary object for AI context
          } as CommentType,
        ],
      };
      triggerAgentCommentResponse(updatedPostForAI, submittedCommentContent);

    } catch (error: any) {
      console.error(`Error adding user comment to post ${post.id}:`, error);
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
    console.log(`User ${currentUser.uid} attempting to delete post ${post.id}`);
    try {
      await deleteDoc(doc(db, "posts", post.id));
      console.log(`Post ${post.id} deleted successfully.`);
      toast({ title: "Post Deleted", description: "Your post has been successfully removed." });
    } catch (error: any) {
      console.error(`Error deleting post ${post.id}:`, error);
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
            {post.reactions.slice(0, 5).map(reaction => ( // Show up to 5
              <div key={reaction.id || `${reaction.agentId}-${reaction.type}-${reaction.createdAt}`} className="flex items-center p-1 bg-accent rounded-full text-accent-foreground text-xs" title={`${reaction.agentName} (${reaction.type})`}>
                 <Bot className="h-3 w-3 mr-1"/> {reaction.type}
              </div>
            ))}
            {post.reactions.length > 5 && (
              <span className="text-xs text-muted-foreground">+{post.reactions.length - 5} more</span>
            )}
          </div>
        )}

        <div className="flex w-full justify-around border-t pt-2">
          <Button variant="ghost" className="flex-1" onClick={() => handleReaction('like')} disabled={userAgents.length === 0 && !!currentUser}>
            <ThumbsUp className="mr-2 h-4 w-4" /> Like
          </Button>
          <Button variant="ghost" className="flex-1" onClick={() => setShowComments(!showComments)}>
            <MessageCircle className="mr-2 h-4 w-4" /> Comment ({post.comments?.length || 0})
          </Button>
          <Button variant="ghost" className="flex-1" onClick={() => handleReaction('share')} disabled={userAgents.length === 0 && !!currentUser}>
            <Share2 className="mr-2 h-4 w-4" /> Share
          </Button>
        </div>

        {showComments && (
          <div className="w-full mt-4 space-y-3">
            {post.comments && post.comments.length > 0 ? (
              post.comments.map((comment) => (
                <div key={comment.id || `${comment.authorName}-${comment.createdAt}`} className="flex items-start space-x-2 p-2 bg-secondary/50 rounded-md">
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
                        {comment.createdAt ? formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true }) : 'just now'}
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
