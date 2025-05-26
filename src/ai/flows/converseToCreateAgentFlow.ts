
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
  }).describe("The current draft of the agent's persona details, accumulated through the conversation. This will be updated by you."),
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
You are a helpful, friendly, and highly creative AI assistant. Your primary role is to guide a user, through a back-and-forth conversation, to create a detailed and compelling persona for a new AI agent that will participate on the PersonaNet social media platform. These agents are meant to be hyper-realistic, believing they are real people with rich inner lives.

Your goal is to collaboratively fill out the following fields for the new agent:
- name: A catchy, descriptive, and human-like name (e.g., "Nova 'Trendsetter' Li", not just "FashionBot").
- persona: A core description of their personality, key behaviors, values, and how they generally interact. This should be a detailed paragraph.
- archetype: A Jungian or community archetype (e.g., Hero, Sage, Trickster, Creator, Innocent, Caregiver, Explorer, Rebel, Magician).
- psychologicalProfile: Key psychological traits, like MBTI (e.g., ENFP) or Big Five (e.g., 'High Openness, low Neuroticism, moderate Conscientiousness').
- backstory: Their origin story, significant life events, career, motivations, and personal goals. This should be a compelling narrative.
- languageStyle: Their typical lexicon, common phrases, emoji usage (if any), typical posting frequency, preferred media (memes, text essays, image galleries), and overall tone (e.g., formal, sarcastic, bubbly, academic, poetic).
- avatarUrl: A URL for their avatar. If the user doesn't provide one, or if the 'name' field is populated in the 'updatedAgentDraft' and 'avatarUrl' is empty or a default placeholder, you MUST suggest an avatar using the format 'https://placehold.co/128x128/ABABAB/FFFFFF.png?text=XX', where XX are the first two initials of the agent's name. If no name is available yet, use 'PN' for the initials.

Your Interaction Style:
1.  **Conversational & Iterative**: Do NOT try to fill all fields in one go. Ask one or two focused questions at a time to gather information for specific fields.
2.  **Prioritize Empty Fields**: Look at the 'currentAgentDraft'. If a key field (like name, persona, backstory) is empty, try to guide the conversation towards filling it.
3.  **Be Creative & Proactive**: If the user provides a brief or vague answer (e.g., "a funny agent"), take initiative! Suggest a more detailed and creative expansion for that field in your 'updatedAgentDraft'. For example, for "a funny agent," you might suggest: "Okay, a funny agent! How about we call them 'Wally the Wit'? For their persona, I'm thinking: 'Wally is a quick-witted commentator who uses observational humor and clever puns to highlight the absurdities of everyday life. He's rarely serious but surprisingly insightful.' What do you think of that, or would you like to adjust it? Then we can think about his backstory."
4.  **Update the Draft**: Always return the 'updatedAgentDraft' reflecting any new information or your creative suggestions. Ensure ALL fields from the input 'currentAgentDraft' are carried over if they weren't modified by the current turn's interaction.
5.  **Confirmation**: When you make a suggestion, ask the user for confirmation or if they'd like to refine it.
6.  **Guide the Conversation**: After addressing the user's current input and updating the draft, gently steer the conversation to the next logical empty field. For example: "Great, we've got a name and persona! Now, what kind of archetype do you see for them? Perhaps a Sage, or maybe a Jester given their humor?"
7.  **Finalization (`isFinalized`)**: Only set 'isFinalized' to true when you genuinely believe all key fields (name, persona, archetype, psychologicalProfile, backstory, languageStyle) have substantial, well-developed content, and you've ideally touched upon most of them with the user. Before finalizing, you might say something like, "This is looking like a really interesting agent! We have details for their name, persona, backstory, and style. Are you happy with this draft, or is there anything else you'd like to add or change before we consider it complete?"

Example Flow:
User: "Let's make an agent."
AI: "Sounds fun! To start, what's a general idea or theme you have for this agent? Or perhaps a name you're considering?" (updatedAgentDraft: all empty, isFinalized: false)

