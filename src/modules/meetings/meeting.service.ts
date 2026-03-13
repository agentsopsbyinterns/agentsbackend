import { prisma } from '../../prisma/client';
import { CreateMeetingInput, RescheduleInput, ReviewInput } from './meeting.schema';
import { audit } from '../../common/utils/audit';
import { createEvent, getStoredTokens } from '../integrations/google-calendar.service';
import { sendMail } from '../../common/utils/mailer';
// Legacy extraction removed in favor of Gemini-only pipeline
import fs from 'fs/promises';
import path from 'path';

export async function createMeeting(orgId: string, input: CreateMeetingInput, creatorEmail?: string) {
  console.log('[meetings] createMeeting: entry', { orgId, input });
  console.log('[meetings] createMeeting: before db save');
  
  const attendeeEmails = input.attendees || [];
  
  const meeting = await (prisma as any).meeting.create({
    data: {
      organizationId: orgId,
      title: input.title,
      agenda: input.agenda || null,
      projectId: input.projectId || null,
      scheduledTime: input.scheduledTime,
      meetingLink: input.meetingLink || null,
      attendees: {
        create: attendeeEmails.map((email: string) => ({
          email,
          name: email.split('@')[0], // Fallback name
        }))
      }
    },
    include: {
      attendees: true
    }
  });
  
  console.log('[meetings] createMeeting: after db save', { meetingId: meeting.id });
  await audit(orgId, 'meeting.create', undefined, { meetingId: meeting.id });

  // Send email notifications to all attendees
  for (const email of attendeeEmails) {
    try {
      await sendMail({
        to: email,
        subject: `Meeting Invitation: ${input.title}`,
        html: `
          <h1>Meeting Invitation</h1>
          <p>You have been invited to a meeting: <strong>${input.title}</strong></p>
          <p><strong>Time:</strong> ${new Date(input.scheduledTime).toLocaleString()}</p>
          ${input.agenda ? `<p><strong>Agenda:</strong> ${input.agenda}</p>` : ''}
          ${input.meetingLink ? `<p><strong>Link:</strong> <a href="${input.meetingLink}">${input.meetingLink}</a></p>` : ''}
          <p>See you there!</p>
        `
      });
      console.log(`[meetings] Notification sent to ${email}`);
    } catch (mailErr: any) {
      console.error(`[meetings] Failed to send notification to ${email}`, mailErr.message);
    }
  }

  try {
    console.log('[meetings] createMeeting: before google event creation');
    const tokens = await getStoredTokens(orgId);
    if (!tokens || (!tokens.access_token && !tokens.refresh_token)) {
      console.warn('[meetings] google: tokens missing - proceeding without Google Calendar event', { orgId });
      return meeting;
    }
    const start = new Date(input.scheduledTime);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const timeZone = (process.env.TIMEZONE as string) || 'UTC';
    const payload: any = {
      summary: input.title,
      description: input.agenda || undefined,
      start: { dateTime: start.toISOString(), timeZone },
      end: { dateTime: end.toISOString(), timeZone },
      attendees: attendeeEmails.map((email: string) => ({ email })),
      conferenceData: {
        createRequest: {
          requestId: `mtg-${meeting.id}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' }
        }
      }
    };
    const ev = await createEvent(orgId, 'primary', payload);
    const hangout = (ev as any)?.hangoutLink || (ev as any)?.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === 'video')?.uri || (ev as any)?.htmlLink || null;
    const updated = await (prisma as any).meeting.update({
      where: { id: meeting.id },
      data: { meetingLink: hangout || meeting.meetingLink }
    });
    await audit(orgId, 'meeting.google_event_created', undefined, {
      meetingId: meeting.id,
      googleEventId: (ev as any)?.id,
      calendarId: 'primary',
      hangoutLink: hangout || null
    });
    console.log('[meetings] createMeeting: after google event creation', { meetingId: meeting.id, googleEventId: (ev as any)?.id });
    return updated;
  } catch (err: any) {
    console.error('[meetings] google: event creation failed - proceeding without Google event', { meetingId: meeting.id, error: err?.message });
    return meeting;
  }
}

export async function listMeetings(orgId: string, skip: number, take: number, projectId?: string | null) {
  const where: Record<string, any> = { organizationId: orgId, deletedAt: null };
  if (projectId) where.projectId = projectId;
  const [items, total] = await Promise.all([
    (prisma as any).meeting.findMany({
      where,
      orderBy: { scheduledTime: 'desc' },
      skip,
      take,
      include: { project: { select: { id: true, name: true, clientName: true, client: true } } }
    }),
    (prisma as any).meeting.count({ where })
  ]);
  return { items, total };
}

export async function getMeeting(orgId: string, id: string) {
  return (prisma as any).meeting.findFirst({
    where: { id, organizationId: orgId, deletedAt: null },
    include: {
      attendees: true,
      project: { select: { id: true, name: true } },
    },
  });
}

export async function rescheduleMeeting(orgId: string, id: string, input: RescheduleInput) {
  const meeting = await (prisma as any).meeting.update({ where: { id }, data: { scheduledTime: input.scheduledTime } });
  await audit(orgId, 'meeting.reschedule', undefined, { meetingId: id });
  return meeting;
}

export async function inviteBot(orgId: string, id: string) {
  const meeting = await (prisma as any).meeting.update({ where: { id }, data: { botStatus: 'invited' } });
  await audit(orgId, 'meeting.invite_bot', undefined, { meetingId: id });
  return meeting;
}

export async function meetingTimeline(id: string) {
  return (prisma as any).transcriptSegment.findMany({ where: { meetingId: id }, orderBy: { timestamp: 'asc' } });
}

export async function meetingTranscript(id: string) {
  return (prisma as any).transcriptSegment.findMany({ where: { meetingId: id }, orderBy: { timestamp: 'asc' } });
}

export async function meetingInsights(id: string) {
  const count = await (prisma as any).transcriptSegment.count({ where: { meetingId: id } });
  return { segments: count };
}

export async function createReview(id: string, input: ReviewInput) {
  const due = input.dueDate ? new Date(input.dueDate) : null;
  return (prisma as any).actionItem.create({
    data: { meetingId: id, text: input.text, assignee: input.assignee || null, dueDate: due }
  });
}

export async function deleteMeeting(orgId: string, id: string) {
  const meeting = await (prisma as any).meeting.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit(orgId, 'meeting.delete', undefined, { meetingId: id });
  return meeting;
}

export async function updateActionItem(id: string, text: string, assignee?: string, dueDate?: string) {
  const data: any = { text };
  if (assignee !== undefined) data.assignee = assignee;
  if (dueDate) data.dueDate = new Date(dueDate);
  return (prisma as any).actionItem.update({ where: { id }, data });
}

export async function saveManualTranscript(orgId: string, meetingId: string, transcript: string) {
  const meeting = await (prisma as any).meeting.findFirst({ where: { id: meetingId, organizationId: orgId, deletedAt: null } });
  if (!meeting) return null;
  await (prisma as any).meeting.update({ where: { id: meetingId }, data: { rawTranscript: transcript, transcriptStatus: 'completed' } });
  await audit(orgId, 'meeting.manual_transcript_uploaded', undefined, { meetingId });
  return { success: true };
}

async function ensureDir(p: string) {
  try {
    await fs.mkdir(p, { recursive: true });
  } catch {}
}

export async function saveRecordingAndExtract(orgId: string, meetingId: string, filename: string, data: Buffer) {
  const meeting = await (prisma as any).meeting.findFirst({ where: { id: meetingId, organizationId: orgId, deletedAt: null } });
  if (!meeting) return null;
  const baseDir = path.resolve(process.cwd(), 'src', 'data', 'recordings', meetingId);
  await ensureDir(baseDir);
  const filePath = path.join(baseDir, filename);
  await fs.writeFile(filePath, data);
  await audit(orgId, 'meeting.recording_uploaded', undefined, { meetingId, filePath });
  // Speech-to-text integration required to proceed
  await (prisma as any).meeting.update({ where: { id: meetingId }, data: { transcriptStatus: 'uploaded' } });
  return { filePath, error: 'speech_to_text_not_configured' };
}
