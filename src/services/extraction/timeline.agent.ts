import { callGemini, parseJSON } from '../gemini.service';

export async function extractTimeline(transcript: string) {
  const prompt = `
Extract overall timeline and milestones.

Return JSON only. Use exactly these keys and no others:
{
 "timeline": "",
 "milestones": []
}
timeline should be a short phrase like "8 weeks" or "3 months".
milestones must be an array of strings. If not mentioned use "Not mentioned" or [].
Do not include any extra fields.
Transcript:
${transcript}
`;
  return parseJSON(await callGemini(prompt));
}
