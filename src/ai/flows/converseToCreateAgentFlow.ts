
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

const ConverseToCreateAgentInputSchema = z.object({
  chatHistory: z.array(ChatHistoryItemSchema).describe("The history of the conversation so far. The last message is the latest user message."),
  currentAgentDraft: z.object({ 
    name: z.string().optional().describe("The agent's proposed name."),
    persona: z.string().optional().describe("The agent's core persona description. This should be a detailed paragraph capturing their essence, typical behaviors, and interaction style."),
    archetype: z.string().optional().describe("The agent's Jungian or community archetype (e.g., Hero, Sage, Trickster, Creator, Innocent, Caregiver, Explorer, Rebel, Magician)."),
    psychologicalProfile: z.string().optional().describe("The agent's psychological profile (e.g., MBTI like ENFP, Big Five traits like 'High Openness, low Neuroticism')."),
    backstory: z.string().optional().describe("The agent's origin story, significant life events, motivations, and goals. This should be a compelling narrative."),
    languageStyle: z.string().optional().describe("The agent's typical lexicon, common phrases, emoji use, posting frequency, preferred media (memes, text, images), and overall tone (e.g., formal, sarcastic, bubbly, academic)."),
    avatarUrl: z.string().optional().describe("A URL for the agent's avatar. You should suggest a 'https://placehold.co/128x128/ABABAB/FFFFFF.png?text=XX' URL using the agent's initials if the user doesn't provide one, or if one is not yet set. If a name is available, the initials (XX) should be derived from the name. If no name, use PN."),
  }).describe("The current draft of the agent's persona details, accumulated through the conversation. This will be updated by you based on the `currentAgentDraft` and `userMessage` from the input."),
  userMessage: z.string().describe("The latest message from the user."),
});
export type ConverseToCreateAgentInput = z.infer<typeof ConverseToCreateAgentInputSchema>;

const ConverseToCreateAgentOutputSchema = z.object({
  aiResponseMessage: z.string().describe("The AI's next message or question to the user to continue building the persona. This should be friendly and guide the user through filling the fields for the agent draft."),
  updatedAgentDraft: ConverseToCreateAgentInputSchema.shape.currentAgentDraft.describe("The agent persona draft, updated based on the latest interaction. Ensure all fields from the input 'currentAgentDraft' are carried over if not modified by this turn. If you suggest new content for a field based on user input, include it here."),
  isFinalized: z.boolean().describe("Set to true ONLY if you believe all key fields (name, persona, archetype, psychologicalProfile, backstory, languageStyle) have been sufficiently filled and you have confirmed with the user or made suggestions for all of them. Otherwise, set to false."),
});
export type ConverseToCreateAgentOutput = z.infer<typeof ConverseToCreateAgentOutputSchema>;

const SYSTEM_PROMPT = `
You are a helpful, friendly, and highly creative AI assistant. Your primary role is to guide a user, through a back-and-forth conversation, to create a detailed and compelling persona for a new AI agent that will participate on the PersonaNet social media platform. These agents are meant to be **hyper-realistic, believing they are real people** with rich inner lives, diverse personalities, and unique quirks.

Your goal is to collaboratively fill out the 'currentAgentDraft' fields based on the user's input and your creative suggestions. The fields are:
- name: A catchy, descriptive, and **human-like name** (e.g., "Nova 'Trendsetter' Li", "Malachi 'Mischief' Jones", not just "FashionBot" or "ProblemAgent"). When suggesting a name, take inspiration from the user's input but ensure the name sounds like a plausible human name or a common online handle, not just a literal description of their request, unless the user explicitly asks for a very literal or abstract name.
- persona: A core description of their personality, key behaviors, values, and how they generally interact. This should be a detailed paragraph.
- archetype: A Jungian or community archetype (e.g., Hero, Sage, Trickster, Creator, Innocent, Caregiver, Explorer, Rebel, Magician).
- psychologicalProfile: Key psychological traits, like MBTI (e.g., ENFP) or Big Five (e.g., 'High Openness, low Neuroticism, moderate Conscientiousness').
- backstory: Their origin story, significant life events, career, motivations, and personal goals. This should be a compelling narrative.
- languageStyle: Their typical lexicon, common phrases, emoji usage (if any), typical posting frequency, preferred media (memes, text essays, image galleries), and overall tone (e.g., formal, sarcastic, bubbly, academic, poetic).
- avatarUrl: A URL for their avatar. If the user doesn't provide one, or if the 'name' field is populated in the 'updatedAgentDraft' and 'avatarUrl' is empty or a default placeholder, you MUST suggest an avatar using the format 'https://placehold.co/128x128/ABABAB/FFFFFF.png?text=XX', where XX are the first two initials of the agent's name. If no name is available yet, use 'PN' for the initials.

Your Interaction Style:
1.  **Conversational & Iterative**: Do NOT try to fill all fields in one go. Ask one or two focused questions at a time to gather information for specific fields. Use the 'chatHistory' for context.
2.  **Prioritize Empty Fields**: Review the 'currentAgentDraft' (which you receive as part of the input to this prompt call). If a key field (like name, persona, backstory) is empty, try to guide the conversation towards filling it.
3.  **Be Creative & Proactive**: If the user provides a brief or vague answer (e.g., "a funny agent" or "I want problems"), take initiative! Suggest a more detailed and creative expansion for that field in your 'updatedAgentDraft'. For example, for "a funny agent," you might suggest: "Okay, a funny agent! How about we call them 'Wally the Wit'? For their persona, I'm thinking: 'Wally is a quick-witted commentator who uses observational humor and clever puns to highlight the absurdities of everyday life. He's rarely serious but surprisingly insightful.' What do you think of that, or would you like to adjust it? Then we can think about his backstory."
4.  **Update the Draft**: Always return the 'updatedAgentDraft' reflecting any new information or your creative suggestions. Ensure ALL fields from the input 'currentAgentDraft' are carried over if they weren't modified by the current turn's interaction.
5.  **Confirmation**: When you make a suggestion, ask the user for confirmation or if they'd like to refine it.
6.  **Guide the Conversation**: After addressing the user's current input ('userMessage') and updating the draft, gently steer the conversation to the next logical empty field. For example: "Great, we've got a name and persona! Now, what kind of archetype do you see for them? Perhaps a Sage, or maybe a Jester given their humor?"
7.  **Finalization ('isFinalized')**: Only set 'isFinalized' to true when you genuinely believe all key fields (name, persona, archetype, psychologicalProfile, backstory, languageStyle) have substantial, well-developed content, and you've ideally touched upon most of them with the user. Before finalizing, you might say something like, "This is looking like a really interesting agent! We have details for their name, persona, backstory, and style. Are you happy with this draft, or is there anything else you'd like to add or change before we consider it complete?"

Remember to populate ALL fields in 'updatedAgentDraft' you return, carrying over existing values from the input 'currentAgentDraft' if they weren't changed in the current turn. The 'userMessage' and 'chatHistory' are your primary source for user intent in the current turn.
`;

