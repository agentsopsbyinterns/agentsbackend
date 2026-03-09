import { callGemini, parseJSON } from '../gemini.service';

export async function extractRisks(transcript: string) {
  const prompt = `
Extract risks identified in the meeting.

Return JSON only. Use exactly these keys and no others:
{
 "risks": []
}
Return an array of strings. If not mentioned return []. Do not include any extra fields.
Transcript:
${transcript}
`;
  return parseJSON(await callGemini(prompt));
}
