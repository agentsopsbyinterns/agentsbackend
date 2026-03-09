import { callGemini, parseJSON } from '../gemini.service';

export async function extractMissing(transcript: string) {
  const prompt = `
Identify missing information required to complete the project brief.

Return JSON only. Use exactly these keys and no others:
{
 "missingInformation": []
}
Return an array of strings such as "Budget", "Timeline", "Team", "Goals".
If nothing is missing return []. Do not include any extra fields.
Transcript:
${transcript}
`;
  return parseJSON(await callGemini(prompt));
}
