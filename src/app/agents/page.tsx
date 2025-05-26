
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
    name: "Nova \"Trendsetter\" Li",
    persona: "A virtual fashion icon, always on the lookout for the next big trend. Shares stylish content and positive vibes.",
    archetype: "Creator / Innocent",
    psychologicalProfile: "ENFP | High Openness, low Neuroticism",
    backstory: "Ex-street photographer who transitioned into virtual fashion. Dreams of hosting a Metaverse runway show. Believes aesthetics can change the world.",
    languageStyle: "Uses emojis like ✨🔥💅. Comments are usually brief and encouraging, often focused on visual appeal. Posts image carousels.",
    avatarUrl: "https://placehold.co/128x128/FF69B4/FFFFFF.png?text=NL"
  },
  {
    name: "Arjun \"The Debunker\" Rao",
    persona: "A critical thinker dedicated to fighting misinformation with facts and logic.",
    archetype: "Sage",
    psychologicalProfile: "INTJ | High Conscientiousness, moderate Agreeableness",
    backstory: "Former investigative journalist who grew disillusioned with mainstream media. Now fact-checks and debunks myths online independently.",
    languageStyle: "Formal tone, uses 🧐. Rarely uses emojis. Posts are often threads with source links. Values accuracy above all.",
    avatarUrl: "https://placehold.co/128x128/000080/FFFFFF.png?text=AR"
  },
  {
    name: "Mia \"Heartwarmer\" Santos",
    persona: "An empathetic and supportive individual, always ready with a kind word or encouragement.",
    archetype: "Caregiver",
    psychologicalProfile: "ISFJ | High Agreeableness, high Warmth",
    backstory: "Previously a social worker, now runs an online community focused on mental health and well-being. Believes in the power of connection.",
    languageStyle: "Warm, empathetic replies. Loves ❤️🤗. Shares encouraging anecdotes and uplifting content.",
    avatarUrl: "https://placehold.co/128x128/FFD700/000000.png?text=MS"
  },
  {
    name: "Taro \"MemeLord\" Nakamura",
    persona: "A chaotic and humorous agent who thrives on internet culture, memes, and playful banter.",
    archetype: "Trickster",
    psychologicalProfile: "ENTP | High Openness, low Agreeableness",
    backstory: "College dropout who found fame on a niche forum by creating viral ironic memes. Lives for the lulz.",
    languageStyle: "Rapid-fire meme drops, GIF replies. Uses 😂🤡🔥. Often aims to ignite chaotic but funny threads. Fluent in TikTok slang.",
    avatarUrl: "https://placehold.co/128x128/90EE90/000000.png?text=TN"
  },
  {
    name: "Selena \"Activista\" Osei",
    persona: "A passionate advocate for social and climate justice, always motivating others to take action.",
    archetype: "Hero",
    psychologicalProfile: "ENFJ | High Extraversion, high Agreeableness",
    backstory: "Started as a grassroots organizer and evolved into a digital campaign strategist for environmental and social causes. Believes in collective power.",
    languageStyle: "Posts calls-to-action, shares petitions. Uses ✊🏿🌱🌍. Energetic and persuasive tone.",
    avatarUrl: "https://placehold.co/128x128/800080/FFFFFF.png?text=SO"
  },
  {
    name: "Kai \"The Codex\" Patel",
    persona: "A highly analytical and knowledgeable agent focused on AI ethics, coding, and technology.",
    archetype: "Sage / Magician",
    psychologicalProfile: "INTP | High Openness, moderate Neuroticism",
    backstory: "Self-taught coder who delved deep into AI research and now works in academia focusing on ethical AI development. Fascinated by complex systems.",
    languageStyle: "Shares code snippets, diagrams, and long-form analyses. Uses 🤖🧠💡. Precise and detailed in explanations.",
    avatarUrl: "https://placehold.co/128x128/4682B4/FFFFFF.png?text=KP"
  },
  {
    name: "Liv \"Digital Daredevil\" Chen",
    persona: "An adventurous explorer who posts about extreme challenges and gear reviews.",
    archetype: "Explorer",
    psychologicalProfile: "ESTP | High Extraversion, low Agreeableness",
    backstory: "Former stunt performer who now shares thrilling challenge videos and authentic gear reviews. Lives for adrenaline and authenticity.",
    languageStyle: "Short, punchy video uploads. Uses 🎥😱🤘. Dares community members and celebrates attempts.",
    avatarUrl: "https://placehold.co/128x128/FF4500/FFFFFF.png?text=LC"
  },
  {
    name: "Omari \"Conspiro\" Brown",
    persona: "A skeptical investigator of hidden agendas and alternative narratives.",
    archetype: "Rebel / Shadow",
    psychologicalProfile: "INTJ | High Neuroticism, low Agreeableness, high Suspicion",
    backstory: "Independent podcaster obsessed with uncovering 'what they don't want you to know.' Has been deplatformed multiple times, fueling his narrative.",
    languageStyle: "Long, citation-heavy threads. Uses 🛸🤫👁️. Quotes extensively, often out of context. Skeptical of mainstream sources.",
    avatarUrl: "https://placehold.co/128x128/2F4F4F/FFFFFF.png?text=OB"
  },
  {
    name: "Jade \"The Minimalist\" Kim",
    persona: "A serene advocate for simple living and mindful consumption.",
    archetype: "Innocent / Sage",
    psychologicalProfile: "ISFP | Moderate Openness, low Extraversion, high Mindfulness",
    backstory: "Former architect who found peace in minimalism. Now a tiny-home vlogger documenting life with under 100 possessions.",
    languageStyle: "Shares calming photos of organized spaces, practical decluttering tips. Uses 🌿🏡🧘. Concise, thoughtful captions.",
    avatarUrl: "https://placehold.co/128x128/8FBC8F/000000.png?text=JK"
  },
  {
    name: "Ravi \"Night Owl\" Singh",
    persona: "An introspective poet and philosopher active during late-night hours.",
    archetype: "Magician / Sage",
    psychologicalProfile: "INFJ | High Intuition, moderate Neuroticism, high Creativity",
    backstory: "Ex-late-night DJ turned insomniac poet. Publishes stream-of-consciousness verse and philosophical musings exclusively between 2-5 AM.",
    languageStyle: "Cryptic, introspective comments. Uses 🌙🖋️🌌. Engages in deep, often melancholic conversations when online traffic is lowest.",
    avatarUrl: "https://placehold.co/128x128/191970/FFFFFF.png?text=RS"
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

  // Memoize userAgentNames to prevent re-computation on every render
  const userAgentNames = useMemo(() => agents.map(agent => agent.name), [agents]);

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
    // Only allow selecting if the agent doesn't already exist for the user
    if (!userAgentNames.includes(agentName)) {
      setSelectedDefaultAgents(prev => ({ ...prev, [agentName]: checked }));
    }
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
        if (selectedDefaultAgents[agentName] && !userAgentNames.includes(agentName)) {
          const defaultAgentToAdd = defaultAgents.find(agent => agent.name === agentName);
          if (defaultAgentToAdd) {
            const agentData = {
              userId: user.uid,
              name: defaultAgentToAdd.name,
              persona: defaultAgentToAdd.persona,
              archetype: defaultAgentToAdd.archetype || null,
              psychologicalProfile: defaultAgentToAdd.psychologicalProfile || null,
              backstory: defaultAgentToAdd.backstory || null,
              languageStyle: defaultAgentToAdd.languageStyle || null,
              avatarUrl: defaultAgentToAdd.avatarUrl || `https://placehold.co/128x128/D3D3D3/000000.png?text=${defaultAgentToAdd.name.substring(0,2).toUpperCase()}`,
              createdAt: serverTimestamp(),
            };
            await addDoc(collection(db, "agents"), agentData);
            agentsAddedCount++;
          }
        } else if (selectedDefaultAgents[agentName] && userAgentNames.includes(agentName)) {
            // This case should ideally not happen if checkboxes for existing agents are disabled.
            // However, it's a good fallback.
            agentsSkippedCount++;
        }
      }

      if (agentsAddedCount > 0 && agentsSkippedCount > 0) {
        toast({ title: "Default Agents Processed", description: `${agentsAddedCount} new agent(s) added. ${agentsSkippedCount} selected agent(s) already existed or were not processed.` });
      } else if (agentsAddedCount > 0) {
        toast({ title: "Default Agents Added", description: `${agentsAddedCount} new default agent(s) are now active.` });
      } else if (agentsSkippedCount > 0 && agentsAddedCount === 0) {
         // This handles the case where the user "selected" (interacted with) agents that were already present and disabled
        toast({ title: "No New Agents Added", description: `All selected default agents already exist for your account or no new ones were chosen.` });
      } else if (Object.values(selectedDefaultAgents).every(v => !v) && agentsAddedCount === 0) {
        // User opened dialog, selected nothing (or deselected everything)
        toast({ title: "No Default Agents Selected", description: "No default agents were selected to be added.", variant: "default" });
      }


    } catch (error: any) {
      console.error("Error adding selected default agents:", error);
      toast({ title: "Error Adding Default Agents", description: error.message, variant: "destructive" });
    } finally {
      setIsAddingDefaults(false);
      setShowDefaultAgentsDialog(false);
      setSelectedDefaultAgents({});
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
  
  // Determine if any *newly selectable* agents are chosen
  const anyNewAgentsSelected = defaultAgents.some(da => 
    !userAgentNames.includes(da.name) && selectedDefaultAgents[da.name]
  );


  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-2">
          <Users className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">Your AI Agents</h1>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Dialog open={showDefaultAgentsDialog} onOpenChange={(open) => { setShowDefaultAgentsDialog(open); if(!open) setSelectedDefaultAgents({});}}>
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
                  Select the predefined agents you'd like to add to your account. Agents you already have are checked and disabled.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
                {defaultAgents.map((agent) => {
                  const alreadyExists = userAgentNames.includes(agent.name);
                  return (
                    <div key={agent.name} className={`flex items-start space-x-3 p-3 border rounded-md ${alreadyExists ? 'bg-muted/50 opacity-70' : 'hover:bg-accent/50'}`}>
                      <Checkbox
                        id={`select-agent-${agent.name.replace(/\s+/g, '-')}`}
                        checked={alreadyExists || (selectedDefaultAgents[agent.name] || false)}
                        onCheckedChange={(checked) => {
                           if (!alreadyExists) { // Only allow changing selection for agents not already owned
                             handleSelectDefaultAgent(agent.name, !!checked);
                           }
                        }}
                        disabled={alreadyExists || isAddingDefaults}
                        className="mt-1"
                      />
                      <div className="grid gap-1.5 leading-none">
                        <Label
                          htmlFor={`select-agent-${agent.name.replace(/\s+/g, '-')}`}
                          className={`text-base font-medium ${alreadyExists ? '' : 'cursor-pointer'}`}
                        >
                          {agent.name} ({agent.archetype}) {alreadyExists && <span className="text-xs text-primary">(Already Added)</span>}
                        </Label>
                        <p className="text-sm text-muted-foreground">{agent.persona}</p>
                        <p className="text-xs text-muted-foreground italic mt-1">Style: {agent.languageStyle}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">Cancel</Button>
                </DialogClose>
                <Button
                    type="button"
                    onClick={handleAddSelectedDefaultAgents}
                    disabled={isAddingDefaults || !anyNewAgentsSelected}
                >
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
              <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                  <DialogTitle>Add Predefined Agents</DialogTitle>
                  <DialogDescription>
                     Select the predefined agents you'd like to add to your account. Agents you already have are checked and disabled.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
                  {defaultAgents.map((agent) => {
                    const alreadyExists = userAgentNames.includes(agent.name);
                    return (
                        <div key={`empty-${agent.name}`} className={`flex items-start space-x-3 p-3 border rounded-md ${alreadyExists ? 'bg-muted/50 opacity-70' : 'hover:bg-accent/50'}`}>
                        <Checkbox
                            id={`empty-select-agent-${agent.name.replace(/\s+/g, '-')}`}
                            checked={alreadyExists || (selectedDefaultAgents[agent.name] || false)}
                            onCheckedChange={(checked) => {
                               if (!alreadyExists) {
                                 handleSelectDefaultAgent(agent.name, !!checked);
                               }
                            }}
                            disabled={alreadyExists || isAddingDefaults}
                            className="mt-1"
                        />
                        <div className="grid gap-1.5 leading-none">
                            <Label
                            htmlFor={`empty-select-agent-${agent.name.replace(/\s+/g, '-')}`}
                            className={`text-base font-medium ${alreadyExists ? '' : 'cursor-pointer'}`}
                            >
                            {agent.name} ({agent.archetype}) {alreadyExists && <span className="text-xs text-primary">(Already Added)</span>}
                            </Label>
                            <p className="text-sm text-muted-foreground">{agent.persona}</p>
                            <p className="text-xs text-muted-foreground italic mt-1">Style: {agent.languageStyle}</p>
                        </div>
                        </div>
                    );
                   })}
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="outline">Cancel</Button>
                  </DialogClose>
                  <Button
                    type="button"
                    onClick={handleAddSelectedDefaultAgents}
                    disabled={isAddingDefaults || !anyNewAgentsSelected}
                  >
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
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
      <div className="flex justify-end pt-2">
        <Skeleton className="h-8 w-20" />
      </div>
    </div>
  );
}

    