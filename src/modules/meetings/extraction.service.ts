import { prisma } from '../../prisma/client';
import { extractWithOpenAI, StructuredOutput } from './ai.service';

type ExtractionResult = StructuredOutput;

function extractEmail(text: string) {
  const m = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return m ? m[0] : null;
}

function extractBudget(text: string) {
  const m = text.match(/\$\s?\d{1,3}(?:[,\d]{3})*(?:\.\d+)?/);
  return m ? m[0] : null;
}

function extractTimeline(text: string) {
  const dateRegex = /\b(\d{1,2})(st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\b/gi;
  const dates: Array<{ day: number; month: string; raw: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = dateRegex.exec(text)) !== null) {
    const day = parseInt(m[1], 10);
    const month = m[3];
    dates.push({ day, month, raw: `${day} ${month}` });
  }
  if (dates.length === 0) return null;
  const monthOrder: Record<string, number> = {
    January: 1, February: 2, March: 3, April: 4, May: 5, June: 6,
    July: 7, August: 8, September: 9, October: 10, November: 11, December: 12
  };
  dates.sort((a, b) => {
    const ma = monthOrder[a.month] || 0;
    const mb = monthOrder[b.month] || 0;
    if (ma !== mb) return ma - mb;
    return a.day - b.day;
  });
  const earliest = dates[0].raw;
  const latest = dates[dates.length - 1].raw;
  if (earliest === latest) return latest;
  return `Due between ${earliest} and ${latest}`;
}

function extractDeliverables(text: string) {
  const lines = text.split(/\r?\n/);
  const candidates: string[] = [];
  for (const line of lines) {
    const l = line.trim();
    if (!l) continue;
    if (/^-|\u2022|•/.test(l)) {
      candidates.push(l.replace(/^[-•\u2022]\s*/, '').trim());
    } else if (/we\s+(?:need|will|should)\b/i.test(l)) {
      candidates.push(l);
    }
  }
  // Also parse sentences with "task ... is to ..."
  const taskRegex = /\b(?:first|1st|second|2nd|third|3rd|last)\s+(?:one\s+is\s+to|task\s+is\s+to)\s+([^\.]+)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = taskRegex.exec(text)) !== null) {
    const phrase = m[1].trim();
    const clean = phrase.replace(/^(to\s+)/i, '').replace(/\s+and\s+$/i, '').trim();
    if (clean) candidates.push(clean);
  }
  // Also pick any sentences containing "task" with "is to"
  const genericTask = /task[s]?\s+is\s+to\s+([^\.]+)\b/gi;
  while ((m = genericTask.exec(text)) !== null) {
    const phrase = m[1].trim();
    const clean = phrase.replace(/^(to\s+)/i, '').trim();
    if (clean) candidates.push(clean);
  }
  return Array.from(new Set(candidates)).slice(0, 20);
}

function extractClientName(text: string) {
  const mInc = text.match(/\b([A-Z][A-Za-z0-9&\s]+?\b(?:Inc|LLC|Ltd|Corporation|Corp))\b/);
  if (mInc) return mInc[1];
  const mCompany = text.match(/\bfrom\s+([A-Z][A-Za-z0-9&\s]+)\b/i);
  if (mCompany) return mCompany[1].trim();
  return null;
}

function extractPrimaryContact(text: string) {
  const m = text.match(/\b(?:my\s+name\s+is|I'?m|I am)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/);
  if (m) return m[1];
  const m2 = text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b.*\bemail\b/i);
  if (m2) return m2[1];
  return null;
}

function extractSummary(text: string) {
  const sentences = text.split(/(?<=[.?!])\s+/);
  return sentences.slice(0, 3).join(' ');
}

function extractGoals(text: string) {
  const m = text.match(/(?:goals?|objective|aim)\s*(?:\:|-)?\s*(.+)/i);
  return m ? m[1] : null;
}

export async function runExtraction(meetingId: string, transcript: string): Promise<ExtractionResult> {
  const ai = await extractWithOpenAI(transcript);
  const result: ExtractionResult =
    ai || {
      clientInformation: {
        clientName: extractClientName(transcript) || '',
        primaryContact: extractPrimaryContact(transcript) || '',
        contactEmail: extractEmail(transcript) || ''
      },
      projectSummary: extractSummary(transcript) || '',
      projectGoals: extractGoals(transcript) ? [String(extractGoals(transcript))] : [],
      deliverables: extractDeliverables(transcript),
      timeline: {
        overallTimeline: extractTimeline(transcript) || '',
        milestones: []
      },
      budget: extractBudget(transcript) || '',
      technicalRequirements: [],
      tasks: []
    };
  await (prisma as any).meeting.update({
    where: { id: meetingId },
    data: { extractionJson: result }
  });
  return result;
}
