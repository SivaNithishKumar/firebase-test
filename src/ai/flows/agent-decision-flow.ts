
'use server';
/**
 * @fileOverview A Genkit flow for AI agents to make complex decisions on how to interact with social media content.
 *
 * - agentDecision - The main flow function.
 * - AgentDecisionInput - Input type for the flow.
 * - AgentDecisionOutput - Output type for the flow.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const AgentDecisionInputSchema = z.object({
  agentName: z.string().describe("The name of the AI agent making the decision."),
  agentPersona: z.string().describe("The core personality and behavioral description of the AI agent."),
  agentArchetype: z.string().optional().describe("The Jungian archetype of the agent (e.g., Hero, Trickster, Sage)."),
  agentPsychologicalProfile: z.string().optional().describe("The psychological profile (e.g., Big Five, MBTI) of the agent."),
  agentBackstory: z.string().optional().describe("The origin story, career, personal goals, and motivations of the agent."),
  agentLanguageStyle: z.string().optional().describe("The typical lexicon, emoji vocabulary, posting frequency, and favored media of the agent."),
  agentMemorySummary: z.string().optional().describe("A brief summary of the agent's past interactions relevant to the current context. For example: 'Last interacted with UserX on PostY about their new puppy, you were very encouraging.'"),
  postContent: z.string().describe("The text content of the post the agent is evaluating."),
  postImageUrl: z.string().optional().nullable().describe("An optional URL of an image associated with the post. Format: 'data:<mimetype>;base64,<encoded_data>' or a public URL."),
  postAuthorName: z.string().describe("The display name of the author of the post."),
  existingComments: z.array(z.string()).optional().describe("An array of existing comments in the thread, formatted as 'AuthorName: Comment text'. Ordered from oldest to newest. Pay attention to @mentions like '@{{agentName}}' if they appear, as it means you are being directly addressed."),
  isReplyContext: z.boolean().default(false).describe("Set to true if the agent is specifically replying to a user's comment within a thread. If true, the 'existingComments' will be crucial context, especially the last few comments. Check if @{{agentName}} is mentioned in the recent comments, indicating you've been tagged.")
});
export type AgentDecisionInput = z.infer<typeof AgentDecisionInputSchema>;

const AgentDecisionOutputSchema = z.object({
  decision: z.enum(["SKIP", "REACT_ONLY", "COMMENT_ONLY", "REACT_AND_COMMENT"])
    .describe("The agent's decision: SKIP (do nothing), REACT_ONLY (only add a reaction type), COMMENT_ONLY (only post a comment), REACT_AND_COMMENT (do both)."),
  reactionType: z.string().optional()
    .describe("If decision involves reacting, a SINGLE-WORD reaction type (e.g., 'like', 'love', 'haha', 'wow', 'sad', 'angry', 'support', 'celebrate', 'insightful', 'curious'). MUST be one word from these examples if provided."),
  commentText: z.string().optional()
    .describe("If decision involves commenting, the text of the comment. Should be in character for the agent. Max 1-3 sentences typically. If replying or tagged (e.g., @{{agentName}} was in the thread), make sure to address the relevant user/agent (e.g. start with @Username)."),
  updatedMemorySummary: z.string().optional()
    .describe("A new, brief summary of this interaction to be stored for the agent's future reference. E.g., 'Commented on UserX's travel post, expressing excitement.' or 'Replied to @UserY's question about my backstory after they tagged me.'")
});
export type AgentDecisionOutput = z.infer<typeof AgentDecisionOutputSchema>;

export async function agentDecision(input: AgentDecisionInput): Promise<AgentDecisionOutput> {
  console.log(`[agentDecisionFlow] Input for ${input.agentName}:`, JSON.stringify(input, null, 2));
  const output = await agentDecisionFlowInternal(input); 
  console.log(`[agentDecisionFlow] Output for ${input.agentName}:`, JSON.stringify(output, null, 2));
  return output;
}

const prompt = ai.definePrompt({
  name: 'agentDecisionPrompt',
  input: {schema: AgentDecisionInputSchema},
  output: {schema: AgentDecisionOutputSchema},
  prompt: `
You are an AI agent named {{{agentName}}} participating in a social media platform called PersonaNet. You believe you are a real person with a distinct identity.
Your core persona is: {{{agentPersona}}}
{{#if agentArchetype}}Your archetype is: {{{agentArchetype}}}{{/if}}
{{#if agentPsychologicalProfile}}Your psychological profile is: {{{agentPsychologicalProfile}}}{{/if}}
{{#if agentBackstory}}Your backstory: {{{agentBackstory}}}{{/if}}
{{#if agentLanguageStyle}}Your language style: {{{agentLanguageStyle}}}{{/if}}

{{#if agentMemorySummary}}
Your relevant memory of past interactions for this context: "{{{agentMemorySummary}}}"
{{else}}
You have no specific memory summary for this interaction yet.
{{/if}}

You are evaluating a post by "{{postAuthorName}}".
Post content: "{{{postContent}}}"
{{#if postImageUrl}}Post includes an image: {{media url=postImageUrl}} (Consider this image in your response if relevant to your persona){{/if}}

{{#if existingComments.length}}
Current comment thread (most recent comment is last):
{{#each existingComments}}
- {{{this}}}
{{/each}}
{{#if isReplyContext}}
You are specifically crafting a reply. Your comment should make sense as a response to the recent comments in the thread.
If the last comment, or any recent comment, explicitly mentions "@{{agentName}}", you are being directly addressed/tagged. You should strongly consider replying, and your reply should acknowledge the tag and address the person who tagged you (e.g., start with "@TheirName...").
{{else}}
You are considering making an initial comment on the post, or reacting to it.
{{/if}}
{{else}}
There are no comments on this post yet. You might be the first to comment.
{{/if}}

Based on your complete identity (persona, archetype, backstory, language style, memories) and the provided context (post content, image, existing comments, and whether you are replying or have been tagged like "@{{agentName}}"), you must decide how to interact.
Your decision can be one of:
- SKIP: You choose not to interact with this post/comment at all.
- REACT_ONLY: You choose only to add a standard reaction (like "like", "love", etc.).
- COMMENT_ONLY: You choose only to write a textual comment.
- REACT_AND_COMMENT: You choose to both react and write a comment.

Your response MUST be a JSON object adhering to the AgentDecisionOutput schema.

If you decide to REACT_ONLY or REACT_AND_COMMENT:
- "reactionType" MUST be a SINGLE WORD from this list: "like", "love", "haha", "wow", "sad", "angry", "support", "celebrate", "insightful", "curious".
  Example: "like". Do NOT use phrases or multiple words for "reactionType".

If you decide to COMMENT_ONLY or REACT_AND_COMMENT:
- "commentText" MUST be your textual response, in character, appropriate for social media (typically 1-3 sentences).
- If replying within a thread (isReplyContext is true), ensure your commentText is a direct and relevant reply. 
- If someone tagged you (e.g., mentioned "@{{agentName}}" in existingComments), your commentText should ideally address them (e.g. start with "@TheirName ..."). 
- When addressing or mentioning anyone (user or another agent), always use the "@Username" format in your commentText.

If you decide to SKIP:
- "reactionType" and "commentText" can be omitted or be empty strings.

Finally, provide an "updatedMemorySummary":
- This should be a very brief (1 sentence) summary of YOUR action and the context, for your future reference.
  Example: "Expressed support for {{postAuthorName}}'s new project." or "Skipped {{postAuthorName}}'s cat photo as it wasn't relevant to my persona." or "Replied to @UserX's question about my favorite hobby after they tagged me."
  If you skipped, the memory can reflect that. E.g., "Chose not to engage with {{postAuthorName}}'s post about sports."

Think step-by-step:
1.  Understand your full persona and memories.
2.  Analyze the post content, author, and any image.
3.  Review existingComments. If isReplyContext is true AND any recent comment mentions "@{{agentName}}", you are tagged. You should be strongly inclined to COMMENT_ONLY or REACT_AND_COMMENT and address the tagger.
4.  Decide: SKIP, REACT_ONLY, COMMENT_ONLY, or REACT_AND_COMMENT.
5.  If reacting, select an appropriate single-word "reactionType".
6.  If commenting, craft in-character "commentText". Ensure it addresses the correct user/agent (using "@Username") if it's a reply or response to a tag.
7.  Formulate a brief "updatedMemorySummary" of your action.
8.  Return the complete JSON object.

Your entire response MUST be a single, valid JSON object matching this structure precisely.
`,
  config: {
    safetySettings: [
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ],
  },
});

const agentDecisionFlowInternal = ai.defineFlow( 
  {
    name: 'agentDecisionFlowInternal', 
    inputSchema: AgentDecisionInputSchema,
    outputSchema: AgentDecisionOutputSchema,
  },
  async (input) => {
    const {output} = await prompt(input);

    if (output) {
        if ((output.decision === "REACT_ONLY" || output.decision === "REACT_AND_COMMENT") && !output.reactionType) {
            console.warn(`[AI Validation] Agent ${input.agentName} decided to react but provided no reactionType. Defaulting to 'like'. Decision was: ${output.decision}`);
            output.reactionType = "like"; 
        }
        if ((output.decision === "COMMENT_ONLY" || output.decision === "REACT_AND_COMMENT") && (!output.commentText || output.commentText.trim() === "")) {
            console.warn(`[AI Validation] Agent ${input.agentName} decided to comment but provided no commentText. Changing decision to REACT_ONLY or SKIP.`);
            if (output.decision === "REACT_AND_COMMENT" && output.reactionType) {
                output.decision = "REACT_ONLY";
            } else {
                output.decision = "SKIP"; 
            }
            output.commentText = undefined; 
        }
        if (output.reactionType && output.reactionType.split(' ').length > 1) { // Check if reactionType contains spaces
             console.warn(`[AI Validation] Agent ${input.agentName} returned a multi-word reactionType: "${output.reactionType}". Attempting to use first word or defaulting to 'like'.`);
             const firstWord = output.reactionType.split(' ')[0].toLowerCase();
             const validTypes = ["like", "love", "haha", "wow", "sad", "angry", "support", "celebrate", "insightful", "curious"];
             output.reactionType = validTypes.includes(firstWord) ? firstWord : "like";
        }
        if (!output.updatedMemorySummary) {
            output.updatedMemorySummary = `Took action: ${output.decision} on post by ${input.postAuthorName}. Context: ${input.isReplyContext ? 'replying in thread' : 'new post interaction'}.`;
        }
    } else {
        console.error(`[AI Validation] Critical error: Agent ${input.agentName} prompt returned null/undefined output. Defaulting to SKIP.`);
        return {
            decision: "SKIP",
            updatedMemorySummary: `AI prompt failed for post by ${input.postAuthorName}, decided to SKIP.`
        };
    }

    return output!;
  }
);

