
"use client";

import type { Post, Comment as CommentType, Reaction as ReactionType, UserProfile } from "@/types";
import Image from "next/image";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ThumbsUp, MessageCircle, Share2, Bot, Send, Trash2 } from "lucide-react";
import { formatDistanceToNow } from 'date-fns';
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth"; // Assuming you have this hook
import { db } from "@/lib/firebase";
import { doc, updateDoc, arrayUnion, arrayRemove, deleteDoc, addDoc, collection, serverTimestamp } from "firebase/firestore";
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
} from "@/components/ui/alert-dialog"

// Placeholder for AI response generation
// import { versatileResponse } from "@/ai/flows";

interface PostCardProps {
  post: Post;
  currentUser: UserProfile | null;
}

// Dummy agent data for now - replace with actual agent fetching/management
const dummyAgents = [
  { id: "agent1", name: "Eva AI", persona: "Helpful Assistant", avatarUrl: "https://placehold.co/40x40/D3D3D3/000000.png?text=EA" },
  { id: "agent2", name: "Sparky Bot", persona: "Creative Thinker", avatarUrl: "https://placehold.co/40x40/000000/FFFFFF.png?text=SB" },
];

export function PostCard({ post, currentUser }: PostCardProps) {
  const [showComments, setShowComments] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [isCommenting, setIsCommenting] = useState(false);
  const { toast } = useToast();

  const timeAgo = post.createdAt ? formatDistanceToNow(new Date(post.createdAt), { addSuffix: true }) : 'just now';

  const getInitials = (name?: string | null) => {
    if (!name) return "??";
    return name.split(" ").map((n) => n[0]).join("").toUpperCase();
  };

  const handleReaction = async (reactionType: string) => {
    if (!currentUser) return; 

    const reactingAgent = dummyAgents[Math.floor(Math.random() * dummyAgents.length)];

    const reaction: Omit<ReactionType, 'id' | 'createdAt'> & { createdAt: any } = { // Use Omit for new reaction
      agentId: reactingAgent.id,
      agentName: reactingAgent.name,
      type: reactionType,
      createdAt: serverTimestamp(), // Use serverTimestamp
    };
    
    // Create a version with a client-side ID for local state updates or optimistic UI, if needed.
    // For arrayUnion, Firestore generates the server timestamp.
    const reactionWithClientSideIdAndTimestamp = {
        ...reaction,
        id: `${reactingAgent.id}-${Date.now()}`, // Temporary client-side ID
        // createdAt is serverTimestamp(), so reading it back will be a Firestore Timestamp
    };


    const postRef = doc(db, "posts", post.id);
    try {
      // Check if this agent already reacted with this type
      // Note: This check becomes more complex if createdAt is a serverTimestamp object locally before write.
      // For simplicity, this check relies on agentId and type.
      const existingReaction = post.reactions?.find(r => r.agentId === reaction.agentId && r.type === reaction.type);
      if (existingReaction) {
        await updateDoc(postRef, {
          reactions: arrayRemove(existingReaction) // existingReaction is from current state, should be fine
        });
        toast({ title: "Reaction removed", description: `${reactingAgent.name} removed their reaction.` });
      } else {
        // For arrayUnion, pass the object with serverTimestamp()
        await updateDoc(postRef, {
          reactions: arrayUnion(reactionWithClientSideIdAndTimestamp) 
        });
        toast({ title: "Agent Reacted!", description: `${reactingAgent.name} reacted with ${reactionType}.` });
      }
    } catch (error) {
      console.error("Error reacting to post:", error);
      toast({ title: "Reaction Error", description: "Could not process reaction.", variant: "destructive" });
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim() || !currentUser) return;
    setIsCommenting(true);

    const submittedCommentContent = newComment; // Capture content before resetting

    const commentData: Omit<CommentType, 'id' | 'createdAt'> & { createdAt: any } = {
      postId: post.id,
      userId: currentUser.uid,
      authorName: currentUser.displayName || "Anonymous User",
      authorAvatarUrl: currentUser.photoURL,
      content: submittedCommentContent,
      createdAt: serverTimestamp(), 
    };
    
    // Create a version with a client-side ID for local state updates or optimistic UI.
    // The actual createdAt will be set by the server.
    const newCommentForUnion = { 
        ...commentData, 
        id: doc(collection(db, "dummy")).id, // Generate client-side unique ID
    };


    try {
      const postRef = doc(db, "posts", post.id);
      await updateDoc(postRef, {
        comments: arrayUnion(newCommentForUnion) 
      });
      
      setNewComment("");
      toast({ title: "Comment Added", description: "Your comment has been posted." });

      setTimeout(() => simulateAgentResponse(post, submittedCommentContent), 2000);

    } catch (error) {
      console.error("Error adding comment:", error);
      toast({ title: "Comment Error", description: "Could not post comment.", variant: "destructive" });
    } finally {
      setIsCommenting(false);
    }
  };

  const simulateAgentResponse = async (targetPost: Post, userCommentContent: string) => {
    if (!userCommentContent.trim()) return; 

    const respondingAgent = dummyAgents[Math.floor(Math.random() * dummyAgents.length)];
    
    const agentCommentContent = `Thanks for your comment, ${currentUser?.displayName || 'User'}! That's an interesting point about "${userCommentContent.substring(0, 20)}...". From my perspective as ${respondingAgent.persona}, I think... [mock AI response]`;
    
    const agentComment: Omit<CommentType, 'id' | 'createdAt'> & { createdAt: any } = {
      postId: targetPost.id,
      agentId: respondingAgent.id,
      authorName: respondingAgent.name,
      authorAvatarUrl: respondingAgent.avatarUrl,
      content: agentCommentContent,
      createdAt: serverTimestamp(),
    };

    // Create a version with a client-side ID for local state updates or optimistic UI.
    const newAgentCommentForUnion = { 
        ...agentComment, 
        id: doc(collection(db, "dummy")).id, // Generate client-side unique ID
    };

    try {
      const postRef = doc(db, "posts", targetPost.id);
      await updateDoc(postRef, {
        comments: arrayUnion(newAgentCommentForUnion)
      });
      toast({ title: "Agent Responded!", description: `${respondingAgent.name} replied to the post.` });
    } catch (error) {
      console.error("Error adding agent comment:", error);
    }
  };
  
  const handleDeletePost = async () => {
    if (!currentUser || currentUser.uid !== post.userId) return;
    try {
      await deleteDoc(doc(db, "posts", post.id));
      toast({ title: "Post Deleted", description: "Your post has been successfully removed." });
    } catch (error) {
      console.error("Error deleting post:", error);
      toast({ title: "Delete Error", description: "Could not delete post.", variant: "destructive" });
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
              layout="fill"
              objectFit="cover"
              className="bg-muted"
              data-ai-hint="social media image"
            />
          </div>
        )}
      </CardContent>
      <CardFooter className="p-4 pt-2 flex-col items-start">
        {/* Agent Reactions Display */}
        {post.reactions && post.reactions.length > 0 && (
          <div className="flex items-center space-x-2 mb-3">
            {post.reactions.slice(0, 3).map(reaction => (
              <div key={reaction.id} className="flex items-center p-1 bg-accent rounded-full text-accent-foreground text-xs" title={`${reaction.agentName} (${reaction.type})`}>
                 <Bot className="h-3 w-3 mr-1"/> {reaction.type}
              </div>
            ))}
            {post.reactions.length > 3 && (
              <span className="text-xs text-muted-foreground">+{post.reactions.length - 3} more</span>
            )}
          </div>
        )}

        <div className="flex w-full justify-around border-t pt-2">
          <Button variant="ghost" className="flex-1" onClick={() => handleReaction('like')}>
            <ThumbsUp className="mr-2 h-4 w-4" /> Like
          </Button>
          <Button variant="ghost" className="flex-1" onClick={() => setShowComments(!showComments)}>
            <MessageCircle className="mr-2 h-4 w-4" /> Comment ({post.comments?.length || 0})
          </Button>
          <Button variant="ghost" className="flex-1">
            <Share2 className="mr-2 h-4 w-4" /> Share
          </Button>
        </div>

        {showComments && (
          <div className="w-full mt-4 space-y-3">
            {/* Comments List */}
            {post.comments && post.comments.length > 0 ? (
              post.comments.map((comment) => (
                <div key={comment.id} className="flex items-start space-x-2 p-2 bg-secondary/50 rounded-md">
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
                    <p className="text-xs">{comment.content}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground text-center py-2">No comments yet. Be the first to comment!</p>
            )}

            {/* Add Comment Form */}
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
                  {isCommenting ? <Bot className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
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
