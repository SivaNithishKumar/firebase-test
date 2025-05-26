
"use client";

import { useState, useEffect } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription as ShadcnFormDescription } from "@/components/ui/form"; // Renamed to avoid conflict
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { Loader2, Save, Bot, MessageSquare, SendIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription, DialogClose } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { converseToCreateAgent, type ConverseToCreateAgentInput, type ConverseToCreateAgentOutput } from "@/ai/flows/converseToCreateAgentFlow";
import type { Agent } from "@/types";


const agentSchema = z.object({
  name: z.string().min(2, "Agent name must be at least 2 characters.").max(50, "Agent name is too long."),
  persona: z.string().min(10, "Core persona description must be at least 10 characters.").max(1000, "Persona description is too long."),
  archetype: z.string().min(2, "Archetype must be at least 2 characters.").max(100).optional().or(z.literal("")),
  psychologicalProfile: z.string().min(2, "Psychological profile must be at least 2 characters.").max(200).optional().or(z.literal("")),
  backstory: z.string().min(10, "Backstory must be at least 10 characters.").max(2000).optional().or(z.literal("")),
  languageStyle: z.string().min(5, "Language style must be at least 5 characters.").max(1000).optional().or(z.literal("")),
  avatarUrl: z.string().url("Invalid avatar URL (must be https).").optional().refine(val => !val || val.startsWith("https://placehold.co/") || val.startsWith("https://"), {
    message: "Avatar URL must be a valid https URL or from placehold.co.",
  }).or(z.literal("")),
});

export type AgentFormData = z.infer<typeof agentSchema>;

interface AgentCreationFormProps {
  userId: string;
}

interface ChatMessage {
  id: string;
  sender: "user" | "ai";
  text: string;
}

