import { callGemini, parseJSON } from '../gemini.service';

export async function extractSummaryGoals(transcript: string) {
  const prompt = `
Extract project summary and goals.

Return JSON only. Use exactly these keys and no others:
{
 "summary": "",
 "goals": []
}
Goals must be an array of strings. If a value is not mentioned use "Not mentioned" or [].
Do not include any extra fields.
Transcript:
${transcript}
`;
  return parseJSON(await callGemini(prompt));
}
