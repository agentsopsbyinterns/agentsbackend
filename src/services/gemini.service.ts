import { env } from "../config/env";
import { getLLMProvider } from "./llm/provider";

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

export async function callGemini(prompt: string): Promise<string> {
  const provider = getLLMProvider();
  return await provider.generate(prompt);
}

function uniq(arr: string[]) {
  return Array.from(new Set(arr.map((s) => String(s).trim()).filter(Boolean)));
}

function deriveClientName(text: string) {
  const t = text.replace(/\*\*/g, ''); // strip markdown bold markers
  const patterns = [
    /client name\s*:\s*([A-Za-z0-9 .&'-]+)/i,
    /client\s*name\s*[:\-]\s*([A-Za-z0-9 .&'-]+)/i,
    /company name\s*is\s*([A-Za-z0-9 .&'-]+)/i,
    /our company name\s*is\s*([A-Za-z0-9 .&'-]+)/i,
    /project\s+(?:for|with)\s+([A-Za-z][A-Za-z0-9 .&'-]+)/i,
    /primary contact (?:person )?from\s+([A-Za-z][A-Za-z0-9 .&'-]+)/i
  ];

  for (const p of patterns) {
    const m = t.match(p);
    if (m) return m[1].trim().replace(/[.]+$/, "");
  }

  const m2 = t.match(/Client\s*\(([^)]+)\)/i);
  if (m2) return m2[1].trim();

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
  const gemEnabled = String(process.env.GEMINI_ENABLED || '').toLowerCase() === 'true';
  const dsEnabled = String(process.env.DEEPSEEK_ENABLED || '').toLowerCase() === 'true';
  const noLLM =
    (!gemEnabled || !process.env.GEMINI_API_KEY) &&
    (!dsEnabled || !process.env.DEEPSEEK_API_KEY);
  if (noLLM) {
    const text = transcript;
    const email = (text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [null])[0];
    const goals = uniq(extractGoalsRegex(text)).length
      ? uniq(extractGoalsRegex(text))
      : (() => {
          const m = text.match(/goal(?: is|:)?\s*to\s*([^\n\.]+)/i);
          return m ? [m[1].trim()] : [];
        })();
    const featureBlock = (() => {
      const s = text.match(/(the (?:mvp|system) should[\s\S]*?)(?:\n\n|$)/i);
      return s ? s[1] : '';
    })();
    const featureLines = featureBlock
      ? featureBlock.split(/\r?\n/).map((l) => l.replace(/^[\-\*\u2022]+/,'').trim()).filter(Boolean)
      : [];
    const deliverablesArr = uniq(
      extractDeliverablesRegex(text).concat(featureLines)
    );
    const tasksArr = uniq(
      extractTasksRegex(text).concat(featureLines.map(f => `Implement: ${f}`))
    );
    const milestones = uniq(deriveMilestones(text));
    const budgetValue = deriveBudget(text);
    const summary =
      (text.match(/project summary(?: is|:)?\s*(.+)/i)?.[1] || '').trim() ||
      'Not mentioned';
    const primaryContact =
      (text.match(/primary contact(?: is|:)?\s*([A-Za-z .'-]+)/i)?.[1] || '').trim() ||
      (text.match(/Client\s*\(([^)]+)\)/i)?.[1] || '').trim() ||
      'Not mentioned';

    const techWords = Array.from(
      new Set(
        (text.match(/\b(react|next\.js|node\.js|express|nestjs|typescript|javascript|python|django|flask|fastapi|java|spring|php|laravel|symfony|ruby|rails|go|golang|mysql|postgres|mongodb|prisma|sequelize|typeorm|redis|graphql|rest api|tailwind|mui|redux|vue|angular|aws|gcp|azure|docker|kubernetes)\b/gi) || [])
          .map((w) => w.replace(/\s+/g,' ').toLowerCase())
      )
    );
    // Parse RISKS and MISSING INFORMATION sections (bullets or lines)
    const sectionSlice = (label: string, untils: string[]) => {
      const up = text.toUpperCase();
      const start = up.indexOf(label.toUpperCase());
      if (start < 0) return '';
      const tail = text.slice(start + label.length);
      const re = new RegExp(`\\n\\s*(?:${untils.join('|')})\\b`, 'i');
      const m = tail.match(re);
      return m ? tail.slice(0, m.index || 0) : tail;
    };
    const extractBullets = (block: string) =>
      block
        .split(/\r?\n/)
        .map((l) => l.replace(/^[\s•*\-–]+/, '').trim())
        .filter((s) => !!s && !/^\d{1,2}:\d{2}/.test(s));
    const risksBlock = sectionSlice('RISKS IDENTIFIED', ['MISSING INFORMATION', 'END OF MEETING', 'SUGGESTED TEAM']);
    const missingBlock = sectionSlice('MISSING INFORMATION', ['END OF MEETING', 'SUGGESTED TEAM', 'RISKS IDENTIFIED']);
    const risksArr = uniq(extractBullets(risksBlock));
    const missingArr = uniq(extractBullets(missingBlock));

    // Parse SUGGESTED TEAM section; map role lines to { name, role }
    const teamBlock = sectionSlice('SUGGESTED TEAM', ['RISKS IDENTIFIED', 'MISSING INFORMATION', 'END OF MEETING']);
    const roleHint = /(Manager|Developer|Engineer|Architect|Designer|Lead|Analyst)/i;
    const teamLines = teamBlock
      .split(/\r?\n/)
      .map((l) => l.replace(/^[\s•*\-–]+/, '').trim())
      .filter(Boolean);
    const asRole = (line: string) => {
      const parts = line.split(/[:—-]/);
      return parts[0].trim();
    };
    const teamRoles = teamLines
      .filter((l) => roleHint.test(l))
      .map((l) => asRole(l))
      .filter(Boolean)
      .map((role) => ({ name: 'Not mentioned', role }));

    const result = {
      clientName: deriveClientName(text),
      primaryContact,
      contactEmail: email,
      summary,
      goals,
      deliverables: deliverablesArr,
      timeline: (text.match(/\btimeline(?: is|:)?\s*([^\n]+)/i)?.[1] || 'Not mentioned').trim(),
      milestones,
      budget: budgetValue,
      techStack: techWords,
      requirements: techWords,
      tasks: tasksArr,
      team: teamRoles,
      risks: risksArr,
      missingInformation: missingArr
    };
    console.warn('[gemini] Using heuristic extraction (no GEMINI_API_KEY found).');
    return result;
  }

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
  let requirements = uniq(toStringArray(tech?.requirements));

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

  let risksArr = uniq(toStringArray(risks?.risks));

  let missingInfo = uniq(toStringArray(missing?.missingInformation));

  // Heuristic fallback merge if AI returns weak/empty values
  const text = transcript;
  const hEmail = (text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [null])[0];
  const hGoals = uniq(extractGoalsRegex(text));
  const hDeliverables = uniq(extractDeliverablesRegex(text));
  const hTasks = uniq(extractTasksRegex(text));
  const hMilestones = uniq(deriveMilestones(text));
  const hBudget = deriveBudget(text);
  const hSummary =
    (text.match(/project summary(?: is|:)?\s*(.+)/i)?.[1] || "").trim() ||
    (summary || "").trim() ||
    "Not mentioned";
  const hPrimary =
    (text.match(/primary contact(?: is|:)?\s*([A-Za-z .'-]+)/i)?.[1] || "").trim() ||
    (text.match(/Client\s*\(([^)]+)\)/i)?.[1] || "").trim() ||
    primaryContact;
  const hClientName = deriveClientName(text);
  const hTimeline = (text.match(/\btimeline(?: is|:)?\s*([^\n]+)/i)?.[1] || timelineValue).trim() || "Not mentioned";

  if (!clientName || clientName === "Not mentioned") clientName = hClientName || clientName;
  if (!primaryContact || primaryContact === "Not mentioned") primaryContact = hPrimary || primaryContact;
  if (!contactEmail) contactEmail = hEmail;
  if (!summary || summary === "Not mentioned") summary = hSummary;
  if (!goals.length) goals = hGoals;
  if (!deliverablesArr.length) deliverablesArr = hDeliverables;
  if (!tasksArr.length) tasksArr = hTasks;
  if (!milestones.length) milestones = hMilestones;
  if (!timelineValue || timelineValue === "Not mentioned") timelineValue = hTimeline;
  if (!budgetValue || budgetValue === "Not mentioned") budgetValue = hBudget;
  const techGuess = Array.from(
    new Set(
      (text.match(/\b(react|next\.js|node\.js|express|nestjs|typescript|javascript|python|django|flask|fastapi|java|spring|php|laravel|symfony|ruby|rails|go|golang|mysql|postgres|mongodb|prisma|sequelize|typeorm|redis|graphql|rest api|tailwind|mui|redux|vue|angular|aws|gcp|azure|docker|kubernetes)\b/gi) || [])
        .map((w) => w.replace(/\s+/g, ' ').toLowerCase())
    )
  );
  if (!techStack.length) techStack = techGuess;
  if (!requirements.length) requirements = techGuess;
  // Fill risks/missing/team if empty from labeled sections
  const sectionSlice2 = (label: string, untils: string[]) => {
    const up = text.toUpperCase();
    const start = up.indexOf(label.toUpperCase());
    if (start < 0) return '';
    const tail = text.slice(start + label.length);
    const re = new RegExp(`\\n\\s*(?:${untils.join('|')})\\b`, 'i');
    const m = tail.match(re);
    return m ? tail.slice(0, m.index || 0) : tail;
  };
  const extractBullets2 = (block: string) =>
    block
      .split(/\r?\n/)
      .map((l) => l.replace(/^[\s•*\-–]+/, '').trim())
      .filter(Boolean);
  if (!risksArr.length) {
    const rb = sectionSlice2('RISKS IDENTIFIED', ['MISSING INFORMATION', 'END OF MEETING', 'SUGGESTED TEAM']);
    risksArr = uniq(extractBullets2(rb));
  }
  if (!missingInfo.length) {
    const mb = sectionSlice2('MISSING INFORMATION', ['END OF MEETING', 'SUGGESTED TEAM', 'RISKS IDENTIFIED']);
    missingInfo = uniq(extractBullets2(mb));
  }
  if (!teamArr.length) {
    const tb = sectionSlice2('SUGGESTED TEAM', ['RISKS IDENTIFIED', 'MISSING INFORMATION', 'END OF MEETING']);
    const roleHint2 = /(Manager|Developer|Engineer|Architect|Designer|Lead|Analyst)/i;
    const lines = tb.split(/\r?\n/).map((l) => l.replace(/^[\s•*\-–]+/, '').trim()).filter(Boolean);
    const asRole2 = (line: string) => {
      const parts = line.split(/[:—-]/);
      return parts[0].trim();
    };
    teamArr = lines
      .filter((l) => roleHint2.test(l))
      .map((l) => asRole2(l))
      .filter(Boolean)
      .map((role) => ({ name: 'Not mentioned', role }));
  }

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
    requirements,
    tasks: tasksArr,
    team: teamArr,
    risks: risksArr,
    missingInformation: missingInfo
  };

  console.log("FINAL EXTRACTION RESULT:", result);

  return result;
}
