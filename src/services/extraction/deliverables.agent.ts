import { callGemini, parseJSON } from '../gemini.service';

export async function extractDeliverables(transcript: string) {
  const prompt = `
Extract project deliverables.

Return JSON only. Use exactly these keys and no others:
{
 "deliverables": []
}
deliverables must be an array of strings. If not mentioned return [].
Do not include any extra fields.
Transcript:
${transcript}
`;
  return parseJSON(await callGemini(prompt));
}
