import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "../config/env";

import { extractClientInfo } from "./extraction/client.agent";
import { extractSummaryGoals } from "./extraction/summaryGoals.agent";
import { extractDeliverables } from "./extraction/deliverables.agent";
import { extractTimeline } from "./extraction/timeline.agent";
import { extractBudget } from "./extraction/budget.agent";
import { extractTech } from "./extraction/tech.agent";
import { extractTasks } from "./extraction/tasks.agent";
import { extractTeam } from "./extraction/team.agent";
import { extractRisks } from "./extraction/risks.agent";
import { extractMissing } from "./extraction/missing.agent";

// Minimal helpers kept locally to avoid cross-file utils and keep AI-only focus
export function parseJSON(text: string) {
  try {
    return JSON.parse(text);
  } catch {}
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return {};
  try {
    return JSON.parse(m[0]);
  } catch {
    return {};
  }
}
function toStringArray(input: any): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const v of input) {
    if (v == null) continue;
    out.push(String(v).trim());
  }
  return Array.from(new Set(out.filter(Boolean)));
}
function normalizeTeam(input: any): Array<{ name: string; role: string }> {
  if (!Array.isArray(input)) return [];
  const out: Array<{ name: string; role: string }> = [];
  for (const v of input) {
    if (typeof v === "string") {
      const name = v.trim();
      if (name) out.push({ name, role: "Not mentioned" });
      continue;
    }
    const name = String((v && v.name) || "").trim();
    const role = String((v && v.role) || "").trim() || "Not mentioned";
    if (name) out.push({ name, role });
  }
  const seen = new Set<string>();
  const res: Array<{ name: string; role: string }> = [];
  for (const t of out) {
    const k = `${t.name.toLowerCase()}|${t.role.toLowerCase()}`;
    if (seen.has(k)) continue;
    seen.add(k);
    res.push(t);
  }
  return res;
}

export function cleanTranscript(raw: string) {
  return raw.replace(/\r/g, "").replace(/\t/g, "").replace(/[ ]{2,}/g, " ").trim();
}

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
    if (!fallbacks.includes("gemini-2.0-flash")) fallbacks.push("gemini-2.0-flash");
    if (!fallbacks.includes("gemini-pro")) fallbacks.push("gemini-pro");
    if (!fallbacks.includes("gemini-1.0-pro")) fallbacks.push("gemini-1.0-pro");
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

function uniq(arr: string[]) {
  return Array.from(new Set(arr.map((s) => String(s).trim()).filter(Boolean)));
}

function deriveClientName(text: string) {
  const patterns = [
    /client name\s*:\s*([A-Za-z0-9 .&'-]+)/i,
    /company name\s*is\s*([A-Za-z0-9 .&'-]+)/i,
    /our company name\s*is\s*([A-Za-z0-9 .&'-]+)/i,
    /project\s+(?:for|with)\s+([A-Za-z][A-Za-z0-9 .&'-]+)/i,
    /primary contact (?:person )?from\s+([A-Za-z][A-Za-z0-9 .&'-]+)/i
  ];

  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1].trim().replace(/[.]+$/, "");
  }

  return "Not mentioned";
}

function deriveMilestones(text: string) {
  const out: string[] = [];
  const re = /\bWeek\s*(\d+)\b/gi;

  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    const wk = `Week ${m[1]}`;
    if (!out.includes(wk)) out.push(wk);
  }

  return out;
}

function deriveBudget(text: string) {
  const dollar = text.match(/\$\s?\d{1,}(?:[,\d]{3})*(?:\.\d+)?/);

  if (dollar) return dollar[0].replace(/[^\d]/g, "");

  const m = text.match(/\bbudget[^0-9]*(\d{3,})/i);

  return m ? m[1] : "Not mentioned";
}

function extractGoalsRegex(text: string) {
  const section = text.match(/PROJECT GOALS([\s\S]*?)DELIVERABLES/i);

  if (!section) return [];

  return section[1]
    .split("\n")
    .map((s) => s.replace(/[-•*]/g, "").trim())
    .filter(Boolean);
}

function extractDeliverablesRegex(text: string) {
  const section = text.match(/DELIVERABLES([\s\S]*?)TIMELINE/i);

  if (!section) return [];

  return section[1]
    .split("\n")
    .map((s) => s.replace(/[-•*]/g, "").trim())
    .filter(Boolean);
}

function extractTasksRegex(text: string) {
  const section = text.match(/TASK BREAKDOWN([\s\S]*?)TEAM/i);

  if (!section) return [];

  return section[1]
    .split("\n")
    .map((s) => s.replace(/[-•*]/g, "").trim())
    .filter(Boolean);
}

export async function extractMeetingData(transcript: string): Promise<any> {

  const [
    client,
    summaryGoals,
    deliverables,
    timeline,
    budget,
    tech,
    tasks,
    team,
    risks,
    missing
  ] = await Promise.all([
    extractClientInfo(transcript),
    extractSummaryGoals(transcript),
    extractDeliverables(transcript),
    extractTimeline(transcript),
    extractBudget(transcript),
    extractTech(transcript),
    extractTasks(transcript),
    extractTeam(transcript),
    extractRisks(transcript),
    extractMissing(transcript)
  ]);

  let clientName = client?.clientName || "Not mentioned";

  let primaryContact = client?.primaryContact || "Not mentioned";

  let contactEmail = client?.contactEmail || null;

  // In AI-only mode, do not backfill clientName/primaryContact/email from regex

  let goals = uniq(toStringArray(summaryGoals?.goals));

  // AI-only: do not fallback to regex sentence goals

  let deliverablesArr = uniq(toStringArray(deliverables?.deliverables));

  // AI-only: do not fallback to regex/anchor deliverables

  let tasksArr = uniq(toStringArray(tasks?.tasks));

  // AI-only: do not fallback to regex tasks

  let techStack = uniq(toStringArray(tech?.techStack));

  // AI-only: do not fallback to keyword detection

  let teamArr = normalizeTeam(team?.team);

  // AI-only: do not fallback to participants or name-role lines

  let summary = summaryGoals?.summary || "Not mentioned";

  let timelineValue = timeline?.timeline || "Not mentioned";

  let milestones = uniq(toStringArray(timeline?.milestones));

  // AI-only: do not derive milestones from transcript

  // AI-only: do not infer goal sentence

  let budgetValue = budget?.budget || "Not mentioned";

  // AI-only: do not infer timeline from milestones

  const risksArr = uniq(toStringArray(risks?.risks));

  const missingInfo = uniq(toStringArray(missing?.missingInformation));

  const result = {
    clientName,
    primaryContact,
    contactEmail,
    summary,
    goals,
    deliverables: deliverablesArr,
    timeline: timelineValue,
    milestones,
    budget: budgetValue,
    techStack,
    requirements: uniq(toStringArray(tech?.requirements)),
    tasks: tasksArr,
    team: teamArr,
    risks: risksArr,
    missingInformation: missingInfo
  };

  console.log("FINAL EXTRACTION RESULT:", result);

  return result;
}
