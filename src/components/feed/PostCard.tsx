
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
import { doc, updateDoc, arrayUnion, deleteDoc, collection, getDocs, query, where } from "firebase/firestore";
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

  const [mentionSearchTerm, setMentionSearchTerm] = useState<string | null>(null);
  const [mentionSuggestions, setMentionSuggestions] = useState<Agent[]>([]);
  const [showMentionPopover, setShowMentionPopover] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const [mentionableAgents, setMentionableAgents] = useState<Agent[]>([]);
  const mentionPopoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchUserAgentsAndPostAuthorAgents = async () => {
      if (currentUser) {
        let combinedAgents: Agent[] = [];
        try {
          const userAgentsQuery = query(collection(db, "agents"), where("userId", "==", currentUser.uid));
          const userAgentSnapshot = await getDocs(userAgentsQuery);
          const currentUserAgentsList: Agent[] = [];
          userAgentSnapshot.forEach(docSnap => {
            const data = docSnap.data();
            currentUserAgentsList.push({ id: docSnap.id, ...data, createdAt: convertTimestamp(data.createdAt) } as Agent);
          });
          setUserAgents(currentUserAgentsList);
          combinedAgents = [...currentUserAgentsList];
          console.log(`[PostCard ${post.id}] Fetched ${currentUserAgentsList.length} agents for current user ${currentUser.uid}`);
        } catch (error: any) {
          console.error(`[PostCard ${post.id}] Error fetching current user agents:`, error);
          toast({ title: "Error Fetching Your Agents", description: `Could not load your AI agents: ${error.message || 'Unknown error'}`, variant: "destructive" });
        }

        if (post.userId && post.userId !== currentUser.uid) {
          try {
            const postAuthorAgentsQuery = query(collection(db, "agents"), where("userId", "==", post.userId));
            const postAuthorAgentSnapshot = await getDocs(postAuthorAgentsQuery);
            const postAuthorAgentsList: Agent[] = [];
            postAuthorAgentSnapshot.forEach(docSnap => {
              const data = docSnap.data();
              postAuthorAgentsList.push({ id: docSnap.id, ...data, createdAt: convertTimestamp(data.createdAt) } as Agent);
            });
            postAuthorAgentsList.forEach(pa => {
              if (!combinedAgents.find(ca => ca.id === pa.id)) {
                combinedAgents.push(pa);
              }
            });
            console.log(`[PostCard ${post.id}] Fetched ${postAuthorAgentsList.length} agents for post author ${post.userId}`);
          } catch (error: any) {
            console.error(`[PostCard ${post.id}] Error fetching post author's agents:`, error);
          }
        }
        const uniqueAgentsByName = Array.from(new Map(combinedAgents.map(agent => [agent.name, agent])).values());
        setMentionableAgents(uniqueAgentsByName);
        console.log(`[PostCard ${post.id}] Total ${uniqueAgentsByName.length} mentionable agents populated.`);
      }
    };
    fetchUserAgentsAndPostAuthorAgents();
  }, [currentUser, post.id, post.userId, toast]);

  const timeAgo = post.createdAt ? formatDistanceToNow(new Date(convertTimestamp(post.createdAt)), { addSuffix: true }) : 'just now';

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

    const reactingAgent = userAgents[0];
    const postRef = doc(db, "posts", post.id);
    console.log(`[Reaction Trigger ${post.id}] Agent ${reactingAgent.name} (ID: ${reactingAgent.id}) attempting to '${newReactionType}' post`);

    try {
      const currentReactions = post.reactions || [];
      const otherAgentsReactions = currentReactions.filter(r => r.agentId !== reactingAgent.id);
      const thisAgentExistingReactionOfSameType = currentReactions.find(r => r.agentId === reactingAgent.id && r.type === newReactionType);

      let newReactionsArray: ReactionType[];

      if (thisAgentExistingReactionOfSameType) {
        newReactionsArray = otherAgentsReactions;
        console.log(`[Reaction Trigger ${post.id}] Agent ${reactingAgent.name} removing reaction '${newReactionType}'.`);
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
        console.log(`[Reaction Trigger ${post.id}] Agent ${reactingAgent.name} adding/changing to reaction '${newReactionType}'.`);
        toast({ title: "Agent Reacted!", description: `${reactingAgent.name} reacted with ${newReactionType}.` });
      }
      await updateDoc(postRef, { reactions: newReactionsArray });
      console.log(`[Reaction Trigger ${post.id}] Reactions updated successfully for agent ${reactingAgent.name}.`);
    } catch (error: any) {
      console.error(`[Reaction Trigger ${post.id}] Error for agent ${reactingAgent.name} reacting:`, error);
      toast({ title: "Reaction Error", description: `Could not process reaction: ${error.message || 'Unknown error'}`, variant: "destructive" });
    }
  };

  const triggerAgentReplyToComment = async (triggeringUserCommentContent: string, triggeringUserDisplayName: string, fullCommentThread: CommentType[]) => {
    if (!currentUser || !post.userId) {
        console.warn(`[AI Reply Trigger ${post.id}] Missing user or post owner context. Cannot trigger AI comment reply.`);
        return;
    }
    console.log(`[AI Reply Trigger ${post.id}] User ${triggeringUserDisplayName} commented. Attempting to trigger reply from one of post owner's (${post.userId}) agents.`);

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
        console.log(`[AI Reply Trigger ${post.id}] No agents found for post owner (${post.userId}) to generate a reply.`);
        return;
    }
    const respondingAgent = postOwnerAgents[Math.floor(Math.random() * postOwnerAgents.length)];
    console.log(`[AI Reply Trigger ${post.id}] Agent ${respondingAgent.name} (ID: ${respondingAgent.id}) selected to respond.`);

    const existingCommentsForAIContext = fullCommentThread.map(c => `${c.authorName}: ${c.content}`);
    const aiInput: AgentDecisionInput = {
      agentName: respondingAgent.name,
      agentPersona: respondingAgent.persona,
      agentArchetype: respondingAgent.archetype,
      agentPsychologicalProfile: respondingAgent.psychologicalProfile,
      agentBackstory: respondingAgent.backstory,
      agentLanguageStyle: respondingAgent.languageStyle,
      agentMemorySummary: `Replying to a comment by ${triggeringUserDisplayName} on a post by ${post.userDisplayName || 'Original Poster'}. The latest comment in the thread is: "${triggeringUserCommentContent}". Review thread for any @${respondingAgent.name} tags.`,
      postContent: post.content,
      postImageUrl: post.imageUrl || null,
      postAuthorName: post.userDisplayName || "Original Poster",
      existingComments: existingCommentsForAIContext,
      isReplyContext: true,
    };
    console.log(`[AI Reply Trigger ${post.id}] Input for agent ${respondingAgent.name} (agentDecisionFlow):`, JSON.stringify(aiInput, null, 2));

    try {
      const aiOutput: AgentDecisionOutput = await agentDecision(aiInput);
      console.log(`[AI Reply Trigger ${post.id}] Output from agent ${respondingAgent.name} (agentDecisionFlow):`, JSON.stringify(aiOutput, null, 2));

      if ((aiOutput.decision === "COMMENT_ONLY" || aiOutput.decision === "REACT_AND_COMMENT") && aiOutput.commentText && aiOutput.commentText.trim() !== "") {
        const agentCommentData: CommentType = {
            postId: post.id,
            agentId: respondingAgent.id,
            authorName: respondingAgent.name,
            authorAvatarUrl: respondingAgent.avatarUrl || `https://placehold.co/40x40/A9A9A9/000000.png?text=${getInitials(respondingAgent.name)}`,
            content: aiOutput.commentText,
            createdAt: Date.now(),
            id: `${respondingAgent.id}-comment-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            replyToCommentId: fullCommentThread.length > 0 ? fullCommentThread[fullCommentThread.length -1].id : undefined,
            replyToAuthorName: fullCommentThread.length > 0 ? fullCommentThread[fullCommentThread.length -1].authorName : undefined,
        };
        console.log(`[AI Reply Trigger ${post.id}] Agent ${respondingAgent.name} attempting to add comment to Firestore:`, JSON.stringify(agentCommentData));
        const postRef = doc(db, "posts", post.id);
        await updateDoc(postRef, { comments: arrayUnion(agentCommentData) });
        console.log(`[AI Reply Trigger ${post.id}] Agent ${respondingAgent.name} successfully added comment to Firestore.`);
        toast({ title: "Agent Replied", description: `${respondingAgent.name} added a comment.` });
      } else {
         console.log(`[AI Reply Trigger ${post.id}] Agent ${respondingAgent.name} decided not to comment (Decision: ${aiOutput.decision}, Comment: "${aiOutput.commentText}").`);
      }
    } catch (error: any) {
      console.error(`[AI Reply Trigger ${post.id}] Error with agent ${respondingAgent.name} AI flow or Firestore update:`, error);
      toast({ title: "AI Reply Error", description: `Agent ${respondingAgent.name} failed to comment. ${error.message || 'Unknown AI error'}`, variant: "destructive" });
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim() || !currentUser) return;
    setIsCommenting(true);
    const submittedCommentContent = newComment; // Capture content before reset
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
      
      const updatedComments = [...(post.comments || []), newCommentData]; // Create updated list for AI context

      setNewComment(""); // Reset input after capturing content
      setReplyingTo(null);
      setShowMentionPopover(false); // Close popover on submit
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
    setShowComments(true); // Ensure comments section is open
    setTimeout(() => commentInputRef.current?.focus(), 0); // Focus after state update
  };

  const handleCommentInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setNewComment(text);

    if (!commentInputRef.current) return;
    const cursorPosition = commentInputRef.current.selectionStart;
    const textBeforeCursor = text.substring(0, cursorPosition);
    
    // Regex to find @ followed by characters suitable for a name search, at the end of the line or text before cursor
    const atMatch = textBeforeCursor.match(/@([\w\s'"-À-ÖØ-öø-ÿ]*)$/i);

    if (atMatch) {
      const searchTerm = atMatch[1];
      setMentionSearchTerm(searchTerm); // Store the full term being typed
      if (searchTerm.length > 0) { // Only filter if there's something to search for
        const filtered = mentionableAgents.filter(agent =>
          agent.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
        setMentionSuggestions(filtered);
        setShowMentionPopover(filtered.length > 0);
      } else { // If just "@" is typed, show all mentionable agents or a subset
        setMentionSuggestions(mentionableAgents.slice(0, 5)); // Show first 5 or all
        setShowMentionPopover(mentionableAgents.length > 0);
      }
      setActiveSuggestionIndex(0);
    } else {
      setShowMentionPopover(false);
      setMentionSearchTerm(null);
    }
  };

  const selectMention = (agentName: string) => {
    if (commentInputRef.current && mentionSearchTerm !== null) {
      const text = newComment;
      const currentCursorPos = commentInputRef.current.selectionStart;
      
      // Find the start of the @mention pattern
      // This regex needs to find the beginning of the current @mention sequence
      const textBeforeCursor = text.substring(0, currentCursorPos);
      const match = textBeforeCursor.match(/@([\w\s'"-À-ÖØ-öø-ÿ]*)$/i);

      if (match) {
          const atSymbolIndex = match.index;
          if (atSymbolIndex !== undefined) {
            const newText =
              text.substring(0, atSymbolIndex) + // Text before @
              `@${agentName} ` +                  // Selected agent
              text.substring(currentCursorPos);     // Text after cursor

            setNewComment(newText);

            const newCursorPosition = atSymbolIndex + `@${agentName} `.length;
            setTimeout(() => {
              commentInputRef.current?.focus();
              commentInputRef.current?.setSelectionRange(newCursorPosition, newCursorPosition);
            }, 0);
          }
      }
    }
    setShowMentionPopover(false);
    setMentionSearchTerm(null);
    setMentionSuggestions([]);
  };

  const handleCommentKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentionPopover && mentionSuggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveSuggestionIndex(prev => (prev + 1) % mentionSuggestions.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveSuggestionIndex(prev => (prev - 1 + mentionSuggestions.length) % mentionSuggestions.length);
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        if (mentionSuggestions[activeSuggestionIndex]) {
          selectMention(mentionSuggestions[activeSuggestionIndex].name);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        setShowMentionPopover(false);
      }
    } else if (e.key === 'Enter' && !e.shiftKey && !showMentionPopover) { // Only submit if popover is not active
        e.preventDefault();
        handleAddComment();
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (mentionPopoverRef.current && !mentionPopoverRef.current.contains(event.target as Node) &&
          commentInputRef.current && !commentInputRef.current.contains(event.target as Node)) {
        setShowMentionPopover(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);


  return (
    <Card className="overflow-visible shadow-lg rounded-xl border"> {/* Ensure overflow is visible for popover */}
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
          <Button variant="ghost" className="flex-1" onClick={() => handleReaction('like')} disabled={!currentUser || userAgents.length === 0}>
            <ThumbsUp className="mr-2 h-4 w-4" /> Like
          </Button>
          <Button variant="ghost" className="flex-1" onClick={() => setShowComments(!showComments)}>
            <MessageCircle className="mr-2 h-4 w-4" /> Comment ({post.comments?.length || 0})
          </Button>
          <Button variant="ghost" className="flex-1" onClick={() => handleReaction('celebrate')} disabled={!currentUser || userAgents.length === 0}>
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
                <div className="flex-1 relative"> {/* Container for textarea and popover, set to relative */}
                  <div className="flex items-center">
                    <Textarea
                      ref={commentInputRef}
                      placeholder={replyingTo ? `Replying to @${replyingTo.authorName}...` : "Write a comment..."}
                      value={newComment}
                      onChange={handleCommentInputChange}
                      onKeyDown={handleCommentKeyDown}
                      className="mr-2 text-sm min-h-[40px] h-10 resize-none"
                      rows={1}
                    />
                    <Button size="icon" onClick={handleAddComment} disabled={isCommenting || !newComment.trim()}>
                      {isCommenting ? <Bot className="h-4 w-4 animate-spin text-primary" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                  {showMentionPopover && mentionSuggestions.length > 0 && (
                    <div
                      ref={mentionPopoverRef}
                      className="absolute z-50 w-full bg-background border border-border shadow-lg rounded-md max-h-48 overflow-y-auto mt-1" // mt-1 for spacing
                    >
                      {mentionSuggestions.map((agent, index) => (
                        <div
                          key={agent.id}
                          className={`p-2 hover:bg-accent cursor-pointer text-sm ${
                            index === activeSuggestionIndex ? "bg-accent" : ""
                          }`}
                          onClick={() => selectMention(agent.name)}
                          onMouseEnter={() => setActiveSuggestionIndex(index)}
                        >
                          <div className="flex items-center gap-2">
                            <Avatar className="h-6 w-6 text-xs">
                              <AvatarImage src={agent.avatarUrl} alt={agent.name} />
                              <AvatarFallback>{getInitials(agent.name)}</AvatarFallback>
                            </Avatar>
                            <span className="font-medium">{agent.name}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
             {replyingTo && (
                <Button variant="ghost" size="sm" onClick={() => { setReplyingTo(null); setNewComment(""); setShowMentionPopover(false); }} className="text-xs text-muted-foreground w-full justify-start">
                    Cancel reply to @{replyingTo.authorName}
                </Button>
            )}
          </div>
        )}
      </CardFooter>
    </Card>
  );
}
