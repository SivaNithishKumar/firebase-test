
"use client";

import { useState, useEffect, useRef } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription as ShadcnFormDescription } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { Loader2, Save, Bot, SendIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription, DialogClose } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { converseToCreateAgent, type ConverseToCreateAgentInput, type ConverseToCreateAgentOutput } from "@/ai/flows/converseToCreateAgentFlow";
import type { Agent } from "@/types";


const agentSchema = z.object({
  name: z.string().min(2, "Agent name must be at least 2 characters.").max(50, "Agent name is too long (max 50 chars)."),
  persona: z.string().min(10, "Core persona description must be at least 10 characters.").max(1000, "Persona description is too long (max 1000 chars)."),
  archetype: z.string().min(2, "Archetype must be at least 2 characters.").max(100, "Archetype is too long (max 100 chars).").optional().or(z.literal("")),
  psychologicalProfile: z.string().min(2, "Psychological profile must be at least 2 characters.").max(200, "Psychological profile is too long (max 200 chars).").optional().or(z.literal("")),
  backstory: z.string().min(10, "Backstory must be at least 10 characters.").max(2000, "Backstory is too long (max 2000 chars).").optional().or(z.literal("")),
  languageStyle: z.string().min(5, "Language style must be at least 5 characters.").max(1000, "Language style is too long (max 1000 chars).").optional().or(z.literal("")),
  avatarUrl: z.string().url("Invalid avatar URL (must be https or placehold.co).").optional().refine(val => !val || val.startsWith("https://placehold.co/") || val.startsWith("https://"), {
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
  const chatScrollAreaRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (chatScrollAreaRef.current) {
      const scrollViewport = chatScrollAreaRef.current.querySelector('div[data-radix-scroll-area-viewport]');
      if (scrollViewport) {
        scrollViewport.scrollTop = scrollViewport.scrollHeight;
      }
    }
  }, [aiHelperChatMessages]);

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
    const initialDraft = form.getValues();
    setCurrentAgentDraft(initialDraft);
    
    let initialMessage = "Hello! I'm here to help you design a new AI agent. To start, what kind of agent are you imagining? Even a simple idea or a name is a great starting point!";
    if (Object.values(initialDraft).some(val => val && val.toString().trim() !== '')) {
        initialMessage = "Welcome back! I see we have some details for an agent already. What would you like to refine or work on next?";
    }

    setAiHelperChatMessages([{ id: "init", sender: "ai", text: initialMessage }]);
    setIsAIDraftFinalized(false); // Reset finalization state
    setShowAIHelperDialog(true);
  };

  const handleAIHelperSendMessage = async () => {
    if (!aiHelperUserInput.trim()) return;

    const newUserMessage: ChatMessage = { id: Date.now().toString(), sender: "user", text: aiHelperUserInput };
    const updatedChatHistory = [...aiHelperChatMessages, newUserMessage];
    setAiHelperChatMessages(updatedChatHistory);
    
    const currentMessageToAI = aiHelperUserInput; 
    setAiHelperUserInput("");
    setIsAIHelperLoading(true);

    try {
      const inputForAI: ConverseToCreateAgentInput = {
        chatHistory: updatedChatHistory.map(m => ({ role: m.sender === 'user' ? 'user' : 'ai', content: m.text })),
        currentAgentDraft: currentAgentDraft,
        userMessage: currentMessageToAI,
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
        toast({ title: "Agent Draft Ready!", description: "The AI has prepared a draft. Review it and apply if you're happy, or continue chatting to refine it." });
      }

    } catch (error: any) {
      console.error("Error with AI Helper:", error);
      toast({ title: "AI Helper Error", description: `Could not get AI assistance: ${error.message}`, variant: "destructive" });
      setAiHelperChatMessages(prev => [...prev, { id: (Date.now() + 1).toString(), sender: "ai", text: "Sorry, I encountered an error. Please try again or ask for help with a specific field." }]);
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
              <div className="flex justify-between items-start sm:items-center flex-col sm:flex-row gap-2">
                <div>
                  <CardTitle>Agent Details</CardTitle>
                  <CardDescription>Craft the identity of your new AI agent. The more detailed, the better!</CardDescription>
                </div>
                <Button type="button" variant="outline" onClick={handleOpenAIHelper} className="w-full sm:w-auto">
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
                      <Input placeholder="E.g., Nova 'Trendsetter' Li (max 50 chars)" {...field} />
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
                        placeholder="Describe the agent's primary personality, key behaviors, and how it generally interacts. (max 1000 chars)"
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
                      <Input placeholder="E.g., Creator / Innocent, Sage, Trickster (max 100 chars)" {...field} />
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
                      <Input placeholder="E.g., ENFP | High Openness, low Neuroticism (max 200 chars)" {...field} />
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
                        placeholder="Describe the agent's origin story, career, personal goals, hidden motivations, significant life events... (max 2000 chars)"
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
                        placeholder="Specify typical lexicon, emoji vocabulary, posting frequency, favored media (memes, text essays), tone (e.g., formal, sarcastic, bubbly)... (max 1000 chars)"
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
                      Link to an image for the agent's avatar. If empty, a default will be generated.
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
        <DialogContent className="max-w-3xl h-[85vh] flex flex-col p-0">
          <DialogHeader className="p-6 pb-2">
            <DialogTitle className="text-xl">AI Conversational Agent Builder</DialogTitle>
            <DialogDescription>
              Chat with the AI to build your agent's persona. The AI will ask questions and help fill out the details.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-grow grid grid-cols-1 md:grid-cols-2 gap-4 overflow-hidden p-6 pt-0">
            {/* Chat Area */}
            <div className="flex flex-col border rounded-lg p-3 bg-muted/20">
              <h3 className="text-lg font-semibold mb-2 text-center">Conversation</h3>
              <ScrollArea className="flex-grow h-0 mb-3 pr-2" ref={chatScrollAreaRef}>
                <div className="space-y-3">
                  {aiHelperChatMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`p-3 rounded-lg max-w-[90%] text-sm shadow-sm ${
                        msg.sender === "ai"
                          ? "bg-secondary text-secondary-foreground self-start"
                          : "bg-primary text-primary-foreground self-end ml-auto" 
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{msg.text}</p>
                    </div>
                  ))}
                   {isAIHelperLoading && (
                    <div className="p-3 rounded-lg max-w-[90%] text-sm shadow-sm bg-secondary text-secondary-foreground self-start flex items-center">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Thinking...
                    </div>
                   )}
                </div>
              </ScrollArea>
              <div className="flex items-center space-x-2 mt-auto pt-2 border-t">
                <Input
                  type="text"
                  placeholder="Your message to the AI..."
                  value={aiHelperUserInput}
                  onChange={(e) => setAiHelperUserInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && !isAIHelperLoading && handleAIHelperSendMessage()}
                  disabled={isAIHelperLoading}
                  className="bg-background"
                />
                <Button onClick={handleAIHelperSendMessage} disabled={isAIHelperLoading || !aiHelperUserInput.trim()} size="icon">
                  {isAIHelperLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendIcon className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {/* Agent Draft Preview Area */}
            <div className="border rounded-lg p-3 flex flex-col bg-muted/20">
               <h3 className="text-lg font-semibold mb-2 text-center">Agent Draft Preview</h3>
              <ScrollArea className="flex-grow h-0 pr-2"> 
                <div className="space-y-3 text-sm">
                  <div className="p-2 border-b"><strong>Name:</strong> {currentAgentDraft.name || <span className="text-muted-foreground italic">Not set</span>}</div>
                  <div className="p-2 border-b"><strong>Persona:</strong> {currentAgentDraft.persona || <span className="text-muted-foreground italic">Not set</span>}</div>
                  <div className="p-2 border-b"><strong>Archetype:</strong> {currentAgentDraft.archetype || <span className="text-muted-foreground italic">Not set</span>}</div>
                  <div className="p-2 border-b"><strong>Psychological Profile:</strong> {currentAgentDraft.psychologicalProfile || <span className="text-muted-foreground italic">Not set</span>}</div>
                  <div className="p-2 border-b"><strong>Backstory:</strong> {currentAgentDraft.backstory || <span className="text-muted-foreground italic">Not set</span>}</div>
                  <div className="p-2 border-b"><strong>Language Style:</strong> {currentAgentDraft.languageStyle || <span className="text-muted-foreground italic">Not set</span>}</div>
                  <div className="p-2">
                    <strong>Avatar URL:</strong> 
                    {currentAgentDraft.avatarUrl ? (
                        <a href={currentAgentDraft.avatarUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline ml-1 break-all">{currentAgentDraft.avatarUrl}</a>
                    ) : <span className="text-muted-foreground italic ml-1">Will be auto-generated</span>}
                    {currentAgentDraft.avatarUrl && <img src={currentAgentDraft.avatarUrl} alt="Avatar Preview" className="w-16 h-16 rounded-md mt-1 border"/>}
                  </div>
                </div>
              </ScrollArea>
            </div>
          </div>

          <DialogFooter className="mt-auto p-6 pt-4 border-t bg-background">
            <DialogClose asChild>
              <Button type="button" variant="outline">Close</Button>
            </DialogClose>
            <Button 
                type="button" 
                onClick={applyAIDraftToForm} 
                disabled={!isAIDraftFinalized && Object.values(currentAgentDraft).every(val => !val || val.toString().trim() === '')}
            >
              {isAIDraftFinalized ? "Apply Final Draft" : "Apply Current Draft"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
