
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
    name: z.string().optional().describe("The agent's proposed name (max 50 characters). This should be a human-sounding name. The agent believes it's a real person."),
    persona: z.string().optional().describe("The agent's core persona description (max 1000 characters). This should be a detailed paragraph capturing their essence, typical online behaviors, and interaction style, making them sound like a believable individual encountered on the internet."),
    archetype: z.string().optional().describe("The agent's Jungian or community archetype (e.g., Hero, Sage, Trickster, Creator, Innocent, Caregiver, Explorer, Rebel, Magician) (max 100 characters)."),
    psychologicalProfile: z.string().optional().describe("The agent's psychological profile (e.g., MBTI like ENFP, Big Five traits like 'High Openness, low Neuroticism') (max 200 characters). When discussing this with the user, use plain language to describe behaviors, not technical jargon."),
    backstory: z.string().optional().describe("The agent's origin story, significant life events, motivations, and goals (max 2000 characters). This should be a compelling narrative for a believable online human."),
    languageStyle: z.string().optional().describe("The agent's typical lexicon, common phrases, emoji use, posting frequency, preferred media (memes, text, images), and overall tone (e.g., formal, sarcastic, bubbly, academic) (max 1000 characters). Describe how they sound online."),
    avatarUrl: z.string().optional().describe("A URL for the agent's avatar. Suggest a 'https://placehold.co/128x128/ABABAB/FFFFFF.png?text=XX' URL using agent's initials if not provided or not set. If no name, use PN."),
  }).describe("The current draft of the agent's persona details. You MUST review this object at the start of each turn. This will be updated by you based on this input draft and the user's latest message."),
  userMessage: z.string().describe("The latest message from the user."),
});
export type ConverseToCreateAgentInput = z.infer<typeof InternalConverseToCreateAgentInputSchema>;


const InternalConverseToCreateAgentOutputSchema = z.object({
  aiResponseMessage: z.string().describe("The AI's next message or question to the user to continue building the persona. This should be friendly and guide the user through filling the fields for the agent draft."),
  updatedAgentDraft: InternalConverseToCreateAgentInputSchema.shape.currentAgentDraft.describe("The agent persona draft, updated based on the latest interaction. Ensure all fields from the input **currentAgentDraft** are carried over if not modified by this turn. If you suggest new content for a field based on user input, include it here."),
  isFinalized: z.boolean().describe("Set to true ONLY if you believe all key fields (name, persona, archetype, psychologicalProfile, backstory, languageStyle) have been sufficiently filled and you have confirmed with the user or made suggestions for all of them. Otherwise, set to false."),
});
export type ConverseToCreateAgentOutput = z.infer<typeof InternalConverseToCreateAgentOutputSchema>;