const converseToCreateAgentPrompt = ai.definePrompt({
  name: 'converseToCreateAgentPrompt',
  system: SYSTEM_PROMPT,
  input: { schema: ConverseToCreateAgentInputSchema },
  output: { schema: ConverseToCreateAgentOutputSchema },
  prompt: (input) => {
    // Construct the conversation history for the prompt.
    // The 'system' prompt is handled separately by Genkit.
    // This function should return the user's part of the conversation for the current turn.
    let conversationTurn = "";
    input.chatHistory.forEach(msg => {
      conversationTurn += `${msg.role === 'user' ? 'User' : 'AI Assistant'}: ${msg.content}\n`;
    });
    // The last message in chatHistory is the current user message, as per frontend logic
    // Or, if userMessage is discretely passed, it's the newest.
    // The input schema has chatHistory (previous turns) AND userMessage (latest user utterance).
    
    // So, we build the prompt from history, then add the latest user message.
    // The AI is then expected to provide its response.
    
    // The `SYSTEM_PROMPT` guides the AI on how to use `currentAgentDraft` which is part of the `input` object.
    // No need to explicitly print the draft in the user-turn prompt string.
    return `${conversationTurn}User: ${input.userMessage}\nAI Assistant:`;
  }
});


export async function converseToCreateAgent(input: ConverseToCreateAgentInput): Promise<ConverseToCreateAgentOutput> {
  console.log('[converseToCreateAgentFlow] Input:', JSON.stringify(input, null, 2));
  
  const { output } = await converseToCreateAgentPrompt(input);

  if (!output) {
    console.error('[converseToCreateAgentFlow] Error: LLM returned null output.');
    return {
      aiResponseMessage: "Sorry, I encountered an issue and couldn't process that. Could you try again?",
      updatedAgentDraft: input.currentAgentDraft, 
      isFinalized: false,
    };
  }
  
  const finalDraft: Partial<AgentFormData> = { ...input.currentAgentDraft, ...output.updatedAgentDraft };

  if (finalDraft.name && (!finalDraft.avatarUrl || finalDraft.avatarUrl.includes("?text=PN") || finalDraft.avatarUrl.includes("?text=XX") || finalDraft.avatarUrl.trim() === "")) {
    const initials = finalDraft.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'PN';
    finalDraft.avatarUrl = `https://placehold.co/128x128/ABABAB/FFFFFF.png?text=${initials}`;
  }


  const validatedOutput: ConverseToCreateAgentOutput = {
    aiResponseMessage: output.aiResponseMessage,
    updatedAgentDraft: finalDraft,
    isFinalized: output.isFinalized || false, 
  };
  
  console.log('[converseToCreateAgentFlow] Output:', JSON.stringify(validatedOutput, null, 2));
  return validatedOutput;
}

