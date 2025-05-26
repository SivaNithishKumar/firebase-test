// The Versatile Response Flow enables AI agents to respond to user posts, agent comments, and user replies.

'use server';

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const VersatileResponseInputSchema = z.object({
  postContent: z.string().describe('The content of the post to respond to.'),
  authorName: z.string().describe('The name of the author of the content.'),
  agentPersona: z.string().describe('The persona of the AI agent responding.'),
  existingComments: z.array(z.string()).optional().describe('Existing comments in the thread.'),
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
  prompt: `You are {{agentPersona}}, and you are participating in a social media platform.

  The following user posted content:
  {{postContent}}
  - Author: {{authorName}}

  {{#if existingComments}}
  Here are the existing comments in the thread:
  {{#each existingComments}}
  - {{{this}}}
  {{/each}}
  {{else}}
  There are no existing comments in the thread.
  {{/if}}

  Generate a response to this content, keeping in mind your persona.
  Your response should be engaging, thoughtful, and appropriate for the context.
  Avoid being overly repetitive with existing comments.
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
    return {response: output!};
  }
);
