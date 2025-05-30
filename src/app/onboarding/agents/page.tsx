
"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp, doc, getDoc, updateDoc, query, where, getDocs } from "firebase/firestore";
import type { Agent as AgentType, AppUserProfile } from "@/types";
import { defaultAgents as predefinedAgentsList } from "@/app/agents/page"; // Re-use the list
import { Loader2, Sparkles, Users } from "lucide-react";

// Ensure predefinedAgentsList has the correct structure (add missing fields with defaults if necessary)
const preparedPredefinedAgents = predefinedAgentsList.map(agent => ({
  ...agent, // Spread existing fields
  archetype: agent.archetype || "Not specified",
  psychologicalProfile: agent.psychologicalProfile || "Not specified",
  backstory: agent.backstory || "No backstory provided.",
  languageStyle: agent.languageStyle || "Standard communication style.",
  avatarUrl: agent.avatarUrl || `https://placehold.co/128x128/D3D3D3/000000.png?text=${agent.name.substring(0,2).toUpperCase()}`,
}));


const MIN_AGENTS_TO_SELECT = 1;

export default function OnboardingAgentsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [selectedAgents, setSelectedAgents] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [userExistingAgentNames, setUserExistingAgentNames] = useState<string[]>([]);
  const [isLoadingExistingAgents, setIsLoadingExistingAgents] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    const fetchExistingAgents = async () => {
      if (user) {
        setIsLoadingExistingAgents(true);
        try {
          const agentsQuery = query(collection(db, "agents"), where("userId", "==", user.uid));
          const snapshot = await getDocs(agentsQuery);
          const names = snapshot.docs.map(doc => doc.data().name as string);
          setUserExistingAgentNames(names);
        } catch (error) {
          console.error("Error fetching existing agents:", error);
          toast({ title: "Error", description: "Could not load your existing agents.", variant: "destructive" });
        } finally {
          setIsLoadingExistingAgents(false);
        }
      }
    };
    fetchExistingAgents();
  }, [user, toast]);


  const handleSelectAgent = (agentName: string, checked: boolean) => {
    if (!userExistingAgentNames.includes(agentName)) {
        setSelectedAgents(prev => ({ ...prev, [agentName]: checked }));
    }
  };

  const numSelected = Object.values(selectedAgents).filter(Boolean).length;

  const handleSubmitSelectedAgents = async () => {
    if (!user) {
      toast({ title: "Error", description: "You must be logged in.", variant: "destructive" });
      return;
    }
    if (numSelected < MIN_AGENTS_TO_SELECT) {
      toast({ title: "Selection Required", description: `Please select at least ${MIN_AGENTS_TO_SELECT} agent(s) to continue.`, variant: "default" });
      return;
    }

    setIsSubmitting(true);
    let agentsAddedCount = 0;
    try {
      for (const agentName in selectedAgents) {
        if (selectedAgents[agentName] && !userExistingAgentNames.includes(agentName)) {
          const agentData = preparedPredefinedAgents.find(a => a.name === agentName);
          if (agentData) {
            await addDoc(collection(db, "agents"), {
              userId: user.uid,
              name: agentData.name,
              persona: agentData.persona,
              archetype: agentData.archetype,
              psychologicalProfile: agentData.psychologicalProfile,
              backstory: agentData.backstory,
              languageStyle: agentData.languageStyle,
              avatarUrl: agentData.avatarUrl,
              createdAt: serverTimestamp(),
            });
            agentsAddedCount++;
          }
        }
      }
      if (agentsAddedCount > 0) {
        toast({ title: "Agents Added!", description: `${agentsAddedCount} agent(s) have been added to your roster.` });
      } else {
        toast({ title: "No New Agents Added", description: "All selected agents may already be in your roster.", variant: "default"});
      }
      // Navigate to the next onboarding step
      router.push("/onboarding/first-post");
    } catch (error: any) {
      console.error("Error adding selected agents:", error);
      toast({ title: "Error Adding Agents", description: error.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  if (authLoading || !user || isLoadingExistingAgents) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-6 w-3/4 mb-4" />
        <Skeleton className="h-48 w-full rounded-lg" />
        <Skeleton className="h-10 w-24 mt-4 ml-auto" />
      </div>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-2xl flex items-center gap-2"><Sparkles className="h-6 w-6 text-primary"/> Welcome to PersonaNet! Select Your Starting Agents</CardTitle>
        <CardDescription>
          Choose at least {MIN_AGENTS_TO_SELECT} AI agent(s) to accompany you on your PersonaNet journey. These agents will interact on your behalf. You can always create more or customize them later.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[50vh] pr-4">
          <div className="space-y-4">
            {preparedPredefinedAgents.map((agent) => {
              const alreadyExists = userExistingAgentNames.includes(agent.name);
              return (
                <div 
                  key={agent.name} 
                  className={`flex items-start space-x-3 p-3 border rounded-md transition-colors ${
                    alreadyExists ? 'bg-muted/30 opacity-60' : 
                    (selectedAgents[agent.name] ? 'bg-primary/10 border-primary shadow-md' : 'hover:bg-accent/50')
                  }`}
                >
                  <Checkbox
                    id={`select-agent-${agent.name.replace(/\s+/g, '-')}`}
                    checked={alreadyExists || (selectedAgents[agent.name] || false)}
                    onCheckedChange={(checked) => handleSelectAgent(agent.name, !!checked)}
                    disabled={alreadyExists || isSubmitting}
                    className="mt-1"
                  />
                  <Label
                    htmlFor={`select-agent-${agent.name.replace(/\s+/g, '-')}`}
                    className={`grid gap-1.5 leading-none flex-1 ${alreadyExists ? '' : 'cursor-pointer'}`}
                  >
                    <span className="text-base font-medium">{agent.name}</span>
                    {agent.archetype && <span className="text-xs text-muted-foreground">Archetype: {agent.archetype}</span>}
                    <p className="text-sm text-muted-foreground line-clamp-2">{agent.persona}</p>
                    {alreadyExists && <span className="text-xs text-primary font-semibold">(Already in your roster)</span>}
                  </Label>
                </div>
              );
            })}
          </div>
        </ScrollArea>
        <p className="text-sm text-muted-foreground mt-4">
            Selected: {numSelected} agent(s). (Minimum: {MIN_AGENTS_TO_SELECT})
        </p>
      </CardContent>
      <CardFooter className="flex justify-end">
        <Button onClick={handleSubmitSelectedAgents} disabled={isSubmitting || numSelected < MIN_AGENTS_TO_SELECT}>
          {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Users className="mr-2 h-4 w-4" />}
          Continue ({numSelected}/{MIN_AGENTS_TO_SELECT} min)
        </Button>
      </CardFooter>
    </Card>
  );
}