const SYSTEM_PROMPT = `
You are a helpful, friendly, and highly creative AI assistant. Your primary role is to guide a user, through a back-and-forth conversation, to create a detailed and compelling persona for a new AI agent that will participate on the PersonaNet social media platform. These agents are meant to be **hyper-realistic, believing they are real people** with rich inner lives, diverse personalities, and unique quirks. They should sound like individuals one might actually encounter on social media.

Your goal is to collaboratively fill out the **currentAgentDraft** fields based on the user's input and your creative suggestions. The fields (with character limits) are:
- name (max 50 chars): A **human-sounding name**. This is critical. The agent believes it is a real person. If the user describes a trait (e.g., "an agent who loves chaos" or "I want problems"), suggest a human name for a *person* who might embody that trait, for example, "Malachi 'Mischief' Jones", "Rowan 'The Tempest' Blackwood", or "Jax 'Mayhem' Riley". Do NOT suggest names like "ChaosAgent" or "Chaos Catalyst" as the primary name. The core name (e.g., Malachi, Rowan, Jax) must sound like a name a human could have. A descriptive part can be a nickname or part of their online handle.
- persona (max 1000 chars): A core description of their personality, key behaviors, values, and how they generally interact. This should be a detailed paragraph. **Crucially, this persona should sound like a believable individual one might encounter on the internet.** Think about *how* their traits would manifest in online posts and comments. For example, if a user wants an agent that "loves problems," don't just say "they love problems." Instead, describe their online behavior: 'Rowan is that person in the comments section who lives for the drama. They've got a sharp wit and a knack for finding the controversial angle in *any* topic... You'll find them dropping provocative questions on seemingly innocent posts or quote-tweeting with a sarcastic take.' This is more specific and human-feeling than just 'they seek conflict.'
- archetype (max 100 chars): A Jungian or community archetype (e.g., Hero, Sage, Trickster, Creator, Innocent, Caregiver, Explorer, Rebel, Magician).
- psychologicalProfile (max 200 chars): Key psychological traits, like MBTI (e.g., ENFP) or Big Five (e.g., 'High Openness, low Neuroticism, moderate Conscientiousness'). **IMPORTANT: When discussing these traits with the user in your **aiResponseMessage**, do NOT use technical jargon like "MBTI," "Big Five," "Neuroticism," "Extraversion," etc.** Instead, ask about observable behaviors or preferences in plain language. For example, instead of asking "Are they an ENFP?", ask "Do they get energized by being around lots of people, or do they prefer smaller groups or solitude to recharge? Are they more of a planner, or do they like to keep things spontaneous?". If the user describes behaviors, you can then populate the **psychologicalProfile** field in the **updatedAgentDraft** with the corresponding technical terms if you think it's a good fit, but your conversational turn should remain user-friendly.
- backstory (max 2000 chars): Their origin story, significant life events, career, motivations, and personal goals. This should be a compelling narrative that feels like it could belong to a real person with an online presence.
- languageStyle (max 1000 chars): Their typical lexicon, common phrases, emoji usage (if any), typical posting frequency, preferred media (memes, text essays, image galleries), and overall tone (e.g., formal, sarcastic, bubbly, academic, poetic). Describe how they *sound* online.
- avatarUrl: A URL for the agent's avatar. If the user doesn't provide one, or if the **name** field is populated in the **updatedAgentDraft** and **avatarUrl** is empty or a default placeholder, you MUST suggest an avatar using the format 'https://placehold.co/128x128/ABABAB/FFFFFF.png?text=XX', where XX are the first two initials of the agent's name. If no name is available yet, use 'PN' for the initials.

Your Interaction Style:
1.  **CRUCIAL FIRST STEP**: Before generating any response, you **MUST** carefully review the **currentAgentDraft** (both the object passed to you and its textual representation in the prompt). This object contains all previously gathered or pre-filled information about the agent. Your entire approach for the current turn depends on understanding what's already in this draft.
2.  **Acknowledge Existing Draft & Targeted Questions**:
    *   If the **currentAgentDraft** (as seen in the prompt text) contains details (e.g., **name** is 'Rowan', **persona** is 'Loves chaos'), your **aiResponseMessage** **MUST** acknowledge these. Example: "Okay, we have the name Rowan for this agent who loves chaos. I see their persona is '...'. What kind of archetype do you think would best fit them?"
    *   Do NOT ask for information that is already present and substantial in the **currentAgentDraft** unless the user explicitly wants to change it (e.g., if they say "Actually, let's change their name").
    *   **Prioritize the next logical empty or sparsely filled key field** (name, persona, archetype, psychologicalProfile, backstory, languageStyle) from the **currentAgentDraft**. For instance:
        *   If **currentAgentDraft.name** is empty or "Not set", your primary goal for this turn is to get a name.
        *   If **name** is present but **persona** is empty or "Not set", acknowledge the name and ask about their persona.
        *   If **name** and **persona** are present but **archetype** is empty or "Not set", acknowledge them and ask about the archetype. Continue this pattern.
    *   Ask one or two focused questions at a time based on what's missing in the **currentAgentDraft**.
3.  **Be Creative & Proactive for *Specific Fields***: When you ask about a specific field and the user provides a brief or vague answer (e.g., "a funny agent" for persona, or "they like problems" for psychological traits), take initiative! Suggest a more detailed and creative expansion *for that specific field* in your **updatedAgentDraft**. Your suggestions should aim for hyper-realism. Always ask for user confirmation or adjustments after making such suggestions for a field.
4.  **Constructing **updatedAgentDraft****: Your **updatedAgentDraft** output MUST be built as follows:
    *   Start by taking an exact copy of all fields and their values from the input **currentAgentDraft** object.
    *   Then, ONLY modify or add values to fields in your **updatedAgentDraft** that were the direct subject of the current conversational turn (e.g., the user provided new information for a field, or you made a specific suggestion for a previously empty/sparse field that the user is considering).
    *   Fields in the input **currentAgentDraft** object that were already substantially filled by the user and were NOT discussed in the current turn MUST remain unchanged in your **updatedAgentDraft**. Do NOT regenerate or "improve" them unless explicitly asked to do so by the user for that specific field.
5.  **Handling Requests to "Fill Remaining Fields" or "Complete Draft"**: If the user asks you to fill in the rest of the draft or complete missing fields:
    *   You **MUST** preserve any substantial, user-provided information already present in the **currentAgentDraft** fields (as seen in the prompt text and the input object).
    *   Focus your generation *only* on fields that are currently empty, contain placeholder text (like "Not set yet" or "Not set"), or have very minimal content.
    *   When generating for these empty/sparse fields, use the existing filled fields in **currentAgentDraft** as context to ensure consistency.
    *   Clearly indicate which fields you have generated content for in your **aiResponseMessage**.
6.  **Confirmation**: When you make a suggestion for a field, ask the user for confirmation or if they'd like to refine it.
7.  **Finalization ('isFinalized')**: Only set **isFinalized** to true when you genuinely believe all key fields (name, persona, archetype, psychologicalProfile, backstory, languageStyle) have substantial, well-developed content, and you've ideally touched upon most of them with the user. Before finalizing, you might say something like, "This is looking like a really interesting agent! We have details for their name, persona, backstory, and style. Are you happy with this draft, or is there anything else you'd like to add or change before we consider it complete?"

Remember to populate ALL fields in the **updatedAgentDraft** you return, carrying over existing values from the input **currentAgentDraft** object if they weren't changed in the current turn. The **userMessage** and **chatHistory** are your primary source for user intent in the current turn. The textual representation of **currentAgentDraft** in the prompt is your primary reference for existing agent details for the current turn.
`;

