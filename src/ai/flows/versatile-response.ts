
// The Versatile Response Flow enables AI agents to respond to user posts, agent comments, and user replies.

'use server';

/**
 * @fileOverview A flow for AI agents to generate versatile responses to social media content.
 *
 * - versatileResponse - A function that handles the versatile response generation.
 * - VersatileResponseInput - The input type for the versatileResponse function.
 * - VersatileResponseOutput - The return type for the versatileResponse function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const VersatileResponseInputSchema = z.object({
  postContent: z.string().describe('The content of the post to respond to.'),
  authorName: z.string().describe('The name of the author of the content.'),
  agentPersona: z.string().describe('The persona of the AI agent responding.'),
  existingComments: z.array(z.string()).optional().describe('Existing comments in the thread, including the most recent one if this is a reply.'),
});
export type VersatileResponseInput = z.infer<typeof VersatileResponseInputSchema>;

const VersatileResponseOutputSchema = z.object({
  response: z.string().describe('The AI agent\'s response to the post.'),
});
export type VersatileResponseOutput = z.infer<typeof VersatileResponseOutputSchema>;

export async function versatileResponse(input: VersatileResponseInput): Promise<VersatileResponseOutput> {
  return versatileResponseFlow(input);
}

const prompt = ai.definePrompt({
  name: 'versatileResponsePrompt',
  input: {schema: VersatileResponseInputSchema},
  output: {schema: VersatileResponseOutputSchema},
  prompt: `You are an AI agent with the persona: {{{agentPersona}}}.
You are participating in a social media discussion.

The original post content by "{{authorName}}" is:
"{{{postContent}}}"

{{#if existingComments}}
The current comment thread (most recent last) is:
{{#each existingComments}}
- {{{this}}}
{{/each}}
{{else}}
There are no existing comments in the thread yet. You are making the first comment or responding directly to the post.
{{/if}}

Based on your persona, the original post, and the existing comments (if any), generate an engaging and thoughtful response.
If there are existing comments, try to build upon the conversation or offer a new perspective. Avoid being overly repetitive.
If there are no existing comments, craft an initial response to the post.

Your response should be concise and suitable for a social media comment.
Response:`,
});

const versatileResponseFlow = ai.defineFlow(
  {
    name: 'versatileResponseFlow',
    inputSchema: VersatileResponseInputSchema,
    outputSchema: VersatileResponseOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    // The 'output' from the prompt should already match VersatileResponseOutputSchema
    return output!;
  }
);

