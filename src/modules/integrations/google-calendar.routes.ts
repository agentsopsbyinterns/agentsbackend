import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authMiddleware } from '../../common/middleware/auth.middleware';
import { exchangeCodeForTokens, getAuthUrl, storeTokens, getCalendars, getUpcomingEvents, createEvent, getConnectedAccount } from './google-calendar.service';
import { env } from '../../config/env';

export async function googleCalendarRoutes(app: FastifyInstance) {
  app.get('/integrations/google-calendar/initiate', { preHandler: [authMiddleware] }, async (req, reply) => {
    const orgId = req.user!.organizationId;
    const url = await getAuthUrl(orgId);
    return reply.send({ url });
  });

  app.get('/integrations/google-calendar/callback', async (request: FastifyRequest, reply: FastifyReply) => {
    const code = (request.query as any)?.code;
    const stateOrg = (request.query as any)?.state;
    const orgId =
      (stateOrg as string) ||
      (request.user?.organizationId as string) ||
      (request as any)?.organizationId ||
      (request.headers as any)['x-org-id'];
    if (!code) return reply.status(400).send({ error: 'Missing code' });
    if (!orgId) return reply.status(400).send({ error: 'Missing organization context' });
    const tokens = await exchangeCodeForTokens(code);
    await storeTokens(orgId, tokens);
    const redirect = `${env.APP_URL}/settings/integrations?google=connected`;
    return reply.redirect(redirect);
  });

  app.get('/integrations/google-calendar/calendars', { preHandler: [authMiddleware] }, async (request, reply) => {
    const orgId = request.user!.organizationId;
    const items = await getCalendars(orgId);
    return reply.send({ items });
  });

  app.get('/integrations/google-calendar/events', { preHandler: [authMiddleware] }, async (request, reply) => {
    const orgId = request.user!.organizationId;
    const calendarId = (request.query as any)?.calendarId;
    const maxResults = Number((request.query as any)?.maxResults ?? 10);
    if (!calendarId) return reply.status(400).send({ error: 'Missing calendarId' });
    const items = await getUpcomingEvents(orgId, calendarId, maxResults);
    return reply.send({ items });
  });

  app.post('/integrations/google-calendar/events', { preHandler: [authMiddleware] }, async (request, reply) => {
    const orgId = request.user!.organizationId;
    const { calendarId, event } = request.body as any;
    if (!calendarId || !event) return reply.status(400).send({ error: 'Missing calendarId or event body' });
    const created = await createEvent(orgId, calendarId, event);
    return reply.send(created);
  });

  app.get('/integrations/google-calendar/account', { preHandler: [authMiddleware] }, async (request, reply) => {
    const orgId = request.user!.organizationId;
    const acc = await getConnectedAccount(orgId);
    return reply.send(acc);
  });

  app.delete('/integrations/google-calendar/account', { preHandler: [authMiddleware] }, async (request, reply) => {
    const orgId = request.user!.organizationId;
    const { disconnectGoogle } = await import('./google-calendar.service.js');
    const res = await disconnectGoogle(orgId);
    return reply.send(res);
  });
}
