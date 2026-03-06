import { env } from '../../config/env';

type StructuredOutput = {
  clientInformation: {
    clientName: string;
    primaryContact: string;
    contactEmail: string;
  };
  projectSummary: string;
  projectGoals: string[];
  deliverables: string[];
  timeline: {
    overallTimeline: string;
    milestones: string[];
  };
  budget: string;
  technicalRequirements: string[];
  tasks: Array<{ title: string; assignee: string; deadline: string }>;
};

function promptForTranscript(transcript: string) {
  return `
You are an AI project analyst.
Extract structured project information strictly as JSON.
Schema:
{
  "clientInformation": {
    "clientName": "",
    "primaryContact": "",
    "contactEmail": ""
  },
  "projectSummary": "",
  "projectGoals": [],
  "deliverables": [],
  "timeline": {
    "overallTimeline": "",
    "milestones": []
  },
  "budget": "",
  "technicalRequirements": [],
  "tasks": [
    { "title": "", "assignee": "", "deadline": "" }
  ]
}
Rules:
- Return ONLY valid JSON, no markdown, no comments.
- Leave missing values as empty strings or empty arrays.
- Extract tasks from sentences such as "Dev Kumar will implement frontend by 26 January".
- Task title should be imperative ("Implement Frontend"), keep original assignee and deadline text.
- Do not invent data.

Transcript:
${transcript}
`;
}

export async function extractWithOpenAI(transcript: string): Promise<StructuredOutput | null> {
  const key = env.OPENAI_API_KEY;
  if (!key) return null;
  const model = env.OPENAI_MODEL || 'gpt-4o-mini';
  const body = {
    model,
    messages: [
      { role: 'system', content: 'You are a precise JSON-only extractor.' },
      { role: 'user', content: promptForTranscript(transcript) }
    ],
    response_format: { type: 'json_object' }
  };
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    const data: any = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content || typeof content !== 'string') return null;
    const parsed = JSON.parse(content);
    return parsed as StructuredOutput;
  } catch {
    return null;
  }
}

export type { StructuredOutput };
