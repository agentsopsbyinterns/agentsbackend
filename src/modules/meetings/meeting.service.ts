import { prisma } from '../../prisma/client.js';
import { CreateMeetingInput, RescheduleInput, ReviewInput } from './meeting.schema.js';
import { audit } from '../../common/utils/audit.js';
import { createEvent, getStoredTokens } from '../integrations/google-calendar.service.js';
import { sendMail } from '../../common/utils/mailer.js';
// Legacy extraction removed in favor of Gemini-only pipeline
import fs from 'fs/promises';
import path from 'path';

export async function createMeeting(userId: string, input: CreateMeetingInput, creatorEmail?: string) {
  if (!input.projectId) {
    throw new Error('projectId required');
  }

  const project = await (prisma as any).project.findUnique({
    where: { id: input.projectId }
  });

  if (!project) {
    throw new Error('Project not found');
  }

  const member = await (prisma as any).projectMember.findFirst({
    where: {
      projectId: input.projectId,
      userId
    }
  });

  if (!member) {
    throw new Error('Not a project member');
  }

  console.log('CREATE MEETING:', {
    userId,
    projectId: input.projectId,
    orgFromProject: project.organizationId
  });
  console.log('[meetings] createMeeting: before db save');
  
  const attendeeEmails = Array.from(new Set(input.attendees || [])); // Remove duplicate emails from input
  
  const meeting = await prisma.meeting.create({
    data: {
      organizationId: project.organizationId,
      title: input.title,
      agenda: input.agenda || null,
      projectId: project.id,
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
  await audit(project.organizationId, 'meeting.create', undefined, { meetingId: meeting.id, projectId: project.id, userId });

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
    const tokens = await getStoredTokens(project.organizationId);
    if (!tokens || (!tokens.access_token && !tokens.refresh_token)) {
      console.warn('[meetings] google: tokens missing - proceeding without Google Calendar event', { organizationId: project.organizationId });
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
    const ev = await createEvent(project.organizationId, 'primary', payload);
    const hangout = (ev as any)?.hangoutLink || (ev as any)?.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === 'video')?.uri || (ev as any)?.htmlLink || null;
    const updated = await prisma.meeting.update({
      where: { id: meeting.id },
      data: { meetingLink: hangout || meeting.meetingLink }
    });
    await audit(project.organizationId, 'meeting.google_event_created', undefined, {
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

export async function listMeetings(
  userId: string,
  skip: number,
  take: number,
  projectId?: string | null,
  status?: string | null,
  startDate?: string | null,
  endDate?: string | null,
  search?: string | null
) {
  console.log('FETCH MEETINGS:', { userId, projectId });

  const where: Record<string, any> = {
    deletedAt: null,
    project: {
      members: {
        some: {
          userId
        }
      }
    }
  };

  if (projectId) where.projectId = projectId;
  if (status && status !== 'all') where.status = status;
  
  if (startDate || endDate) {
    where.scheduledTime = {};
    if (startDate) where.scheduledTime.gte = new Date(startDate);
    if (endDate) where.scheduledTime.lte = new Date(endDate);
  }

  if (search) {
    where.OR = [
      { title: { contains: search } },
      { agenda: { contains: search } }
    ];
  }

  console.log('Running query with:', where);

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

  console.log('Meetings found:', items.length);
  console.log('[meetings] listMeetings result', { userId, projectId, returned: items.length, total });
  return { items, total };
}

export async function getMeeting(userId: string, id: string) {
  return (prisma as any).meeting.findFirst({
    where: {
      id,
      deletedAt: null,
      project: {
        members: {
          some: {
            userId
          }
        }
      }
    },
    include: {
      attendees: true,
      project: { select: { id: true, name: true } },
    },
  });
}

export async function rescheduleMeeting(orgId: string, id: string, input: RescheduleInput) {
  const { date, time } = input;
  const scheduledTime = new Date(`${date}T${time}:00`);
  
  if (isNaN(scheduledTime.getTime())) {
    throw new Error('Invalid date or time');
  }

  const meeting = await (prisma as any).meeting.update({ 
    where: { id }, 
    data: { 
      scheduledTime,
      updatedAt: new Date()
    } 
  });
  
  await audit(orgId, 'meeting.reschedule', undefined, { meetingId: id, newTime: scheduledTime });
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
