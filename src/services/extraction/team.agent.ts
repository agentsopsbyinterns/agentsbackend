import { callGemini, parseJSON } from '../gemini.service';

export async function extractTeam(transcript: string) {
  const prompt = `
Extract suggested team members and roles.

Return JSON only. Use exactly these keys and no others:
{
 "team": [
  { "name": "", "role": "" }
 ]
}
Ensure each item has name and role. If not mentioned return []. Do not include any extra fields.
Transcript:
${transcript}
`;
  return parseJSON(await callGemini(prompt));
}
