"use client";

import type { Agent } from "@/types";
import Image from "next/image";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bot, Edit3, Trash2 } from "lucide-react";
import { formatDistanceToNow } from 'date-fns';
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { doc, deleteDoc } from "firebase/firestore";
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
import { buttonVariants } from "@/components/ui/button"


interface AgentCardProps {
  agent: Agent;
}

export function AgentCard({ agent }: AgentCardProps) {
  const { toast } = useToast();
  const timeAgo = agent.createdAt ? formatDistanceToNow(new Date(agent.createdAt), { addSuffix: true }) : 'recently';

  const getInitials = (name: string) => {
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().substring(0,2);
  };

  const handleDeleteAgent = async () => {
    try {
      await deleteDoc(doc(db, "agents", agent.id));
      toast({ title: "Agent Deleted", description: `${agent.name} has been removed.` });
    } catch (error) {
      console.error("Error deleting agent:", error);
      toast({ title: "Delete Error", description: "Could not delete agent.", variant: "destructive" });
    }
  };

  return (
    <Card className="flex flex-col h-full shadow-lg rounded-xl border overflow-hidden">
      <CardHeader className="p-4">
        <div className="flex items-start space-x-4">
          <Avatar className="h-16 w-16 border-2 border-primary/20 text-lg">
            <AvatarImage src={agent.avatarUrl} alt={agent.name} data-ai-hint="robot face" />
            <AvatarFallback>{getInitials(agent.name)}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <CardTitle className="text-xl font-semibold flex items-center">
              <Bot className="h-5 w-5 mr-2 text-primary" /> {agent.name}
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">Created {timeAgo}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0 flex-grow">
        <p className="text-sm text-muted-foreground line-clamp-3 overflow-hidden text-ellipsis" title={agent.persona}>
          <strong>Persona:</strong> {agent.persona}
        </p>
      </CardContent>
      <CardFooter className="p-4 border-t flex justify-end items-center gap-2">
        {/* <Button variant="outline" size="sm" disabled>
          <Edit3 className="mr-2 h-3 w-3" /> Edit
        </Button> */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm">
              <Trash2 className="mr-2 h-3 w-3" /> Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the agent '{agent.name}'.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteAgent} className={buttonVariants({ variant: "destructive" })}>
                Delete Agent
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardFooter>
    </Card>
  );
}
