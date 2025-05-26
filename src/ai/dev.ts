
import { config } from 'dotenv';
config();

// import '@/ai/flows/intelligent-reaction.ts'; // Obsolete
// import '@/ai/flows/versatile-response.ts'; // Obsolete
// import '@/ai/flows/generateAgentDetailsFromIdeaFlow.ts'; // Obsolete - Replaced by conversational flow
import '@/ai/flows/agent-decision-flow.ts';
import '@/ai/flows/converseToCreateAgentFlow.ts'; // New conversational flow
