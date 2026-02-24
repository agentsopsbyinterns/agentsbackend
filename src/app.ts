import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { env } from './config/env';
import { ApiError } from './common/errors/api-error';
import { registerSwagger } from './docs/swagger';
import { authRoutes } from './modules/auth/auth.routes';
import { orgRoutes } from './modules/organizations/org.routes';
import { meetingRoutes } from './modules/meetings/meeting.routes';
import { projectRoutes } from './modules/projects/project.routes';
import { chatRoutes } from './modules/chat/chat.routes';
import { integrationRoutes } from './modules/integrations/integration.routes';
import { webhookRoutes } from './modules/webhooks/webhook.routes';
import { dashboardRoutes } from './modules/dashboard/dashboard.routes';
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { idempotencyMiddleware } from './common/middleware/idempotency.middleware';

export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(cookie, { secret: undefined, hook: 'onRequest' });
  await app.register(rateLimit, { max: env.RATE_LIMIT_MAX, timeWindow: env.RATE_LIMIT_TIME_WINDOW });
  await registerSwagger(app);

  app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof ApiError) {
      reply.status(error.statusCode).send({ error: error.message, details: error.details });
      return;
    }
    request.log.error(error);
    reply.status(500).send({ error: 'Internal server error' });
  });

  const idem = idempotencyMiddleware();
  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    req.headers['x-org-id'] = req.user?.organizationId;
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      await idem(req, reply);
    }
  });

  await app.register(authRoutes);
  await app.register(orgRoutes);
  await app.register(meetingRoutes);
  await app.register(projectRoutes);
  await app.register(chatRoutes);
  await app.register(integrationRoutes);
  await app.register(webhookRoutes);
  await app.register(dashboardRoutes);

  app.get('/health', async () => ({ ok: true, env: env.NODE_ENV }));

  return app;
}
