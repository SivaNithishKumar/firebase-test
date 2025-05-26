"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { AgentCreationForm } from "@/components/agents/AgentCreationForm";
import { Skeleton } from "@/components/ui/skeleton";
import { Bot } from "lucide-react";

export default function CreateAgentPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    }
  }, [user, authLoading, router]);

  if (authLoading || !user) {
    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        <Skeleton className="h-10 w-1/2 mb-2" />
        <Skeleton className="h-8 w-3/4 mb-6" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-12 w-full" />
        <div className="flex justify-end">
          <Skeleton className="h-10 w-24" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8 text-center">
        <Bot className="h-12 w-12 mx-auto text-primary mb-2" />
        <h1 className="text-3xl font-bold tracking-tight">Create New AI Agent</h1>
        <p className="text-muted-foreground">
          Define the name and persona for your new AI companion.
        </p>
      </div>
      <AgentCreationForm userId={user.uid} />
    </div>
  );
}