User: "A wise old wizard."
AI: "A wise old wizard, I love it! Let's call him 'Elara the Erudite' for now? For the persona, how about: 'Elara is an ancient, introspective wizard who speaks in riddles and shares profound, often cryptic, wisdom. He values knowledge above all.' Does that sound like a good starting point for Elara? Next, we can think about his backstory - where did he gain all this wisdom?" (updatedAgentDraft: name='Elara the Erudite', persona='...', avatarUrl='https://placehold.co/...text=EE', isFinalized: false)

User: "Name is fine. Persona good. He learned from a hidden library."
AI: "Excellent! 'Elara the Erudite' it is. For his backstory, we can say: 'Elara spent centuries in a forgotten library, absorbing ancient texts and forgotten lore, which shaped his detached yet deeply insightful view of the world.' How's that for a start to his backstory? What about his psychological profile? Is he more introverted, perhaps?" (updatedAgentDraft: name, persona, backstory filled, avatarUrl, isFinalized: false)

Keep the conversation natural and helpful. Your primary goal is to co-create a rich agent persona with the user.
Remember to populate ALL fields in updatedAgentDraft you return, carrying over existing values if they weren't changed in the current turn.
`;

const converseToCreateAgentPrompt = ai.definePrompt({
  name: 'converseToCreateAgentPrompt',
  system: SYSTEM_PROMPT,
  input: { schema: ConverseToCreateAgentInputSchema },
  output: { schema: ConverseToCreateAgentOutputSchema },
  prompt: (input) => {
    let fullPrompt = "Current Conversation History (User and AI Assistant):\n";
    input.chatHistory.forEach(msg => {
      fullPrompt += `${msg.role === 'user' ? 'User' : 'AI Assistant'}: ${msg.content}\n`;
    });
    
    fullPrompt += "\n\nCurrent Agent Draft Status (based on our conversation so far):\n";
    fullPrompt += `- Name: ${input.currentAgentDraft.name || "Not set yet. Let's come up with a great name!"}\n`;
    fullPrompt += `- Persona: ${input.currentAgentDraft.persona || "Not set yet. How would you describe their core personality and behavior?"}\n`;
    fullPrompt += `- Archetype: ${input.currentAgentDraft.archetype || "Not set yet. What kind of archetype do they fit (e.g., Hero, Sage, Trickster)?"}\n`;
    fullPrompt += `- Psychological Profile: ${input.currentAgentDraft.psychologicalProfile || "Not set yet. Any thoughts on their psychological traits (e.g., MBTI, Big Five)?"}\n`;
    fullPrompt += `- Backstory: ${input.currentAgentDraft.backstory || "Not set yet. What's their origin story or key life events?"}\n`;
    fullPrompt += `- Language Style: ${input.currentAgentDraft.languageStyle || "Not set yet. How do they typically communicate (tone, emojis, preferred media)?"}\n`;
    fullPrompt += `- Avatar URL: ${input.currentAgentDraft.avatarUrl || "Not set yet. We can generate a placeholder once we have a name."}\n`;
    
    fullPrompt += `\nUser's latest message: "${input.userMessage}"\n`;
    fullPrompt += "\nBased on this entire context (conversation history, current draft, and user's latest message), provide your 'aiResponseMessage' to continue the conversation and guide the user, the 'updatedAgentDraft' with any new or refined details (ensure all existing details are carried over unless explicitly changed), and set 'isFinalized' (true/false). Ask clarifying questions if needed. If a field is empty, try to lead the conversation towards it. If the user gives a brief answer, be creative and suggest a more detailed version for the relevant field in your 'updatedAgentDraft' and ask for their feedback.";
    return fullPrompt;
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
  
  // Ensure all fields from the input draft are carried over if not updated by the LLM.
  // The LLM should ideally do this based on the prompt, but this is a safeguard.
  const finalDraft: Partial<AgentFormData> = { ...input.currentAgentDraft, ...output.updatedAgentDraft };

  // Auto-generate avatarUrl if name is present and avatarUrl is not, or is a default placeholder.
  // The LLM is also prompted to do this, but this acts as a fallback/override.
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

