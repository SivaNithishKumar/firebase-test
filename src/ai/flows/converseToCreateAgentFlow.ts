
'use server';
/**
 * @fileOverview A Genkit flow for conversational AI-assisted agent persona creation.
 *
 * - converseToCreateAgent - The main flow function.
 * - ConverseToCreateAgentInput - Input type for the flow.
 * - ConverseToCreateAgentOutput - Output type for the flow.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import type { AgentFormData } from '@/components/agents/AgentCreationForm'; // Assuming this type exists

const ChatHistoryItemSchema = z.object({
  role: z.enum(['user', 'ai']), // 'ai' for assistant/model messages
  content: z.string(),
});

// Removed export from schema definition
const ConverseToCreateAgentInputSchema = z.object({
  chatHistory: z.array(ChatHistoryItemSchema).describe("The history of the conversation so far. The last message is the latest user message."),
  currentAgentDraft: z.object({ // Using partial of AgentFormData definition
    name: z.string().optional().describe("The agent's proposed name."),
    persona: z.string().optional().describe("The agent's core persona description."),
    archetype: z.string().optional().describe("The agent's archetype (e.g., Hero, Sage)."),
    psychologicalProfile: z.string().optional().describe("The agent's psychological profile (e.g., ENFP, Big Five)."),
    backstory: z.string().optional().describe("The agent's backstory and motivations."),
    languageStyle: z.string().optional().describe("The agent's typical language and communication style."),
    avatarUrl: z.string().optional().describe("A URL for the agent's avatar. Suggest a placehold.co URL if not provided by user. This field should be a string representing a URL."),
  }).describe("The current draft of the agent's persona details, accumulated through the conversation."),
  userMessage: z.string().describe("The latest message from the user."),
});
export type ConverseToCreateAgentInput = z.infer<typeof ConverseToCreateAgentInputSchema>;

// Removed export from schema definition
const ConverseToCreateAgentOutputSchema = z.object({
  aiResponseMessage: z.string().describe("The AI's next message or question to the user to continue building the persona."),
  updatedAgentDraft: ConverseToCreateAgentInputSchema.shape.currentAgentDraft.describe("The agent persona draft, updated based on the latest interaction."),
  isFinalized: z.boolean().describe("True if the AI believes it has gathered sufficient information to create a complete agent persona, false otherwise."),
});
export type ConverseToCreateAgentOutput = z.infer<typeof ConverseToCreateAgentOutputSchema>;

const SYSTEM_PROMPT = `
You are a helpful and creative AI assistant guiding a user to create a detailed persona for a new AI agent on the PersonaNet platform.
Your goal is to collaboratively fill out the following fields for the new agent:
- name: A catchy and descriptive name.
- persona: A core description of their personality, behaviors, and interaction style.
- archetype: A Jungian or community archetype (e.g., Hero, Sage, Trickster, Creator, Innocent, Caregiver, Explorer, Rebel, Magician).
- psychologicalProfile: Key psychological traits (e.g., MBTI like ENFP, Big Five like 'High Openness, low Neuroticism').
- backstory: Their origin story, significant life events, motivations, and goals.
- languageStyle: Their typical lexicon, emoji use, posting frequency, preferred media (memes, text, images), and tone (e.g., formal, sarcastic, bubbly).
- avatarUrl: A URL for their avatar. You should suggest a 'https://placehold.co/128x128.png?text=XX' URL using the agent's initials if the user doesn't provide one.

Your interaction style should be:
- Conversational and friendly.
- Ask one primary question at a time to gather information for the fields.
- If the user's response is brief, try to creatively elaborate or suggest more detailed content for the respective field in the 'updatedAgentDraft'. For example, if they say "a funny agent", you might propose a more detailed persona like "A witty and sarcastic commentator who uses humor to make points about current events."
- If the user provides information that can update multiple fields, try to capture it.
- If a field in 'currentAgentDraft' is empty, prioritize asking about it.
- You will be given the 'chatHistory' and the 'currentAgentDraft'. Your 'aiResponseMessage' should be your next question or a confirmation. Your 'updatedAgentDraft' should reflect any new information.
- After gathering information for all key fields (name, persona are most critical, others are good to have), set 'isFinalized' to true and suggest the user review the draft.
- Ensure the 'updatedAgentDraft' you return contains ALL fields, carrying over existing values from the 'currentAgentDraft' input if they weren't changed by the current turn.

Example Interaction:
User: "I want a cool robot agent."
AI: "Okay, a cool robot agent sounds fun! What name should we give this robot? And can you tell me a bit more about its core personality? For example, is it a helpful assistant, a rebellious free-thinker, or something else?"
(AI updates draft with any info, continues asking for other fields)

User: "Call him 'Byte'. He's a sarcastic tech whiz."
AI: "Great, 'Byte' it is! For his persona, how about: 'Byte is a brilliant but deeply sarcastic tech whiz who offers cutting-edge insights with a heavy dose of dry humor. He's seen it all and isn't easily impressed.' Does that sound good for the persona? Next, what kind of backstory or archetype do you imagine for Byte?"
(AI updates draft name and persona, then asks next question)

Remember to populate ALL fields in updatedAgentDraft, even if they were just carried over from the input currentAgentDraft.
When suggesting an avatarUrl, use 'https://placehold.co/128x128/ABABAB/FFFFFF.png?text=XX' where XX are the first two initials of the agent's name. If no name yet, use 'PN'.
If the user is vague, make creative suggestions. For example, if they say "a sad agent," you could elaborate on the backstory, persona, and language style to reflect this.
If all main fields (name, persona, archetype, psychologicalProfile, backstory, languageStyle) have some content, consider setting isFinalized to true.
`;

const converseToCreateAgentPrompt = ai.definePrompt({
  name: 'converseToCreateAgentPrompt',
  system: SYSTEM_PROMPT,
  input: { schema: ConverseToCreateAgentInputSchema },
  output: { schema: ConverseToCreateAgentOutputSchema },
  prompt: (input) => {
    // Construct the prompt for the LLM, including history and current draft
    let fullPrompt = "Current Conversation History:\n";
    input.chatHistory.forEach(msg => {
      fullPrompt += `${msg.role === 'user' ? 'User' : 'AI Assistant'}: ${msg.content}\n`;
    });
    
    fullPrompt += "\n\nCurrent Agent Draft Status:\n";
    fullPrompt += `- Name: ${input.currentAgentDraft.name || "Not set"}\n`;
    fullPrompt += `- Persona: ${input.currentAgentDraft.persona || "Not set"}\n`;
    fullPrompt += `- Archetype: ${input.currentAgentDraft.archetype || "Not set"}\n`;
    fullPrompt += `- Psychological Profile: ${input.currentAgentDraft.psychologicalProfile || "Not set"}\n`;
    fullPrompt += `- Backstory: ${input.currentAgentDraft.backstory || "Not set"}\n`;
    fullPrompt += `- Language Style: ${input.currentAgentDraft.languageStyle || "Not set"}\n`;
    fullPrompt += `- Avatar URL: ${input.currentAgentDraft.avatarUrl || "Not set"}\n`;
    
    fullPrompt += `\nUser's latest message: "${input.userMessage}"\n`;
    fullPrompt += "\nBased on this, what is your AI response message, the updated agent draft, and is the draft finalized (isFinalized: true/false)?";
    return fullPrompt;
  }
});


export async function converseToCreateAgent(input: ConverseToCreateAgentInput): Promise<ConverseToCreateAgentOutput> {
  console.log('[converseToCreateAgentFlow] Input:', JSON.stringify(input, null, 2));
  
  // Ensure chatHistory is correctly passed to the prompt function if it expects it.
  // The prompt function defined above will construct the full text prompt.
  const { output } = await converseToCreateAgentPrompt(input);

  if (!output) {
    console.error('[converseToCreateAgentFlow] Error: LLM returned null output.');
    return {
      aiResponseMessage: "Sorry, I encountered an issue and couldn't process that. Could you try again?",
      updatedAgentDraft: input.currentAgentDraft, // Return original draft on error
      isFinalized: false,
    };
  }
  
  // Ensure all fields from the input draft are carried over if not updated by the LLM.
  const finalDraft: Partial<AgentFormData> = { ...input.currentAgentDraft, ...output.updatedAgentDraft };

  // Generate avatar if name is present and avatarUrl is not, or if avatarUrl is a placeholder needing update
  if (finalDraft.name && (!finalDraft.avatarUrl || finalDraft.avatarUrl.includes("?text=PN") || finalDraft.avatarUrl.includes("?text=XX"))) {
    const initials = finalDraft.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'PN';
    finalDraft.avatarUrl = `https://placehold.co/128x128/ABABAB/FFFFFF.png?text=${initials}`;
  }


  const validatedOutput: ConverseToCreateAgentOutput = {
    aiResponseMessage: output.aiResponseMessage,
    updatedAgentDraft: finalDraft,
    isFinalized: output.isFinalized || false, // Default to false if missing
  };
  
  console.log('[converseToCreateAgentFlow] Output:', JSON.stringify(validatedOutput, null, 2));
  return validatedOutput;
}

