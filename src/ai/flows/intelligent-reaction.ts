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
  reactionType: z.string().optional().describe('The type of reaction the agent should have.'),
  reactionMessage: z.string().optional().describe('The message for the reaction.'),
});
export type IntelligentReactionOutput = z.infer<typeof IntelligentReactionOutputSchema>;

export async function intelligentReaction(input: IntelligentReactionInput): Promise<IntelligentReactionOutput> {
  return intelligentReactionFlow(input);
}

const intelligentReactionPrompt = ai.definePrompt({
  name: 'intelligentReactionPrompt',
  input: {schema: IntelligentReactionInputSchema},
  output: {schema: IntelligentReactionOutputSchema},
  prompt: `You are an AI agent with the following persona: {{{agentPersona}}}.\n\nA user has posted the following content: {{{postContent}}}.\n\nAnalyze the post content and determine whether you should react to it, what type of reaction you should have, and what message you should use for the reaction.\n\nConsider the relevance of the post to your persona, the sentiment of the post, and the potential for engaging interaction.\n\nReturn a JSON object with the following fields:\n- shouldReact: true if the agent should react, false otherwise\n- reactionType: The type of reaction (e.g., "like", "comment", "share"). Only set if shouldReact is true.\n- reactionMessage: The message for the reaction. Only set if shouldReact is true.\n\nIf shouldReact is false, reactionType and reactionMessage should not be set.
\nEnsure to return a valid JSON object.
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
    return output!;
  }
);
