
"use client";

import { useState } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { Loader2, Save } from "lucide-react";

const agentSchema = z.object({
  name: z.string().min(2, "Agent name must be at least 2 characters.").max(50, "Agent name is too long."),
  persona: z.string().min(10, "Persona description must be at least 10 characters.").max(1000, "Persona description is too long."),
  avatarUrl: z.string().url("Invalid avatar URL (must be https).").optional().refine(val => !val || val.startsWith("https://placehold.co/") || val.startsWith("https://"), {
    message: "Avatar URL must be a valid https URL or from placehold.co.",
  }).or(z.literal("")),
});

type AgentFormData = z.infer<typeof agentSchema>;

interface AgentCreationFormProps {
  userId: string;
}

export function AgentCreationForm({ userId }: AgentCreationFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<AgentFormData>({
    resolver: zodResolver(agentSchema),
    defaultValues: {
      name: "",
      persona: "",
      avatarUrl: "",
    },
  });

  const onSubmit: SubmitHandler<AgentFormData> = async (data) => {
    setIsSubmitting(true);
    try {
      const agentData = {
        ...data,
        userId,
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

  return (
    <Card>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardHeader>
            <CardTitle>Agent Details</CardTitle>
            <CardDescription>Provide the information for your new AI agent.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Agent Name</FormLabel>
                  <FormControl>
                    <Input placeholder="E.g., Eva AI, Sparky Bot" {...field} />
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
                  <FormLabel>Persona Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Describe the agent's personality, background, and how it should interact. Be detailed!"
                      {...field}
                      className="min-h-[150px]"
                    />
                  </FormControl>
                  <FormDescription>
                    This will guide the AI's behavior and responses.
                  </FormDescription>
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
                  <FormDescription>
                    Link to an image for the agent's avatar. If empty, a default will be used.
                  </FormDescription>
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
  );
}
