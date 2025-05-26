
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

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
    avatarUrl: "https://placehold.co/128x128/A0A0FF/FFFFFF.png?text=EA" // Light blue background
  },
  {
    name: "Sparky Bot",
    persona: "An energetic and enthusiastic AI, loves to celebrate achievements and offer words of encouragement. Very positive and upbeat.",
    avatarUrl: "https://placehold.co/128x128/FFA0A0/FFFFFF.png?text=SB" // Light red/pink background
  },
  {
    name: "Professor Cogsworth",
    persona: "A knowledgeable and analytical AI, enjoys discussing complex topics, offering insights, and debating ideas. Very formal and precise.",
    avatarUrl: "https://placehold.co/128x128/A0FFA0/000000.png?text=PC" // Light green background
  }
];


export default function AgentsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [isAddingDefaults, setIsAddingDefaults] = useState(false);
  const { toast } = useToast();
  const [showDefaultAgentsDialog, setShowDefaultAgentsDialog] = useState(false);
  const [selectedDefaultAgents, setSelectedDefaultAgents] = useState<Record<string, boolean>>({});

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

  const handleSelectDefaultAgent = (agentName: string, checked: boolean) => {
    setSelectedDefaultAgents(prev => ({ ...prev, [agentName]: checked }));
  };

  const handleAddSelectedDefaultAgents = async () => {
    if (!user) {
      toast({ title: "Login Required", description: "You must be logged in to add agents.", variant: "destructive" });
      return;
    }
    setIsAddingDefaults(true);
    let agentsAddedCount = 0;
    let agentsSkippedCount = 0;

    try {
      for (const agentName in selectedDefaultAgents) {
        if (selectedDefaultAgents[agentName]) {
          const defaultAgentToAdd = defaultAgents.find(agent => agent.name === agentName);
          if (defaultAgentToAdd) {
            const existingAgentQuery = query(
              collection(db, "agents"),
              where("userId", "==", user.uid),
              where("name", "==", defaultAgentToAdd.name)
            );
            const existingAgentSnapshot = await getDocs(existingAgentQuery);

            if (existingAgentSnapshot.empty) {
              const agentData = {
                ...defaultAgentToAdd,
                userId: user.uid,
                createdAt: serverTimestamp(),
                avatarUrl: defaultAgentToAdd.avatarUrl || `https://placehold.co/128x128/D3D3D3/000000.png?text=${defaultAgentToAdd.name.substring(0,2).toUpperCase()}`,
              };
              await addDoc(collection(db, "agents"), agentData);
              agentsAddedCount++;
            } else {
              agentsSkippedCount++;
            }
          }
        }
      }

      if (agentsAddedCount > 0 && agentsSkippedCount > 0) {
        toast({ title: "Default Agents", description: `${agentsAddedCount} default agent(s) added. ${agentsSkippedCount} selected agent(s) already existed.` });
      } else if (agentsAddedCount > 0) {
        toast({ title: "Default Agents Added", description: `${agentsAddedCount} new default agent(s) are now active.` });
      } else if (agentsSkippedCount > 0) {
        toast({ title: "Default Agents", description: `All selected default agent(s) already exist for your account.` });
      } else {
         toast({ title: "No Default Agents Added", description: "No default agents were selected or added.", variant: "default" });
      }

    } catch (error: any) {
      console.error("Error adding selected default agents:", error);
      toast({ title: "Error Adding Default Agents", description: error.message, variant: "destructive" });
    } finally {
      setIsAddingDefaults(false);
      setShowDefaultAgentsDialog(false);
      setSelectedDefaultAgents({}); // Reset selection
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
          <Dialog open={showDefaultAgentsDialog} onOpenChange={setShowDefaultAgentsDialog}>
            <DialogTrigger asChild>
               <Button variant="outline" disabled={isAddingDefaults}>
                <Sparkles className="mr-2 h-4 w-4" />
                Add Predefined Agents
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[480px]">
              <DialogHeader>
                <DialogTitle>Add Predefined Agents</DialogTitle>
                <DialogDescription>
                  Select the predefined agents you'd like to add to your account.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
                {defaultAgents.map((agent) => (
                  <div key={agent.name} className="flex items-start space-x-3 p-3 border rounded-md hover:bg-accent/50">
                    <Checkbox
                      id={`select-agent-${agent.name.replace(/\s+/g, '-')}`}
                      checked={selectedDefaultAgents[agent.name] || false}
                      onCheckedChange={(checked) => handleSelectDefaultAgent(agent.name, !!checked)}
                      className="mt-1"
                    />
                    <div className="grid gap-1.5 leading-none">
                      <Label
                        htmlFor={`select-agent-${agent.name.replace(/\s+/g, '-')}`}
                        className="text-base font-medium cursor-pointer"
                      >
                        {agent.name}
                      </Label>
                      <p className="text-sm text-muted-foreground">{agent.persona}</p>
                    </div>
                  </div>
                ))}
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">Cancel</Button>
                </DialogClose>
                <Button type="button" onClick={handleAddSelectedDefaultAgents} disabled={isAddingDefaults || Object.values(selectedDefaultAgents).every(v => !v)}>
                  {isAddingDefaults ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <PlusCircle className="mr-2 h-4 w-4" />
                  )}
                  Add Selected Agents
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

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
            You haven't created any AI agents yet. Get started by creating your first one or add some predefined ones!
          </p>
          <div className="flex justify-center gap-4">
             <Dialog open={showDefaultAgentsDialog} onOpenChange={(open) => { setShowDefaultAgentsDialog(open); if (!open) setSelectedDefaultAgents({}); }}>
              <DialogTrigger asChild>
                <Button variant="outline" disabled={isAddingDefaults}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Add Predefined Agents
                </Button>
              </DialogTrigger>
              {/* DialogContent is the same as above, duplicated for this empty state scenario trigger */}
              <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                  <DialogTitle>Add Predefined Agents</DialogTitle>
                  <DialogDescription>
                    Select the predefined agents you'd like to add to your account.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
                  {defaultAgents.map((agent) => (
                    <div key={agent.name} className="flex items-start space-x-3 p-3 border rounded-md hover:bg-accent/50">
                      <Checkbox
                        id={`empty-select-agent-${agent.name.replace(/\s+/g, '-')}`}
                        checked={selectedDefaultAgents[agent.name] || false}
                        onCheckedChange={(checked) => handleSelectDefaultAgent(agent.name, !!checked)}
                        className="mt-1"
                      />
                      <div className="grid gap-1.5 leading-none">
                        <Label
                          htmlFor={`empty-select-agent-${agent.name.replace(/\s+/g, '-')}`}
                          className="text-base font-medium cursor-pointer"
                        >
                          {agent.name}
                        </Label>
                        <p className="text-sm text-muted-foreground">{agent.persona}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="outline">Cancel</Button>
                  </DialogClose>
                  <Button type="button" onClick={handleAddSelectedDefaultAgents} disabled={isAddingDefaults || Object.values(selectedDefaultAgents).every(v => !v)}>
                    {isAddingDefaults ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <PlusCircle className="mr-2 h-4 w-4" />
                    )}
                    Add Selected Agents
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
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


    