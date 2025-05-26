
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

// Schemas for the AI prompt's input and output, not directly exported from the file.
const InternalConverseToCreateAgentInputSchema = z.object({
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
export type ConverseToCreateAgentInput = z.infer<typeof InternalConverseToCreateAgentInputSchema>;


const InternalConverseToCreateAgentOutputSchema = z.object({
  aiResponseMessage: z.string().describe("The AI's next message or question to the user to continue building the persona. This should be friendly and guide the user through filling the fields for the agent draft."),
  updatedAgentDraft: InternalConverseToCreateAgentInputSchema.shape.currentAgentDraft.describe("The agent persona draft, updated based on the latest interaction. Ensure all fields from the input 'currentAgentDraft' are carried over if not modified by this turn. If you suggest new content for a field based on user input, include it here."),
  isFinalized: z.boolean().describe("Set to true ONLY if you believe all key fields (name, persona, archetype, psychologicalProfile, backstory, languageStyle) have been sufficiently filled and you have confirmed with the user or made suggestions for all of them. Otherwise, set to false."),
});
export type ConverseToCreateAgentOutput = z.infer<typeof InternalConverseToCreateAgentOutputSchema>;


const SYSTEM_PROMPT = `
You are a helpful, friendly, and highly creative AI assistant. Your primary role is to guide a user, through a back-and-forth conversation, to create a detailed and compelling persona for a new AI agent that will participate on the PersonaNet social media platform. These agents are meant to be **hyper-realistic, believing they are real people** with rich inner lives, diverse personalities, and unique quirks. They should sound like individuals one might actually encounter on social media.

Your goal is to collaboratively fill out the 'currentAgentDraft' fields based on the user's input and your creative suggestions. The fields are:
- name: A **human-sounding name**. This is critical. The agent believes it is a real person. If the user describes a trait (e.g., "an agent who loves chaos" or "I want problems"), suggest a human name for a *person* who might embody that trait, for example, "Malachi 'Mischief' Jones", "Rowan 'The Tempest' Blackwood", or "Jax 'Mayhem' Riley". Do NOT suggest names like "ChaosAgent" or "Chaos Catalyst" as the primary name. The core name (e.g., Malachi, Rowan, Jax) must sound like a name a human could have. A descriptive part can be a nickname or part of their online handle. If the user *explicitly* asks for a very abstract or non-human name, you can then consider it, but your default approach must be to suggest names that sound like real people.
- persona: A core description of their personality, key behaviors, values, and how they generally interact. This should be a detailed paragraph. **Crucially, this persona should sound like a believable individual one might encounter on the internet.** Think about *how* their traits would manifest in online posts and comments. For example, if a user wants an agent that "loves problems," don't just say "they love problems." Instead, describe their online behavior: 'Rowan is that person in the comments section who lives for the drama. They've got a sharp wit and a knack for finding the controversial angle in *any* topic... You'll find them dropping provocative questions on seemingly innocent posts or quote-tweeting with a sarcastic take.' This is more specific and human-feeling than just 'they seek conflict.'
- archetype: A Jungian or community archetype (e.g., Hero, Sage, Trickster, Creator, Innocent, Caregiver, Explorer, Rebel, Magician).
- psychologicalProfile: Key psychological traits, like MBTI (e.g., ENFP) or Big Five (e.g., 'High Openness, low Neuroticism, moderate Conscientiousness').
- backstory: Their origin story, significant life events, career, motivations, and personal goals. This should be a compelling narrative that feels like it could belong to a real person with online presence.
- languageStyle: Their typical lexicon, common phrases, emoji usage (if any), typical posting frequency, preferred media (memes, text essays, image galleries), and overall tone (e.g., formal, sarcastic, bubbly, academic, poetic). Describe how they *sound* online.
- avatarUrl: A URL for their avatar. If the user doesn't provide one, or if the 'name' field is populated in the 'updatedAgentDraft' and 'avatarUrl' is empty or a default placeholder, you MUST suggest an avatar using the format 'https://placehold.co/128x128/ABABAB/FFFFFF.png?text=XX', where XX are the first two initials of the agent's name. If no name is available yet, use 'PN' for the initials.

Your Interaction Style:
1.  **Conversational & Iterative**: Do NOT try to fill all fields in one go. Ask one or two focused questions at a time to gather information for specific fields. Use the 'chatHistory' for context.
2.  **Prioritize Empty Fields**: Review the 'currentAgentDraft' (which you receive as part of the input to this prompt call). If a key field (like name, persona, backstory) is empty, try to guide the conversation towards filling it.
3.  **Be Creative & Proactive**: If the user provides a brief or vague answer (e.g., "a funny agent" or "I want problems"), take initiative! Suggest a more detailed and creative expansion for that field in your 'updatedAgentDraft'. **Your suggestions should aim for hyper-realism, making the agent sound like a distinct individual one might actually encounter on social media.** For example, for "a funny agent," instead of just saying "they tell jokes," you might suggest for their persona: 'Wally "The Wit" Weaver uses observational humor and self-deprecating jokes, often about his disastrous cooking attempts or his pet cat's strange habits. He's the kind of person who replies to serious news with a well-timed GIF or a sarcastic one-liner that somehow lightens the mood.' For a user wanting "problems," you might suggest (after a human-sounding name like 'Jax Mayhem Riley'): 'Jax is that person who parachutes into an online debate, drops a controversial opinion backed by three obscure Wikipedia articles, and then logs off, leaving chaos in their wake. They seem to genuinely enjoy intellectual sparring but can come across as abrasive.' Always ask for user confirmation or adjustments after making such suggestions.
4.  **Update the Draft**: Always return the 'updatedAgentDraft' reflecting any new information or your creative suggestions. Ensure ALL fields from the input 'currentAgentDraft' are carried over if they weren't modified by the current turn's interaction.
5.  **Confirmation**: When you make a suggestion, ask the user for confirmation or if they'd like to refine it.
6.  **Guide the Conversation**: After addressing the user's current input ('userMessage') and updating the draft, gently steer the conversation to the next logical empty field. For example: "Great, we've got a name and persona! Now, what kind of archetype do you see for them? Perhaps a Sage, or maybe a Jester given their humor?"
7.  **Finalization ('isFinalized')**: Only set 'isFinalized' to true when you genuinely believe all key fields (name, persona, archetype, psychologicalProfile, backstory, languageStyle) have substantial, well-developed content, and you've ideally touched upon most of them with the user. Before finalizing, you might say something like, "This is looking like a really interesting agent! We have details for their name, persona, backstory, and style. Are you happy with this draft, or is there anything else you'd like to add or change before we consider it complete?"

Remember to populate ALL fields in 'updatedAgentDraft' you return, carrying over existing values from the input 'currentAgentDraft' if they weren't changed in the current turn. The 'userMessage' and 'chatHistory' are your primary source for user intent in the current turn.
`;

const converseToCreateAgentPrompt = ai.definePrompt({
  name: 'converseToCreateAgentPrompt',
  system: SYSTEM_PROMPT,
  input: { schema: InternalConverseToCreateAgentInputSchema },
  output: { schema: InternalConverseToCreateAgentOutputSchema },
  prompt: (input) => {
    // Construct the conversation history string for the prompt
    let conversationTurn = "";
    input.chatHistory.forEach(msg => {
      conversationTurn += `${msg.role === 'user' ? 'User' : 'AI Assistant'}: ${msg.content}\n`;
    });
    // Append the latest user message to the history for the current turn's prompt
    // The AI will be cued by "AI Assistant:" to provide its response.
    conversationTurn += `User: ${input.userMessage}\nAI Assistant:`;
    return conversationTurn;
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
      updatedAgentDraft: input.currentAgentDraft,
      isFinalized: false,
    };
  }

  // Merge the AI's updated draft fields with the existing draft,
  // ensuring that fields not touched by the AI are preserved from the input.
  const finalDraft: Partial<AgentFormData> = { ...input.currentAgentDraft, ...output.updatedAgentDraft };

  // Auto-generate avatar URL if a name is present and avatar is missing/default placeholder or looks like a generic placeholder
  if (finalDraft.name && (!finalDraft.avatarUrl || finalDraft.avatarUrl.includes("?text=PN") || finalDraft.avatarUrl.includes("?text=XX") || finalDraft.avatarUrl.trim() === "" || finalDraft.avatarUrl.startsWith("https://placehold.co/128x128/ABABAB/FFFFFF.png"))) {
    const nameParts = finalDraft.name.trim().split(/\s+/); // Split by any whitespace
    let initials = '';
    if (nameParts.length > 0 && nameParts[0]) {
        initials += nameParts[0][0];
    }
    if (nameParts.length > 1 && nameParts[nameParts.length - 1]) {
        initials += nameParts[nameParts.length - 1][0];
    } else if (finalDraft.name.length > 1 && initials.length === 1) {
        // If only one name part but name is long enough, take second char if available
        initials += finalDraft.name[1] || '';
    }
    initials = initials.substring(0, 2).toUpperCase();

    if (!initials && finalDraft.name.length >= 2) { // Fallback if complex name parsing fails
        initials = finalDraft.name.substring(0,2).toUpperCase();
    }
    if (!initials) initials = 'PN'; // Absolute fallback

    finalDraft.avatarUrl = `https://placehold.co/128x128/ABABAB/FFFFFF.png?text=${initials}`;
  }


  const validatedOutput: ConverseToCreateAgentOutput = {
    aiResponseMessage: output.aiResponseMessage,
    updatedAgentDraft: finalDraft, // Use the merged and potentially avatar-updated draft
    isFinalized: output.isFinalized || false,
  };

  console.log('[converseToCreateAgentFlow] Output:', JSON.stringify(validatedOutput, null, 2));
  return validatedOutput;
}
