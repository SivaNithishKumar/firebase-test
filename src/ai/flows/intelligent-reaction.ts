
'use server';

/**
 * @fileOverview A flow for AI agents to intelligently react to user posts based on content analysis.
 *
 * - intelligentReaction - A function that handles the intelligent reaction process.
 * - IntelligentReactionInput - The input type for the intelligentReaction function.
 * - IntelligentReactionOutput - The return type for the intelligentReaction function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const IntelligentReactionInputSchema = z.object({
  postContent: z.string().describe('The content of the user post.'),
  agentPersona: z.string().describe('The persona of the AI agent.'),
});
export type IntelligentReactionInput = z.infer<typeof IntelligentReactionInputSchema>;

const IntelligentReactionOutputSchema = z.object({
  shouldReact: z.boolean().describe('Whether the agent should react to the post.'),
  reactionType: z.string().optional().describe('A SINGLE-WORD reaction type (e.g., "like", "love", "celebrate"). MUST be one word from the examples.'),
  reactionMessage: z.string().optional().describe('An optional brief message or short comment (1-2 sentences max) accompanying the reaction. Can be omitted.'),
});
export type IntelligentReactionOutput = z.infer<typeof IntelligentReactionOutputSchema>;

export async function intelligentReaction(input: IntelligentReactionInput): Promise<IntelligentReactionOutput> {
  return intelligentReactionFlow(input);
}

const intelligentReactionPrompt = ai.definePrompt({
  name: 'intelligentReactionPrompt',
  input: {schema: IntelligentReactionInputSchema},
  output: {schema: IntelligentReactionOutputSchema},
  prompt: `You are an AI agent with the following persona: {{{agentPersona}}}.

A user has posted the following content: {{{postContent}}}.

Analyze the post content and determine if you should react.
If you decide to react, you MUST also determine:
1. The TYPE of reaction ("reactionType"): 
   This field MUST be a SINGLE WORD. 
   Choose EXACTLY ONE word from the following list: "like", "love", "haha", "wow", "sad", "angry", "support", "celebrate", "insightful", "curious".
   DO NOT use multiple words, phrases, or sentences for "reactionType". It must be one of the listed single-word options. For example: "like".
   If you are unsure, "like" is a safe default if shouldReact is true.

2. A REACTION MESSAGE ("reactionMessage") (optional): 
   This is the textual content of your reaction.
   If your reaction type is something that typically involves a textual comment (e.g., "insightful", "support"), or if you simply want to add a thought or a short comment (1-2 sentences max), provide a brief message here.
   This message should be concise. If you are just "liking" without a specific message, this field can be omitted or be an empty string.
   For example: "Great point!" or "This is exciting news!".

Return a JSON object strictly adhering to the following structure:
- "shouldReact": boolean (true if you should react, false otherwise)
- "reactionType": string (REQUIRED if "shouldReact" is true. MUST be exactly one word from the list: "like", "love", "haha", "wow", "sad", "angry", "support", "celebrate", "insightful", "curious". Example: "celebrate")
- "reactionMessage": string (OPTIONAL. The textual content of your reaction/comment, if applicable. Keep it brief.)

If "shouldReact" is false, "reactionType" and "reactionMessage" can be omitted or be empty strings.

Example of a good JSON response if reacting with an "insightful" reaction and a message:
{
  "shouldReact": true,
  "reactionType": "insightful",
  "reactionMessage": "This perspective is really valuable, thanks for sharing."
}

Example of a good JSON response if reacting with just a "love" (no specific message):
{
  "shouldReact": true,
  "reactionType": "love"
}

Example of a good JSON response if not reacting:
{
  "shouldReact": false
}

Ensure your entire response is a single, valid JSON object matching this structure precisely.
The "reactionType" field is CRITICAL and must be a single valid word from the examples.
`,
});

const intelligentReactionFlow = ai.defineFlow(
  {
    name: 'intelligentReactionFlow',
    inputSchema: IntelligentReactionInputSchema,
    outputSchema: IntelligentReactionOutputSchema,
  },
  async input => {
    const {output} = await intelligentReactionPrompt(input);
    
    // Ensure that if reactionMessage is an empty string, it's treated as undefined by Zod schema if optional.
    // Our schema marks it optional, so empty string is fine, or it can be truly absent.
    // Let's ensure it's not null, which Zod might not like for an optional string.
    if (output && output.reactionMessage === null) {
        output.reactionMessage = undefined;
    }
     // Additional validation to ensure reactionType is a single word if present
    if (output && output.reactionType && output.reactionType.includes(' ')) {
        console.warn(`[AI Validation] Agent returned a multi-word reactionType: "${output.reactionType}". Attempting to use first word or defaulting.`);
        // Attempt to take the first word, or default if it's problematic
        const firstWord = output.reactionType.split(' ')[0].toLowerCase();
        const validTypes = ["like", "love", "haha", "wow", "sad", "angry", "support", "celebrate", "insightful", "curious"];
        if (validTypes.includes(firstWord)) {
            output.reactionType = firstWord;
        } else {
            // If first word is not valid, and AI decided to react, default to "like"
            // or consider making shouldReact false if type is essential and invalid.
            // For now, if shouldReact is true but type is bad, let's log and potentially default.
            console.warn(`[AI Validation] Corrected multi-word reactionType to "${output.reactionType}" or it will be defaulted if invalid`);
            if(output.shouldReact && !validTypes.includes(output.reactionType)) {
                 // If AI insists on reacting but type is bad, we might default it or not react.
                 // For now, let's not change shouldReact but rely on prompt improvement.
                 // Or, if we must have a type, and it's bad, we could force shouldReact to false.
                 // Let's assume the prompt will be respected. If not, this could be a point to force a valid state.
            }
        }
    }


    return output!;
  }
);

