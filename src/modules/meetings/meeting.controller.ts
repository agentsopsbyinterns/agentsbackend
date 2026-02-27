import { prisma } from '../../prisma/client';
import { FastifyReply, FastifyRequest } from 'fastify';
import { unauthorized } from '../../common/errors/api-error';
import { getPagination } from '../../common/utils/pagination';
import { createMeetingSchema, rescheduleSchema, reviewSchema } from './meeting.schema';
import { createMeeting, deleteMeeting, getMeeting, inviteBot, listMeetings, meetingInsights, meetingTimeline, meetingTranscript, rescheduleMeeting, updateActionItem, createReview } from './meeting.service';

export const MeetingController = {
  create: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const parsed = createMeetingSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Validation failed' });
    try {
      console.log('[meetings] controller: create entry', { orgId: request.user.organizationId });
      const m = await createMeeting(request.user.organizationId, parsed.data);
      console.log('[meetings] controller: create success', { meetingId: (m as any)?.id });
      return reply.send(m);
    } catch (err: any) {
      console.error('[meetings] controller: create failed', { error: err?.message, stack: err?.stack });
      return reply.status(500).send({
        error: 'Google Calendar event creation failed',
        message: err?.message,
        code: 'GOOGLE_EVENT_CREATE_FAILED'
      });
    }
  },
  list: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const { skip, take, page, pageSize } = getPagination(request.query as any);
    const { items, total } = await listMeetings(request.user.organizationId, skip, take);
    return reply.send({ page, pageSize, total, items });
  },
  get: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const id = (request.params as any).id;
    const m = await getMeeting(request.user.organizationId, id);
    if (!m) return reply.status(404).send({ error: 'Not found' });
    return reply.send(m);
  },
  reschedule: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const id = (request.params as any).id;
    const parsed = rescheduleSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Validation failed' });
    const m = await rescheduleMeeting(request.user.organizationId, id, parsed.data);
    return reply.send(m);
  },
  inviteBot: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const id = (request.params as any).id;
    const m = await inviteBot(request.user.organizationId, id);
    return reply.send(m);
  },
  timeline: async (request: FastifyRequest, reply: FastifyReply) => {
    const id = (request.params as any).id;
    const t = await meetingTimeline(id);
    return reply.send(t);
  },
  transcript: async (request: FastifyRequest, reply: FastifyReply) => {
    const id = (request.params as any).id;
    const t = await meetingTranscript(id);
    return reply.send(t);
  },
  insights: async (_request: FastifyRequest, reply: FastifyReply) => {
    const id = (_request.params as any).id;
    const data = await meetingInsights(id);
    return reply.send(data);
  },
  review: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const id = (request.params as any).id;
    const existing = await getMeeting(request.user.organizationId, id);
    if (!existing) return reply.status(404).send({ error: 'Not found' });
    const parsed = reviewSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Validation failed' });
    const item = await createReview(id, parsed.data);
    return reply.send(item);
  },
  remove: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const id = (request.params as any).id;
    const m = await deleteMeeting(request.user.organizationId, id);
    return reply.send(m);
  },
  updateActionItem: async (request: FastifyRequest, reply: FastifyReply) => {
    const id = (request.params as any).actionId;
    const body = request.body as any;
    const item = await updateActionItem(id, body.text, body.assignee, body.dueDate);
    return reply.send(item);
  }
};
