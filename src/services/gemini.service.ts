import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "../config/env";

let _genAI: GoogleGenerativeAI | null = null;
function getGenAI() {
  if (!_genAI) {
    if (!env.GEMINI_API_KEY) {
      console.error("[gemini] GEMINI_API_KEY is missing. Set it in your .env");
      return null;
    }
    _genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
  }
  return _genAI;
}

export async function callGemini(prompt: string): Promise<string> {
  const client = getGenAI();
  if (!client) return "{}";
  const modelName = env.GEMINI_MODEL || "gemini-1.5-flash";
  try {
    const model = client.getGenerativeModel({ model: modelName });
    const resp = await model.generateContent(prompt);
    const text = resp?.response?.text?.() || "";
    return text || "{}";
  } catch (e: any) {
    const msg = e?.message || String(e);
    console.error("[gemini] SDK error:", msg);
    // Fallback to -latest or -8b variants commonly available
    const fallbacks = [];
    if (!modelName.endsWith("-latest")) fallbacks.push(`${modelName}-latest`);
    if (!fallbacks.includes("gemini-1.5-flash-8b")) fallbacks.push("gemini-1.5-flash-8b");
    if (!fallbacks.includes("gemini-pro")) fallbacks.push("gemini-pro");
    for (const alt of fallbacks) {
      try {
        console.warn(`[gemini] retrying with model: ${alt}`);
        const altModel = client.getGenerativeModel({ model: alt });
        const resp = await altModel.generateContent(prompt);
        const text = resp?.response?.text?.() || "";
        return text || "{}";
      } catch (e2: any) {
        console.error("[gemini] fallback failed:", e2?.message || String(e2));
      }
    }
    return "{}";
  }
}
