import { callGemini, parseJSON } from '../gemini.service';
import { getLLMProvider } from '../llm/provider';

export async function extractTasks(transcript: string) {
  const prompt = `
Extract a list of action items or tasks.

Return JSON only. Use exactly these keys and no others:
{
 "tasks": []
}
Return tasks as an array of short strings. If not mentioned return []. Do not include any extra fields.
Transcript:
${transcript}
`;
  return parseJSON(await callGemini(prompt));
}

export async function generateTasksFromTranscript(transcript: string): Promise<string[]> {
  const prompt = `
Extract a concise list of action items or tasks from the meeting transcript.

Return JSON only using exactly this shape:
{ "tasks": [] }

Each task should be a short actionable string.
Transcript:
${transcript}
`;
  const provider = getLLMProvider();
  const text = await provider.generate(prompt);
  const obj = parseJSON(text) as any;
  const arr = Array.isArray(obj?.tasks) ? obj.tasks : [];
  return arr.map((x: any) => String(x)).filter(Boolean);
}
