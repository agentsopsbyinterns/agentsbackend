import { callGemini, parseJSON } from '../gemini.service';

export async function extractTech(transcript: string) {
  const prompt = `
Extract technical stack and requirements.

Return JSON only. Use exactly these keys and no others:
{
 "techStack": [],
 "requirements": []
}
All arrays must contain only strings. If not mentioned return []. Do not include any extra fields.
Transcript:
${transcript}
`;
  return parseJSON(await callGemini(prompt));
}