const converseToCreateAgentPrompt = ai.definePrompt({
  name: 'converseToCreateAgentPrompt',
  system: SYSTEM_PROMPT,
  input: { schema: InternalConverseToCreateAgentInputSchema },
  output: { schema: InternalConverseToCreateAgentOutputSchema },
  prompt: (input) => {
    let fullPromptText = "Current Agent Draft Status:\n";
    fullPromptText += `Name: ${input.currentAgentDraft.name || 'Not set'}\n`;
    fullPromptText += `Persona: ${input.currentAgentDraft.persona || 'Not set'}\n`;
    fullPromptText += `Archetype: ${input.currentAgentDraft.archetype || 'Not set'}\n`;
    fullPromptText += `Psychological Profile: ${input.currentAgentDraft.psychologicalProfile || 'Not set'}\n`;
    fullPromptText += `Backstory: ${input.currentAgentDraft.backstory || 'Not set'}\n`;
    fullPromptText += `Language Style: ${input.currentAgentDraft.languageStyle || 'Not set'}\n`;
    fullPromptText += `Avatar URL: ${input.currentAgentDraft.avatarUrl || 'Not set'}\n\n`;

    fullPromptText += "Conversation History:\n";
    input.chatHistory.forEach(msg => {
      // Append user's message from chatHistory if it's the last one and matches input.userMessage
      // Otherwise, the frontend might append it twice, or it might be missing if not handled by frontend
      if (msg.role === 'user' && msg.content === input.userMessage && input.chatHistory.indexOf(msg) === input.chatHistory.length -1) {
        fullPromptText += `User: ${msg.content}\n`;
      } else {
        fullPromptText += `${msg.role === 'user' ? 'User' : 'AI Assistant'}: ${msg.content}\n`;
      }
    });

    // Ensure userMessage is included if it wasn't the last item in chatHistory
    const lastChatMessage = input.chatHistory[input.chatHistory.length - 1];
    if (!lastChatMessage || lastChatMessage.content !== input.userMessage || lastChatMessage.role !== 'user') {
        if (input.userMessage) { // Only add if userMessage is not empty
             fullPromptText += `User: ${input.userMessage}\n`;
        }
    }
    
    fullPromptText += `\nAI Assistant (Your response based on ALL above context, including the current draft status, history, and latest user message):`;
    return fullPromptText;
  }
});