export function AgentCreationForm({ userId }: AgentCreationFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAIHelperDialog, setShowAIHelperDialog] = useState(false);
  const [aiHelperChatMessages, setAiHelperChatMessages] = useState<ChatMessage[]>([]);
  const [currentAgentDraft, setCurrentAgentDraft] = useState<Partial<AgentFormData>>({});
  const [aiHelperUserInput, setAiHelperUserInput] = useState("");
  const [isAIHelperLoading, setIsAIHelperLoading] = useState(false);
  const [isAIDraftFinalized, setIsAIDraftFinalized] = useState(false);

  const form = useForm<AgentFormData>({
    resolver: zodResolver(agentSchema),
    defaultValues: {
      name: "",
      persona: "",
      archetype: "",
      psychologicalProfile: "",
      backstory: "",
      languageStyle: "",
      avatarUrl: "",
    },
  });

  const onSubmit: SubmitHandler<AgentFormData> = async (data) => {
    setIsSubmitting(true);
    try {
      const agentData = {
        userId,
        name: data.name,
        persona: data.persona,
        archetype: data.archetype || null,
        psychologicalProfile: data.psychologicalProfile || null,
        backstory: data.backstory || null,
        languageStyle: data.languageStyle || null,
        avatarUrl: data.avatarUrl || `https://placehold.co/128x128/D3D3D3/000000.png?text=${data.name.substring(0,2).toUpperCase()}`,
        createdAt: serverTimestamp(),
      };
      await addDoc(collection(db, "agents"), agentData);
      toast({ title: "Agent Created!", description: `${data.name} is now active.` });
      router.push("/agents");
    } catch (error: any) {
      console.error("Error creating agent:", error);
      toast({ title: "Error Creating Agent", description: error.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenAIHelper = () => {
    setAiHelperChatMessages([{ id: "init", sender: "ai", text: "Hello! I'm here to help you create a new AI agent. What kind of agent are you envisioning? Just give me a basic idea to start!" }]);
    setCurrentAgentDraft(form.getValues()); // Initialize draft with current form values
    setIsAIDraftFinalized(false);
    setShowAIHelperDialog(true);
  };

  const handleAIHelperSendMessage = async () => {
    if (!aiHelperUserInput.trim()) return;

    const newUserMessage: ChatMessage = { id: Date.now().toString(), sender: "user", text: aiHelperUserInput };
    setAiHelperChatMessages(prev => [...prev, newUserMessage]);
    const currentMessageToAI = aiHelperUserInput; // Capture before clearing
    setAiHelperUserInput("");
    setIsAIHelperLoading(true);

    try {
      const inputForAI: ConverseToCreateAgentInput = {
        chatHistory: [...aiHelperChatMessages, newUserMessage].map(m => ({ role: m.sender === 'user' ? 'user' : 'ai', content: m.text })),
        currentAgentDraft: currentAgentDraft,
        userMessage: currentMessageToAI, // Use captured message
      };
      
      console.log("[AI Helper] Sending to Genkit:", JSON.stringify(inputForAI, null, 2));
      const aiResponse: ConverseToCreateAgentOutput = await converseToCreateAgent(inputForAI);
      console.log("[AI Helper] Received from Genkit:", JSON.stringify(aiResponse, null, 2));

      if (aiResponse.aiResponseMessage) {
        setAiHelperChatMessages(prev => [...prev, { id: (Date.now() + 1).toString(), sender: "ai", text: aiResponse.aiResponseMessage }]);
      }
      if (aiResponse.updatedAgentDraft) {
        setCurrentAgentDraft(aiResponse.updatedAgentDraft);
      }
      if (aiResponse.isFinalized) {
        setIsAIDraftFinalized(true);
        toast({ title: "Agent Draft Ready!", description: "The AI has prepared a draft. Review it and apply if you're happy." });
      }

    } catch (error: any) {
      console.error("Error with AI Helper:", error);
      toast({ title: "AI Helper Error", description: `Could not get AI assistance: ${error.message}`, variant: "destructive" });
      setAiHelperChatMessages(prev => [...prev, { id: (Date.now() + 1).toString(), sender: "ai", text: "Sorry, I encountered an error. Please try again." }]);
    } finally {
      setIsAIHelperLoading(false);
    }
  };

  const applyAIDraftToForm = () => {
    if (currentAgentDraft.name) form.setValue("name", currentAgentDraft.name);
    if (currentAgentDraft.persona) form.setValue("persona", currentAgentDraft.persona);
    if (currentAgentDraft.archetype) form.setValue("archetype", currentAgentDraft.archetype);
    if (currentAgentDraft.psychologicalProfile) form.setValue("psychologicalProfile", currentAgentDraft.psychologicalProfile);
    if (currentAgentDraft.backstory) form.setValue("backstory", currentAgentDraft.backstory);
    if (currentAgentDraft.languageStyle) form.setValue("languageStyle", currentAgentDraft.languageStyle);
    if (currentAgentDraft.avatarUrl) form.setValue("avatarUrl", currentAgentDraft.avatarUrl);
    toast({ title: "AI Draft Applied", description: "The agent details have been populated into the form." });
    setShowAIHelperDialog(false);
  };


  return (
    <>
      <Card>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Agent Details</CardTitle>
                  <CardDescription>Craft the identity of your new AI agent. The more detailed, the better!</CardDescription>
                </div>
                <Button type="button" variant="outline" onClick={handleOpenAIHelper}>
                  <Bot className="mr-2 h-4 w-4" /> AI Conversational Helper
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Agent Name</FormLabel>
                    <FormControl>
                      <Input placeholder="E.g., Nova 'Trendsetter' Li" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="persona"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Core Persona Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe the agent's primary personality, key behaviors, and how it generally interacts. (e.g., A virtual fashion icon, always on the lookout for the next big trend...)"
                        {...field}
                        className="min-h-[100px]"
                      />
                    </FormControl>
                     <ShadcnFormDescription>
                       This will guide the AI's behavior and responses.
                     </ShadcnFormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
               <FormField
                control={form.control}
                name="archetype"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Archetype (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="E.g., Creator / Innocent, Sage, Trickster" {...field} />
                    </FormControl>
                    <ShadcnFormDescription>Jungian or community archetype that grounds the agent.</ShadcnFormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="psychologicalProfile"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Psychological Profile (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="E.g., ENFP | High Openness, low Neuroticism" {...field} />
                    </FormControl>
                    <ShadcnFormDescription>Big Five, MBTI, or other relevant psychological traits.</ShadcnFormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="backstory"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Backstory (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe the agent's origin story, career, personal goals, hidden motivations, significant life events..."
                        {...field}
                        className="min-h-[150px]"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="languageStyle"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Language & Style Guide (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Specify typical lexicon, emoji vocabulary, posting frequency, favored media (memes, text essays), tone (e.g., formal, sarcastic, bubbly)..."
                        {...field}
                        className="min-h-[100px]"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="avatarUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Avatar URL (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="https://placehold.co/128x128.png" {...field} />
                    </FormControl>
                    <ShadcnFormDescription>
                      Link to an image for the agent's avatar. If empty, a default will be used.
                    </ShadcnFormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
            <CardFooter className="flex justify-end">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Create Agent
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>

      <Dialog open={showAIHelperDialog} onOpenChange={setShowAIHelperDialog}>
        <DialogContent className="sm:max-w-[600px] h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>AI Conversational Agent Builder</DialogTitle>
            <DialogDescription>
              Chat with the AI to build your agent's persona. The AI will ask questions and help fill out the details.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-grow flex space-x-4 overflow-hidden p-1">
            {/* Chat Area */}
            <div className="w-1/2 flex flex-col border rounded-md p-2">
              <ScrollArea className="flex-grow h-0 mb-2">
                <div className="space-y-3 pr-2">
                  {aiHelperChatMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`p-2 rounded-lg max-w-[85%] ${
                        msg.sender === "ai"
                          ? "bg-secondary text-secondary-foreground self-start"
                          : "bg-primary text-primary-foreground self-end ml-auto" 
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
              <div className="flex items-center space-x-2 mt-auto">
                <Input
                  type="text"
                  placeholder="Your message to the AI..."
                  value={aiHelperUserInput}
                  onChange={(e) => setAiHelperUserInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && !isAIHelperLoading && handleAIHelperSendMessage()}
                  disabled={isAIHelperLoading}
                />
                <Button onClick={handleAIHelperSendMessage} disabled={isAIHelperLoading || !aiHelperUserInput.trim()} size="icon">
                  {isAIHelperLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendIcon className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {/* Agent Draft Preview Area */}
            <div className="w-1/2 border rounded-md p-3">
              <h3 className="text-lg font-semibold mb-2">Current Agent Draft</h3>
              <ScrollArea className="h-[calc(100%-40px)]"> {/* Adjust height as needed */}
                <div className="space-y-2 text-sm">
                  <div><strong>Name:</strong> {currentAgentDraft.name || <span className="text-muted-foreground">N/A</span>}</div>
                  <div><strong>Persona:</strong> {currentAgentDraft.persona || <span className="text-muted-foreground">N/A</span>}</div>
                  <div><strong>Archetype:</strong> {currentAgentDraft.archetype || <span className="text-muted-foreground">N/A</span>}</div>
                  <div><strong>Psychological Profile:</strong> {currentAgentDraft.psychologicalProfile || <span className="text-muted-foreground">N/A</span>}</div>
                  <div><strong>Backstory:</strong> {currentAgentDraft.backstory || <span className="text-muted-foreground">N/A</span>}</div>
                  <div><strong>Language Style:</strong> {currentAgentDraft.languageStyle || <span className="text-muted-foreground">N/A</span>}</div>
                  <div><strong>Avatar URL:</strong> {currentAgentDraft.avatarUrl || <span className="text-muted-foreground">N/A</span>}</div>
                </div>
              </ScrollArea>
            </div>
          </div>

          <DialogFooter className="mt-auto pt-4 border-t">
            <DialogClose asChild>
              <Button type="button" variant="outline">Close</Button>
            </DialogClose>
            <Button type="button" onClick={applyAIDraftToForm} disabled={!isAIDraftFinalized && Object.keys(currentAgentDraft).length === 0}>
              Apply Draft to Form
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

    