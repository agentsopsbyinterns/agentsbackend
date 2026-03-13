import { prisma } from '../../prisma/client';
import { FastifyReply, FastifyRequest } from 'fastify';
import { unauthorized } from '../../common/errors/api-error';
import { getPagination } from '../../common/utils/pagination';
import { createMeetingSchema, rescheduleSchema, reviewSchema } from './meeting.schema';
import { createMeeting, deleteMeeting, getMeeting, inviteBot, listMeetings, meetingInsights, meetingTimeline, meetingTranscript, rescheduleMeeting, updateActionItem, createReview, saveRecordingAndExtract } from './meeting.service';
import { cleanTranscript, extractMeetingData } from '../../services/ai.service';
import { z } from 'zod';

export const MeetingController = {
  create: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const parsed = createMeetingSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Validation failed' });
    try {
      console.log('[meetings] controller: create entry', { orgId: request.user.organizationId });
      const m = await createMeeting(request.user.organizationId, parsed.data, request.user.email);
      console.log('[meetings] controller: create success', { meetingId: (m as any)?.id });
      return reply.send(m);
    } catch (err: any) {
      console.error('[meetings] controller: create failed', { error: err?.message, stack: err?.stack });
      // Best-effort fallback: try to persist a minimal meeting instead of failing the request
      try {
        const body = parsed.success ? parsed.data : (request.body as any);
        const scheduled = body?.scheduledTime ? new Date(body.scheduledTime) : new Date();
        const attendees = Array.isArray(body?.attendees) ? body.attendees : [];
        const minimal = await (prisma as any).meeting.create({
          data: {
            organizationId: request.user.organizationId,
            title: String(body?.title || 'Untitled Meeting'),
            agenda: body?.agenda || null,
            projectId: body?.projectId || null,
            scheduledTime: scheduled,
            meetingLink: body?.meetingLink || null,
            attendees: {
              create: attendees.map((email: string) => ({
                email,
                name: email.split('@')[0],
              }))
            }
          }
        });
        console.warn('[meetings] controller: returned minimal meeting due to upstream error');
        return reply.code(201).send(minimal);
      } catch (fallbackErr: any) {
        const msg = String(err?.message || '');
        if (msg.includes('Google Calendar not connected') || msg.includes('tokens missing')) {
          return reply.status(400).send({
            error: 'Google Calendar not connected',
            message: 'Please connect Google Calendar for this workspace',
            code: 'GOOGLE_NOT_CONNECTED'
          });
        }
        return reply.status(500).send({
          error: 'Meeting creation failed',
          message: fallbackErr?.message || err?.message,
          code: 'MEETING_CREATE_FAILED'
        });
      }
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
  tasks: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const id = (request.params as any).id;
    const items = await (prisma as any).projectTask.findMany({
      where: { meetingId: id },
      orderBy: { dueDate: 'asc' }
    });
    return reply.send({ items });
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
  manualTranscript: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const id = (request.params as any).id;
    const bodySchema = z.object({ transcript: z.string().min(1) });
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Validation failed' });
    const meeting = await (prisma as any).meeting.findFirst({ where: { id, organizationId: request.user.organizationId, deletedAt: null } });
    if (!meeting) return reply.status(404).send({ error: 'Not found' });
    const raw = parsed.data.transcript;
    const cleaned = cleanTranscript(raw);
    const extraction = await extractMeetingData(cleaned);

    console.log("===== EXTRACTION DEBUG =====");
    console.log("Full Extraction:", JSON.stringify(extraction, null, 2));
    console.log("============================");

    const emailMatch = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    
    // Ensure nested objects exist to avoid crashes
    const client_info = extraction.client_information || {};
    const timeline = extraction.timeline || {};
    const tech_stack = extraction.technical_stack || {};

    await (prisma as any).meeting.update({ 
      where: { id }, 
      data: { 
        rawTranscript: raw, 
        extractionJson: {
          client_information: {
            client_name: client_info.client_name || 'Not mentioned',
            primary_contact: client_info.primary_contact || 'Not mentioned',
            contact_email: client_info.contact_email || (emailMatch ? emailMatch[0] : 'Not mentioned')
          },
          project_summary: {
            project_name: 'Not mentioned',
            project_goal: Array.isArray(extraction.project_goals) && extraction.project_goals.length ? extraction.project_goals.join('\n') : 'Not mentioned',
            project_description: extraction.project_summary || 'Not mentioned'
          },
          timeline: {
            overall_timeline: timeline.overall_timeline || 'Not mentioned',
            milestones: Array.isArray(extraction.milestones) ? extraction.milestones : []
          },
          budget: extraction.budget || 'Not mentioned',
          technical_stack: {
            backend: Array.isArray(tech_stack.backend) ? tech_stack.backend : [],
            frontend: Array.isArray(tech_stack.frontend) ? tech_stack.frontend : [],
            mobile: Array.isArray(tech_stack.mobile) ? tech_stack.mobile : [],
            database: Array.isArray(tech_stack.database) ? tech_stack.database : [],
            caching: Array.isArray(tech_stack.caching) ? tech_stack.caching : [],
            analytics: Array.isArray(tech_stack.analytics) ? tech_stack.analytics : [],
            infrastructure: Array.isArray(tech_stack.infrastructure) ? tech_stack.infrastructure : [],
            containers: Array.isArray(tech_stack.containers) ? tech_stack.containers : [],
            cloud_providers: Array.isArray(tech_stack.cloud_providers) ? tech_stack.cloud_providers : [],
            languages: Array.isArray(tech_stack.languages) ? tech_stack.languages : []
          },
          deliverables: Array.isArray(extraction.deliverables) ? extraction.deliverables : [],
          tasks: (Array.isArray(extraction.milestones) ? extraction.milestones : []).map((m: any) => ({
            title: String(m?.task || '').trim() || 'Not mentioned',
            assignee: String(m?.owner || '').trim() || 'Not mentioned',
            deadline: String(m?.deadline || '').trim() || 'Not mentioned'
          })),
          team_roles: (Array.isArray(extraction.suggested_team) ? extraction.suggested_team : []).map((m: any) =>
            typeof m === 'string'
              ? ({ name: String(m).trim() || 'Not mentioned', role: 'Not mentioned' })
              : ({ name: String(m?.name || m?.member || '').trim() || 'Not mentioned', role: String(m?.role || '').trim() || 'Not mentioned' })
          ),
          risks: Array.isArray(extraction.risks) ? extraction.risks : [],
          missing_information: Array.isArray(extraction.missing_information) ? extraction.missing_information : []
        }, 
        transcriptStatus: 'completed' 
      } 
    });
    return reply.send(extraction);
  },
  uploadRecording: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const id = (request.params as any).id;
    const contentType = (request.headers['content-type'] || '').toLowerCase();
    if (contentType.startsWith('multipart/form-data')) {
      if (!(request as any).file || typeof (request as any).file !== 'function') {
        return reply.status(400).send({ error: 'Multipart not supported. Use base64 JSON.', code: 'MULTIPART_NOT_SUPPORTED' });
      }
      const mp = await (request as any).file();
      const buf = await mp.toBuffer();
      const filename = mp.filename || 'recording';
      const result = await saveRecordingAndExtract(request.user.organizationId, id, filename, buf);
      if (!result) return reply.status(404).send({ error: 'Not found' });
      return reply.send(result);
    } else {
      const bodySchema = z.object({ filename: z.string().default('recording'), base64: z.string().min(1) });
      const parsed = bodySchema.safeParse(request.body);
      if (!parsed.success) return reply.status(400).send({ error: 'Validation failed' });
      const buf = Buffer.from(parsed.data.base64, 'base64');
      const result = await saveRecordingAndExtract(request.user.organizationId, id, parsed.data.filename, buf);
      if (!result) return reply.status(404).send({ error: 'Not found' });
      return reply.send(result);
    }
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
