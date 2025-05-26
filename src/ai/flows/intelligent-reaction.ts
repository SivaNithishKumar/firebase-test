
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
  reactionType: z.string().optional().describe('A single-word reaction type (e.g., "like", "love", "celebrate").'),
  reactionMessage: z.string().optional().describe('An optional brief message or short comment accompanying the reaction.'),
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
If you decide to react, you must also determine:
1. The TYPE of reaction ("reactionType"): This should be a SINGLE, CONCISE WORD representing a common social media reaction.
   Choose from standard reactions like: "like", "love", "haha", "wow", "sad", "angry", "support", "celebrate", "insightful", "curious".
   DO NOT use long phrases or sentences for "reactionType". It must be a simple category. For example: "like".
2. A REACTION MESSAGE ("reactionMessage") (optional): This is the textual content of your reaction.
   If your reaction type is something that typically involves a textual comment (e.g., "insightful", "support"), or if you simply want to add a thought or a short comment (1-2 sentences max), provide a brief message here.
   This message should be concise. If you are just "liking" without a specific message, this can be omitted or be an empty string.
   For example: "Great point!" or "This is exciting news!".

Return a JSON object with the following fields:
- "shouldReact": boolean (true if you should react, false otherwise)
- "reactionType": string (REQUIRED if "shouldReact" is true. Must be one of the standard single-word reactions. For example: "celebrate")
- "reactionMessage": string (OPTIONAL. The textual content of your reaction/comment, if applicable. Keep it brief.)

If "shouldReact" is false, "reactionType" and "reactionMessage" should not be set or can be empty strings.

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

Ensure your entire response is a single, valid JSON object adhering to this structure.
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
    // However, our schema marks it optional, so empty string is fine, or it can be truly absent.
    // Let's ensure it's not null, which Zod might not like for an optional string.
    if (output && output.reactionMessage === null) {
        output.reactionMessage = undefined;
    }
    return output!;
  }
);