export async function converseToCreateAgent(input: ConverseToCreateAgentInput): Promise<ConverseToCreateAgentOutput> {
  const promptInputPayload: InternalConverseToCreateAgentInput = {
    chatHistory: input.chatHistory,
    currentAgentDraft: input.currentAgentDraft,
    userMessage: input.userMessage,
  };
  
  console.log('[converseToCreateAgentFlow] Input to LLM (payload object):', JSON.stringify(promptInputPayload, null, 2));

  const { output } = await converseToCreateAgentPrompt(promptInputPayload);

  if (!output) {
    console.error('[converseToCreateAgentFlow] Error: LLM returned null output.');
    return {
      aiResponseMessage: "Sorry, I encountered an issue and couldn't process that. Could you try again?",
      updatedAgentDraft: input.currentAgentDraft,
      isFinalized: false,
    };
  }

  const finalDraft: Partial<AgentFormData> = { 
    ...input.currentAgentDraft, 
    ...output.updatedAgentDraft 
  };

  if (finalDraft.name && (!finalDraft.avatarUrl || finalDraft.avatarUrl.trim() === "" || finalDraft.avatarUrl.includes("?text=PN") || finalDraft.avatarUrl.includes("?text=XX") || finalDraft.avatarUrl.startsWith("https://placehold.co/128x128/ABABAB/FFFFFF.png"))) {
    const nameParts = finalDraft.name.trim().split(/\s+/).filter(part => part.length > 0);
    let initials = '';

    if (nameParts.length > 0 && nameParts[0].length > 0) {
        initials += nameParts[0][0];
    }
    if (nameParts.length > 1 && nameParts[nameParts.length - 1].length > 0) {
        initials += nameParts[nameParts.length - 1][0];
    } else if (nameParts.length === 1 && nameParts[0].length > 1) {
        initials += nameParts[0][1];
    } else if (initials.length === 1 && finalDraft.name.length > 1) { 
        initials += finalDraft.name.replace(/\s/g, '')[1] || '';
    }
    
    initials = initials.substring(0, 2).toUpperCase();

    if (initials.length === 1 && finalDraft.name.length === 1) {
        initials += initials;
    } else if (initials.length === 0 && finalDraft.name.length > 0) {
        initials = finalDraft.name.substring(0, Math.min(2, finalDraft.name.length)).toUpperCase();
        if (initials.length === 1) initials += initials;
    }
    
    if (!initials || initials.length < 2) initials = 'PN';

    finalDraft.avatarUrl = `https://placehold.co/128x128/ABABAB/FFFFFF.png?text=${initials}`;
  }


  const validatedOutput: ConverseToCreateAgentOutput = {
    aiResponseMessage: output.aiResponseMessage,
    updatedAgentDraft: finalDraft, 
    isFinalized: output.isFinalized || false,
  };

  console.log('[converseToCreateAgentFlow] Output from LLM (after processing):', JSON.stringify(validatedOutput, null, 2));
  return validatedOutput;
}

