
"use client";

import type { Post, Comment as CommentType, Reaction as ReactionType, UserProfile, Agent } from "@/types";
import Image from "next/image";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ThumbsUp, MessageCircle, Share2, Bot, Send, Trash2, Reply as ReplyIcon } from "lucide-react";
import { formatDistanceToNow } from 'date-fns';
import { useState, useEffect, useRef } from "react";
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
import { agentDecision, type AgentDecisionInput, type AgentDecisionOutput } from "@/ai/flows/agent-decision-flow";


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

interface ReplyingToState {
  commentId: string;
  authorName: string;
}

export function PostCard({ post, currentUser }: PostCardProps) {
  const [showComments, setShowComments] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [isCommenting, setIsCommenting] = useState(false);
  const [userAgents, setUserAgents] = useState<Agent[]>([]);
  const { toast } = useToast();
  const [replyingTo, setReplyingTo] = useState<ReplyingToState | null>(null);
  const commentInputRef = useRef<HTMLTextAreaElement>(null);


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
          console.log(`[PostCard ${post.id}] Fetched ${agentsData.length} agents for user ${currentUser.uid}`);
        } catch (error: any) {
          console.error(`[PostCard ${post.id}] Error fetching user agents:`, error);
          toast({ title: "Error Fetching Agents", description: `Could not load your AI agents: ${error.message || 'Unknown error'}`, variant: "destructive" });
        }
      }
    };
    fetchUserAgents();
  }, [currentUser, toast, post.id]);

  const timeAgo = post.createdAt ? formatDistanceToNow(new Date(post.createdAt), { addSuffix: true }) : 'just now';

  const getInitials = (name?: string | null) => {
    if (!name) return "??";
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().substring(0,2);
  };

  const handleManualReaction = async (newReactionType: string) => {
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
    console.log(`[Manual Reaction ${post.id}] Agent ${reactingAgent.name} (ID: ${reactingAgent.id}) attempting to '${newReactionType}' post`);

    try {
      const currentReactions = post.reactions || [];
      const otherAgentsReactions = currentReactions.filter(r => r.agentId !== reactingAgent.id);
      const thisAgentExistingReactionOfSameType = currentReactions.find(r => r.agentId === reactingAgent.id && r.type === newReactionType);

      let newReactionsArray: ReactionType[];

      if (thisAgentExistingReactionOfSameType) {
        newReactionsArray = otherAgentsReactions; 
        console.log(`[Manual Reaction ${post.id}] Agent ${reactingAgent.name} removing reaction '${newReactionType}'.`);
        toast({ title: "Reaction Removed", description: `${reactingAgent.name} removed their ${newReactionType} reaction.` });
      } else {
        const newReactionToAdd: ReactionType = {
          agentId: reactingAgent.id,
          agentName: reactingAgent.name,
          type: newReactionType,
          createdAt: Date.now(), 
          id: `${reactingAgent.id}-${Date.now()}-reaction-${newReactionType}-${Math.random().toString(36).substring(2, 9)}`,
        };
        newReactionsArray = [...otherAgentsReactions, newReactionToAdd];
        console.log(`[Manual Reaction ${post.id}] Agent ${reactingAgent.name} adding/changing to reaction '${newReactionType}'.`);
        toast({ title: "Agent Reacted!", description: `${reactingAgent.name} reacted with ${newReactionType}.` });
      }
      
      await updateDoc(postRef, { reactions: newReactionsArray });
      console.log(`[Manual Reaction ${post.id}] Reactions updated successfully in Firestore.`);

    } catch (error: any) {
      console.error(`[Manual Reaction ${post.id}] Error for agent ${reactingAgent.name} reacting:`, error);
      toast({ title: "Reaction Error", description: `Could not process reaction: ${error.message || 'Unknown error'}`, variant: "destructive" });
    }
  };

  const triggerAgentReplyToComment = async (triggeringUserCommentContent: string, triggeringUserDisplayName: string, fullCommentThread: CommentType[]) => {
    if (!currentUser) { // Ensure current user context is available for safety, though agent is post owner's
        console.warn(`[AI Reply Trigger ${post.id}] Current user context missing. Cannot robustly trigger AI comment reply.`);
        return;
    }
    if (!post.userId) {
        console.warn(`[AI Reply Trigger ${post.id}] Post owner ID (post.userId) is missing. Cannot trigger AI comment reply.`);
        return;
    }
    console.log(`[AI Reply Trigger ${post.id}] Attempting to trigger reply from one of post owner's (${post.userId}) agents.`);

    let postOwnerAgents: Agent[] = [];
    try {
        const agentsQuery = query(collection(db, "agents"), where("userId", "==", post.userId));
        const agentSnapshot = await getDocs(agentsQuery);
        agentSnapshot.forEach(docSnap => postOwnerAgents.push({ id: docSnap.id, ...docSnap.data(), createdAt: convertTimestamp(docSnap.data().createdAt) } as Agent));
    } catch (e: any) {
        console.error(`[AI Reply Trigger ${post.id}] Error fetching post owner's agents:`, e);
        toast({ title: "AI Reply Error", description: `Could not fetch agents to reply: ${e.message}`, variant: "destructive" });
        return;
    }
    
    if (postOwnerAgents.length === 0) {
        console.log(`[AI Reply Trigger ${post.id}] No agents found for post owner (${post.userId}) to reply.`);
        return;
    }
    const respondingAgent = postOwnerAgents[Math.floor(Math.random() * postOwnerAgents.length)];

    console.log(`[AI Reply Trigger ${post.id}] Agent ${respondingAgent.name} (ID: ${respondingAgent.id}) preparing to respond to comment by ${triggeringUserDisplayName}`);

    const existingCommentsForAIContext = fullCommentThread.map(c => `${c.authorName}: ${c.content}`);

    const aiInput: AgentDecisionInput = {
      agentName: respondingAgent.name,
      agentPersona: respondingAgent.persona,
      agentArchetype: respondingAgent.archetype,
      agentPsychologicalProfile: respondingAgent.psychologicalProfile,
      agentBackstory: respondingAgent.backstory,
      agentLanguageStyle: respondingAgent.languageStyle,
      agentMemorySummary: `Replying to a comment by ${triggeringUserDisplayName} on a post by ${post.userDisplayName || 'Original Poster'}. The latest comment in the thread is: "${triggeringUserCommentContent}".`,
      postContent: post.content,
      postImageUrl: post.imageUrl || null,
      postAuthorName: post.userDisplayName || "Original Poster",
      existingComments: existingCommentsForAIContext, 
      isReplyContext: true,
    };
    console.log(`[AI Reply Trigger ${post.id}] Input for agent ${respondingAgent.name}:`, JSON.stringify(aiInput, null, 2));

    try {
      const aiOutput: AgentDecisionOutput = await agentDecision(aiInput);
      console.log(`[AI Reply Trigger ${post.id}] Output from agent ${respondingAgent.name}:`, JSON.stringify(aiOutput, null, 2));


      if (aiOutput.decision === "COMMENT_ONLY" || aiOutput.decision === "REACT_AND_COMMENT") {
        if (aiOutput.commentText && aiOutput.commentText.trim() !== "") {
            const agentCommentData: CommentType = {
                postId: post.id,
                agentId: respondingAgent.id,
                authorName: respondingAgent.name,
                authorAvatarUrl: respondingAgent.avatarUrl || `https://placehold.co/40x40/A9A9A9/000000.png?text=${getInitials(respondingAgent.name)}`,
                content: aiOutput.commentText,
                createdAt: Date.now(),
                id: `${respondingAgent.id}-comment-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                // If the agent's reply is to the triggering user's comment directly
                replyToCommentId: fullCommentThread.length > 0 ? fullCommentThread[fullCommentThread.length -1].id : undefined,
                replyToAuthorName: fullCommentThread.length > 0 ? fullCommentThread[fullCommentThread.length -1].authorName : undefined,
            };

            console.log(`[AI Reply Trigger ${post.id}] Agent ${respondingAgent.name} attempting to add comment to Firestore:`, JSON.stringify(agentCommentData));
            const postRef = doc(db, "posts", post.id);
            await updateDoc(postRef, { comments: arrayUnion(agentCommentData) });
            console.log(`[AI Reply Trigger ${post.id}] Agent ${respondingAgent.name} successfully added comment to Firestore.`);
            toast({ title: "Agent Replied", description: `${respondingAgent.name} added a comment.` });
        } else {
          console.log(`[AI Reply Trigger ${post.id}] Agent ${respondingAgent.name} decided to comment, but commentText is missing/empty.`);
        }
      } else {
         console.log(`[AI Reply Trigger ${post.id}] Agent ${respondingAgent.name} decided not to comment (Decision: ${aiOutput.decision}).`);
      }
    } catch (error: any) {
      console.error(`[AI Reply Trigger ${post.id}] Error with agent ${respondingAgent.name} AI flow or Firestore update:`, error);
      toast({
        title: "AI Reply Error",
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
    console.log(`[User Comment ${post.id}] User ${currentUser.uid} attempting to add comment: "${submittedCommentContent}"`);

    const newCommentData: CommentType = {
      postId: post.id,
      userId: currentUser.uid,
      authorName: userDisplayNameForAI,
      authorAvatarUrl: currentUser.photoURL || null,
      content: submittedCommentContent,
      createdAt: Date.now(),
      id: `${currentUser.uid}-comment-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      ...(replyingTo && { 
        replyToCommentId: replyingTo.commentId,
        replyToAuthorName: replyingTo.authorName,
      }),
    };

    try {
      const postRef = doc(db, "posts", post.id);
      console.log(`[User Comment ${post.id}] User comment data for Firestore:`, JSON.stringify(newCommentData));
      await updateDoc(postRef, { comments: arrayUnion(newCommentData) });
      console.log(`[User Comment ${post.id}] User comment added successfully to Firestore.`);
      
      const updatedComments = [...(post.comments || []), newCommentData]; // Create the most up-to-date comment list

      setNewComment(""); 
      setReplyingTo(null); // Clear replyingTo state
      toast({ title: "Comment Added", description: "Your comment has been posted." });
      
      await triggerAgentReplyToComment(submittedCommentContent, userDisplayNameForAI, updatedComments);

    } catch (error: any) {
      console.error(`[User Comment ${post.id}] Error adding user comment:`, error);
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
    console.log(`[Post Delete ${post.id}] User ${currentUser.uid} attempting to delete post`);
    try {
      await deleteDoc(doc(db, "posts", post.id));
      console.log(`[Post Delete ${post.id}] Post deleted successfully from Firestore.`);
      toast({ title: "Post Deleted", description: "Your post has been successfully removed." });
    } catch (error: any) {
      console.error(`[Post Delete ${post.id}] Error deleting post:`, error);
      toast({ title: "Delete Error", description: `Could not delete post: ${error.message || 'Unknown error'}`, variant: "destructive" });
    }
  };

  const startReply = (comment: CommentType) => {
    setReplyingTo({ commentId: comment.id, authorName: comment.authorName });
    setNewComment(`@${comment.authorName} `);
    setShowComments(true); // Ensure comment section is open
    commentInputRef.current?.focus();
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
              </div>
            ))}
            {post.reactions.length > 5 && (
              <span className="text-xs text-muted-foreground">+{post.reactions.length - 5} more</span>
            )}
          </div>
        )}

        <div className="flex w-full justify-around border-t pt-2">
          <Button variant="ghost" className="flex-1" onClick={() => handleManualReaction('like')} disabled={!currentUser || userAgents.length === 0}>
            <ThumbsUp className="mr-2 h-4 w-4" /> Like
          </Button>
          <Button variant="ghost" className="flex-1" onClick={() => setShowComments(!showComments)}>
            <MessageCircle className="mr-2 h-4 w-4" /> Comment ({post.comments?.length || 0})
          </Button>
          <Button variant="ghost" className="flex-1" onClick={() => handleManualReaction('celebrate')} disabled={!currentUser || userAgents.length === 0}>
            <Share2 className="mr-2 h-4 w-4" /> Celebrate
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
                       <div className="flex items-center gap-1">
                        <p className="text-xs font-semibold">
                          {comment.authorName} {comment.agentId && <Bot className="inline h-3 w-3 ml-1 text-primary" />}
                        </p>
                        <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-primary" onClick={() => startReply(comment)}>
                            <ReplyIcon className="h-3 w-3" />
                        </Button>
                       </div>
                       <p className="text-xs text-muted-foreground">
                        {comment.createdAt ? formatDistanceToNow(new Date(convertTimestamp(comment.createdAt)), { addSuffix: true }) : 'just now'}
                      </p>
                    </div>
                    <p className="text-xs whitespace-pre-wrap">
                      {comment.replyToAuthorName && (
                        <span className="text-primary/80 font-medium">Replying to @{comment.replyToAuthorName}: </span>
                      )}
                      {comment.content}
                    </p>
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
                  ref={commentInputRef}
                  placeholder={replyingTo ? `Replying to @${replyingTo.authorName}...` : "Write a comment..."}
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
             {replyingTo && (
                <Button variant="ghost" size="sm" onClick={() => { setReplyingTo(null); setNewComment(""); }} className="text-xs text-muted-foreground w-full justify-start">
                    Cancel reply to @{replyingTo.authorName}
                </Button>
            )}
          </div>
        )}
      </CardFooter>
    </Card>
  );
}

