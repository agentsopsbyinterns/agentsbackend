import { GoogleGenerativeAI } from '@google/generative-ai';
import fetch from 'node-fetch';
import { env } from '../../config/env';

export type LLMProviderName = 'gemini' | 'deepseek' | 'none';

export interface LLMProvider {
  name: LLMProviderName;
  generate(prompt: string): Promise<string>;
}

class NoopProvider implements LLMProvider {
  name: LLMProviderName = 'none';
  async generate(_prompt: string): Promise<string> {
    console.error('[llm] No provider enabled or API key missing');
    return '{}';
  }
}

class GeminiProvider implements LLMProvider {
  name: LLMProviderName = 'gemini';
  private client: GoogleGenerativeAI;
  private model: string;
  constructor(apiKey: string, model?: string) {
    this.client = new GoogleGenerativeAI(apiKey);
    this.model = model || 'gemini-1.5-flash';
  }
  async generate(prompt: string): Promise<string> {
    try {
      const model = this.client.getGenerativeModel({ model: this.model });
      const resp = await model.generateContent(prompt);
      return resp?.response?.text?.() || '{}';
    } catch (e: any) {
      const msg = e?.message || String(e);
      console.error('[llm][gemini] error:', msg);
      const fallbacks = [];
      if (!this.model.endsWith('-latest')) fallbacks.push(`${this.model}-latest`);
      if (!fallbacks.includes('gemini-1.5-flash-8b')) fallbacks.push('gemini-1.5-flash-8b');
      if (!fallbacks.includes('gemini-2.0-flash')) fallbacks.push('gemini-2.0-flash');
      for (const alt of fallbacks) {
        try {
          const altModel = this.client.getGenerativeModel({ model: alt });
          const resp = await altModel.generateContent(prompt);
          return resp?.response?.text?.() || '{}';
        } catch (e2: any) {
          console.error('[llm][gemini] fallback failed:', e2?.message || String(e2));
        }
      }
      return '{}';
    }
  }
}

class DeepSeekProvider implements LLMProvider {
  name: LLMProviderName = 'deepseek';
  private apiKey: string;
  private model: string;
  constructor(apiKey: string, model?: string) {
    this.apiKey = apiKey;
    this.model = model || 'deepseek-chat';
  }
  async generate(prompt: string): Promise<string> {
    try {
      const url = 'https://api.deepseek.com/v1/chat/completions';
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2
        })
      });
      if (!res.ok) {
        const txt = await res.text();
        console.error('[llm][deepseek] http error:', res.status, txt);
        return '{}';
      }
      const data: any = await res.json();
      const content = data?.choices?.[0]?.message?.content || '';
      return content || '{}';
    } catch (e: any) {
      console.error('[llm][deepseek] error:', e?.message || String(e));
      return '{}';
    }
  }
}

export function getLLMProvider(): LLMProvider {
  const gemEnabled = !!env.GEMINI_ENABLED;
  const dsEnabled = !!env.DEEPSEEK_ENABLED;
  // Ensure single active provider; prefer Gemini if both accidentally true
  if (gemEnabled && env.GEMINI_API_KEY) {
    return new GeminiProvider(env.GEMINI_API_KEY, env.GEMINI_MODEL);
  }
  if (dsEnabled && env.DEEPSEEK_API_KEY) {
    return new DeepSeekProvider(env.DEEPSEEK_API_KEY, env.DEEPSEEK_MODEL);
  }
  // If flags unset, try by keys for convenience
  if (env.GEMINI_API_KEY) {
    return new GeminiProvider(env.GEMINI_API_KEY, env.GEMINI_MODEL);
  }
  if (env.DEEPSEEK_API_KEY) {
    return new DeepSeekProvider(env.DEEPSEEK_API_KEY, env.DEEPSEEK_MODEL);
  }
  return new NoopProvider();
}
