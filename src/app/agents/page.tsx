
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { AgentCard } from "@/components/agents/AgentCard";
import type { Agent } from "@/types";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, orderBy, type Timestamp, addDoc, serverTimestamp, getDocs } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { PlusCircle, Users, Bot, Sparkles, Loader2 } from "lucide-react";

// Helper to convert Firestore Timestamp to number or return original if not a Timestamp
const convertTimestamp = (timestampField: any): number | any => {
  if (timestampField && typeof timestampField.toMillis === 'function') {
    return timestampField.toMillis();
  }
  return timestampField;
};

const defaultAgents: Omit<Agent, "id" | "userId" | "createdAt">[] = [
  {
    name: "Eva AI",
    persona: "A friendly and curious AI, always eager to learn new things and share interesting facts. Enjoys lighthearted conversations and asking thought-provoking questions.",
    avatarUrl: "https://placehold.co/128x128/D3D3D3/000000.png?text=EA"
  },
  {
    name: "Sparky Bot",
    persona: "An energetic and enthusiastic AI, loves to celebrate achievements and offer words of encouragement. Very positive and upbeat.",
    avatarUrl: "https://placehold.co/128x128/D3D3D3/000000.png?text=SB"
  },
  {
    name: "Professor Cogsworth",
    persona: "A knowledgeable and analytical AI, enjoys discussing complex topics, offering insights, and debating ideas. Very formal and precise.",
    avatarUrl: "https://placehold.co/128x128/D3D3D3/000000.png?text=PC"
  }
];


export default function AgentsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [isAddingDefaults, setIsAddingDefaults] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) {
      const q = query(
        collection(db, "agents"),
        where("userId", "==", user.uid),
        orderBy("createdAt", "desc")
      );
      const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const agentsData: Agent[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          agentsData.push({
            id: doc.id,
            ...data,
            createdAt: convertTimestamp(data.createdAt),
          } as Agent);
        });
        setAgents(agentsData);
        setLoadingAgents(false);
      }, (error) => {
        console.error("Error fetching agents with onSnapshot:", error);
        toast({ title: "Error Fetching Agents", description: `Snapshot error: ${error.message}`, variant: "destructive" });
        setLoadingAgents(false);
      });
      return () => unsubscribe();
    }
  }, [user, toast]);

  const handleAddDefaultAgents = async () => {
    if (!user) {
      toast({ title: "Login Required", description: "You must be logged in to add agents.", variant: "destructive" });
      return;
    }
    setIsAddingDefaults(true);
    let agentsAddedCount = 0;
    let agentsSkippedCount = 0;

    try {
      for (const defaultAgent of defaultAgents) {
        // Check if an agent with this name already exists for the user
        const existingAgentQuery = query(
          collection(db, "agents"),
          where("userId", "==", user.uid),
          where("name", "==", defaultAgent.name)
        );
        const existingAgentSnapshot = await getDocs(existingAgentQuery);

        if (existingAgentSnapshot.empty) {
          const agentData = {
            ...defaultAgent,
            userId: user.uid,
            createdAt: serverTimestamp(),
            avatarUrl: defaultAgent.avatarUrl || `https://placehold.co/128x128/D3D3D3/000000.png?text=${defaultAgent.name.substring(0,2).toUpperCase()}`,
          };
          await addDoc(collection(db, "agents"), agentData);
          agentsAddedCount++;
        } else {
          agentsSkippedCount++;
        }
      }

      if (agentsAddedCount > 0 && agentsSkippedCount > 0) {
        toast({ title: "Default Agents", description: `${agentsAddedCount} default agent(s) added. ${agentsSkippedCount} already existed.` });
      } else if (agentsAddedCount > 0) {
        toast({ title: "Default Agents Added", description: `${agentsAddedCount} new default agent(s) are now active.` });
      } else if (agentsSkippedCount > 0) {
        toast({ title: "Default Agents", description: "All default agents already exist for your account." });
      } else {
         toast({ title: "No Default Agents", description: "No default agents were processed.", variant: "default" });
      }

    } catch (error: any) {
      console.error("Error adding default agents:", error);
      toast({ title: "Error Adding Default Agents", description: error.message, variant: "destructive" });
    } finally {
      setIsAddingDefaults(false);
    }
  };


  if (authLoading || (!user && !authLoading)) {
    return (
      <div>
        <Skeleton className="h-10 w-1/2 mb-6" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-48 w-full rounded-lg" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-2">
          <Users className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">Your AI Agents</h1>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
           <Button onClick={handleAddDefaultAgents} variant="outline" disabled={isAddingDefaults}>
            {isAddingDefaults ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            Add Default Agents
          </Button>
          <Button asChild>
            <Link href="/agents/create">
              <PlusCircle className="mr-2 h-4 w-4" /> Create New Agent
            </Link>
          </Button>
        </div>
      </div>

      {loadingAgents && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => <AgentCardSkeleton key={i} />)}
        </div>
      )}

      {!loadingAgents && agents.length === 0 && (
        <div className="text-center py-16 border-2 border-dashed border-muted-foreground/30 rounded-lg">
          <Bot className="mx-auto h-16 w-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold text-muted-foreground">No Agents Found</h2>
          <p className="text-muted-foreground mb-6">
            You haven't created any AI agents yet. Get started by creating your first one or add some defaults!
          </p>
          <div className="flex justify-center gap-4">
            <Button onClick={handleAddDefaultAgents} variant="outline" disabled={isAddingDefaults}>
              {isAddingDefaults ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              Add Default Agents
            </Button>
            <Button asChild variant="default">
              <Link href="/agents/create">
                <PlusCircle className="mr-2 h-4 w-4" /> Create Your First Agent
              </Link>
            </Button>
          </div>
        </div>
      )}

      {!loadingAgents && agents.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </div>
  );
}

function AgentCardSkeleton() {
  return (
    <div className="rounded-xl border bg-card text-card-foreground shadow-md p-6 space-y-4">
      <div className="flex items-center space-x-3">
        <Skeleton className="h-12 w-12 rounded-full" />
        <div className="space-y-1">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
      <div className="flex justify-end pt-2">
        <Skeleton className="h-8 w-20" />
      </div>
    </div>
  );
}

