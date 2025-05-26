
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
import { collection, query, where, onSnapshot, orderBy, type Timestamp } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { PlusCircle, Users, Bot } from "lucide-react";

export default function AgentsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(true);
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
           // Helper to convert Firestore Timestamp to number or return original if not a Timestamp
          const convertTimestamp = (timestampField: any): number | any => {
            if (timestampField && typeof timestampField.toMillis === 'function') {
              return timestampField.toMillis();
            }
            return timestampField;
          };
          agentsData.push({ 
            id: doc.id, 
            ...data,
            createdAt: convertTimestamp(data.createdAt),
          } as Agent);
        });
        setAgents(agentsData);
        setLoadingAgents(false);
      }, (error) => {
        console.error("Error fetching agents:", error);
        toast({ title: "Error fetching agents", description: error.message, variant: "destructive" });
        setLoadingAgents(false);
      });
      return () => unsubscribe();
    }
  }, [user, toast]);

  if (authLoading || !user) {
    // Skeleton for page header
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
        <Button asChild>
          <Link href="/agents/create">
            <PlusCircle className="mr-2 h-4 w-4" /> Create New Agent
          </Link>
        </Button>
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
            You haven't created any AI agents yet. Get started by creating your first one!
          </p>
          <Button asChild variant="outline">
            <Link href="/agents/create">
              <PlusCircle className="mr-2 h-4 w-4" /> Create Your First Agent
            </Link>
          </Button>
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
