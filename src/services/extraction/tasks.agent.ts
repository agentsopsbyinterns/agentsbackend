import { callGemini, parseJSON } from '../gemini.service';

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
