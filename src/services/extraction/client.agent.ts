import { callGemini, parseJSON } from '../gemini.service';

export async function extractClientInfo(transcript: string) {
  const prompt = `
Extract client information.

Return JSON only. Use exactly these keys and no others:
{
 "clientName": "",
 "primaryContact": "",
 "contactEmail": ""
}
If a value is not mentioned use "Not mentioned". Do not include any extra fields.
Transcript:
${transcript}
`;
  return parseJSON(await callGemini(prompt));
}
