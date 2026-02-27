import { prisma } from '../../prisma/client';
import { CreateMeetingInput, RescheduleInput, ReviewInput } from './meeting.schema';
import { audit } from '../../common/utils/audit';
import { createEvent, getStoredTokens } from '../integrations/google-calendar.service';

export async function createMeeting(orgId: string, input: CreateMeetingInput) {
  console.log('[meetings] createMeeting: entry', { orgId, input });
  console.log('[meetings] createMeeting: before db save');
  const meeting = await (prisma as any).meeting.create({
    data: {
      organizationId: orgId,
      title: input.title,
      agenda: input.agenda || null,
      scheduledTime: input.scheduledTime,
      meetingLink: input.meetingLink || null
    }
  });
  console.log('[meetings] createMeeting: after db save', { meetingId: meeting.id });
  await audit(orgId, 'meeting.create', undefined, { meetingId: meeting.id });
  try {
    console.log('[meetings] createMeeting: before google event creation');
    const tokens = await getStoredTokens(orgId);
    if (!tokens || (!tokens.access_token && !tokens.refresh_token)) {
      console.error('[meetings] google: tokens missing', { orgId });
      throw new Error('Google Calendar not connected or tokens missing');
    }
    const start = new Date(input.scheduledTime);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const timeZone = (process.env.TIMEZONE as string) || 'UTC';
    const payload: any = {
      summary: input.title,
      description: input.agenda || undefined,
      start: { dateTime: start.toISOString(), timeZone },
      end: { dateTime: end.toISOString(), timeZone },
      conferenceData: {
        createRequest: {
          requestId: `mtg-${meeting.id}`
        }
      }
    };
    const ev = await createEvent(orgId, 'primary', payload);
    const hangout = (ev as any)?.hangoutLink || (ev as any)?.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === 'video')?.uri;
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
    console.error('[meetings] google: event creation failed', { meetingId: meeting.id, error: err?.message, stack: err?.stack });
    throw err;
  }
}

export async function listMeetings(orgId: string, skip: number, take: number) {
  const [items, total] = await Promise.all([
    (prisma as any).meeting.findMany({ where: { organizationId: orgId, deletedAt: null }, orderBy: { scheduledTime: 'desc' }, skip, take }),
    (prisma as any).meeting.count({ where: { organizationId: orgId, deletedAt: null } })
  ]);
  return { items, total };
}

export async function getMeeting(orgId: string, id: string) {
  return (prisma as any).meeting.findFirst({
    where: { id, organizationId: orgId, deletedAt: null }
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
