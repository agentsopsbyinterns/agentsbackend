import { env } from "../config/env";
import OpenAI from "openai";

let _openai: any | null = null;
async function getOpenAI() {
  if (!_openai) {
    if (!env.OPENAI_API_KEY) {
      console.error("[openai] OPENAI_API_KEY is missing. Set it in your .env");
      return null;
    }
    try {
      _openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    } catch (e: any) {
      console.error("[openai] failed to load SDK:", e?.message || String(e));
      return null;
    }
  }
  return _openai;
}

export async function callOpenAI(prompt: string): Promise<string> {
  const client = await getOpenAI();
  if (!client) return "{}";
  const modelName = env.OPENAI_MODEL || "gpt-4o-mini";
  try {
    const resp = await client.chat.completions.create({
      model: modelName,
      messages: [
        { role: "system", content: "You are a precise extractor. Respond with valid JSON only." },
        { role: "user", content: prompt }
      ],
      temperature: 0.1,
    });
    const text = resp?.choices?.[0]?.message?.content || "";
    return text || "{}";
  } catch (e: any) {
    const msg = e?.message || String(e);
    console.error("[openai] SDK error:", msg);
    // Fallback models likely available
    const fallbacks = [];
    if (modelName !== "gpt-4o-mini-2024-07-18") fallbacks.push("gpt-4o-mini-2024-07-18");
    if (modelName !== "gpt-4o-mini") fallbacks.push("gpt-4o-mini");
    if (modelName !== "gpt-3.5-turbo") fallbacks.push("gpt-3.5-turbo");
    for (const alt of fallbacks) {
      try {
        console.warn(`[openai] retrying with model: ${alt}`);
        const resp = await client.chat.completions.create({
          model: alt,
          messages: [
            { role: "system", content: "You are a precise extractor. Respond with valid JSON only." },
            { role: "user", content: prompt }
          ],
          temperature: 0.2,
        });
        const text = resp?.choices?.[0]?.message?.content || "";
        return text || "{}";
      } catch (e2: any) {
        console.error("[openai] fallback failed:", e2?.message || String(e2));
      }
    }
    return "{}";
  }
}
