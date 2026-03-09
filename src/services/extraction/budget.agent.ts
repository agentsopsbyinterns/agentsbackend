import { callGemini, parseJSON } from '../gemini.service';

export async function extractBudget(transcript: string) {
  const prompt = `
Extract the project budget.

Return JSON only. Use exactly these keys and no others:
{
 "budget": ""
}
Return number only (example: 50000). If currency mentioned, return just the number.
If not mentioned return "Not mentioned". Do not include any extra fields.
Transcript:
${transcript}
`;
  return parseJSON(await callGemini(prompt));
}
