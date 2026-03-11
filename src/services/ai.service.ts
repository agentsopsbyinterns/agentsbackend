import { env } from "../config/env";
import { callGemini } from "./gemini.service";
import { callOpenAI } from "./openai.service";

// Minimal helpers kept locally to avoid cross-file utils and keep AI-only focus
export function parseJSON(text: string) {
  try {
    return JSON.parse(text);
  } catch {}
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return {};
  try {
    return JSON.parse(m[0]);
  } catch {
    return {};
  }
}

export function cleanTranscript(raw: string) {
  return raw.replace(/\r/g, "").replace(/\t/g, "").replace(/[ ]{2,}/g, " ").trim();
}

async function callAIProvider(prompt: string): Promise<string> {
  const provider = env.AI_PROVIDER || "openai"; // Default to OpenAI

  if (provider === "gemini") {
    return callGemini(prompt);
  } else if (provider === "openai") {
    return callOpenAI(prompt);
  } else {
    console.warn(`[ai.service] Unknown AI_PROVIDER: ${provider}. Defaulting to OpenAI.`);
    return callOpenAI(prompt);
  }
}

export async function extractMeetingData(transcript: string): Promise<any> {
  const prompt = `
You are an AI system that extracts structured project information from a meeting transcript. 
 
 Carefully analyze the transcript and extract ALL relevant project details. 
 
 IMPORTANT RULES 
 
 1. Only extract information explicitly mentioned in the transcript. 
 2. Do NOT guess or hallucinate information. 
 3. If something is not mentioned return "Not mentioned". 
 4. Always return VALID JSON only. 
 5. Do not include explanations or extra text. 
 6. Ensure no section is missing in the final JSON. 
 7. If multiple items exist (tasks, deliverables, risks) return them as arrays. 
 8. Separate task description, owner, and deadline properly. 
 
 TASK EXTRACTION RULES 
 
 When extracting milestones/tasks: 
 
 - The "task" field must only contain the task description. 
 - The "owner" field must contain the person responsible. 
 - The "deadline" field must contain the date or timeline. 
 
 Do NOT include the owner name inside the task field. 
 
 Example sentence: 
 
 "Backend architecture setup will be handled by Daniel Kim and completed by March 25." 
 
 Correct output: 
 
 { 
  "task": "Backend architecture setup", 
  "owner": "Daniel Kim", 
  "deadline": "March 25" 
 } 
 
 TECH STACK EXTRACTION RULES 
 
 Extract ALL technologies mentioned throughout the entire transcript. 
 
 SCAN THE TRANSCRIPT MULTIPLE TIMES to ensure no technologies are missed, especially those mentioned in the middle or end. 
 
 Categories and examples of technologies to detect: 
 
 - Backend: Node.js, Express, Python, Go, Java, Ruby, PHP, Django, Flask, FastAPI 
 - Frontend: React, Vue, Angular, Svelte, Next.js, Tailwind CSS, Bootstrap 
 - Mobile: React Native, Flutter, Swift, Kotlin, Ionic 
 - Programming Languages: TypeScript, JavaScript, Python, C++, Rust, Go, Java 
 - Databases: PostgreSQL, MongoDB, MySQL, SQLite, Cassandra, MariaDB 
 - Caching: Redis, Memcached 
 - Analytics: Google Analytics, Mixpanel, Amplitude, Segment, Python (if used for data) 
 - Infrastructure: AWS, Azure, Google Cloud (GCP), Heroku, DigitalOcean, Vercel, Netlify 
 - Containers: Docker, Kubernetes, Podman 
 - Tools/APIs: GraphQL, Firebase, Stripe, Twilio, SendGrid, Auth0 
 
 Ensure that ALL technologies found are included in the technical_stack section. 
 
 SECTIONS TO EXTRACT 
 
 Client Information 
 - client_name 
 - primary_contact 
 - contact_email 
 
 Project Summary 
 - summary 
 
 Project Goals 
 - list of goals 
 
 Deliverables 
 - list of deliverables 
 
 Timeline 
 - overall timeline 
 
 Milestones (tasks) 
 Each milestone must contain: 
 - task 
 - owner 
 - deadline 
 
 Budget 
 - project_budget 
 
 Technical Stack 
 Categorize ALL technologies into: 
 
 - backend 
 - frontend 
 - mobile 
 - database 
 - caching 
 - analytics 
 - infrastructure 
 - containers 
 - cloud_providers 
 - languages 
 
 Suggested Team 
 - list of team members or roles mentioned 
 
 Risks 
 - list all risks or concerns mentioned 
 
 Missing Information 
 - list details the team still needs to confirm 
 
 FINAL OUTPUT FORMAT 
 
 Return the result strictly in this JSON schema: 
 
 { 
   "client_information": { 
     "client_name": "", 
     "primary_contact": "", 
     "contact_email": "" 
   }, 
   "project_summary": "", 
   "project_goals": [], 
   "deliverables": [], 
   "timeline": { 
     "overall_timeline": "" 
   }, 
   "milestones": [ 
     { 
       "task": "", 
       "owner": "", 
       "deadline": "" 
     } 
   ], 
   "budget": "", 
   "technical_stack": { 
     "backend": [], 
     "frontend": [], 
     "mobile": [], 
     "database": [], 
     "caching": [], 
     "analytics": [], 
     "infrastructure": [], 
     "containers": [], 
     "cloud_providers": [], 
     "languages": [] 
   }, 
   "suggested_team": [], 
   "risks": [], 
   "missing_information": [] 
 } 
 
 Before returning the JSON: 
 
 1. Review the transcript at least three times to ensure ALL tasks, deadlines, technologies, or risks were missed. 
 2. Pay extra attention to technologies mentioned later in the conversation. 
 3. Ensure milestones contain owner and deadline if mentioned. 
 4. Ensure technical_stack is comprehensive. 
 
 Transcript:
 ${transcript}
`;

  const response = await callAIProvider(prompt);
  const result = parseJSON(response);

  console.log("FINAL EXTRACTION RESULT:", result);

  return result;
}

export const callAI = callAIProvider;
