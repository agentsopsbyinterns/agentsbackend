import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { env, isProd } from './config/env.js';
import { ApiError } from './common/errors/api-error.js';
import { registerSwagger } from './docs/swagger.js';
import * as authModule from './modules/auth/auth.routes.js';
import { orgRoutes } from './modules/organizations/org.routes.js';
import { meetingRoutes } from './modules/meetings/meeting.routes.js';
import { projectRoutes } from './modules/projects/project.routes.js';
import { membersRoutes } from './modules/members/members.routes.js';
import { chatRoutes } from './modules/chat/chat.routes.js';
import { integrationRoutes } from './modules/integrations/integration.routes.js';
import { googleCalendarRoutes } from './modules/integrations/google-calendar.routes.js';
import { webhookRoutes } from './modules/webhooks/webhook.routes.js';
import { dashboardRoutes } from './modules/dashboard/dashboard.routes.js';
import { taskRoutes } from './modules/tasks/tasks.routes.js';
import { searchRoutes } from './modules/search/search.routes.js';
import usersRoutes from './modules/users/users.routes.js';
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { idempotencyMiddleware } from './common/middleware/idempotency.middleware.js';

export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(cookie, { secret: undefined, hook: 'onRequest' });
  await app.register(rateLimit, { max: env.RATE_LIMIT_MAX, timeWindow: env.RATE_LIMIT_TIME_WINDOW });
  await registerSwagger(app);
  // Optional Express/Passport stack (only if deps exist)
  let fastifyExpress: any;
  let cors: any;
  let session: any;
  let passport: any;
  let setupPassport: any;
  try {
    const m1 = await import('@fastify/express');
    const m2 = await import('@fastify/cors');
    const m3 = await import('express-session');
    const m4 = await import('passport');
    fastifyExpress = (m1 as any).default;
    cors = (m2 as any).default;
    session = (m3 as any).default;
    passport = (m4 as any).default || (m4 as any);
    await app.register(cors, {
      origin: [
        'http://localhost:5173',
        'http://localhost:5174',
        'http://localhost:5175',
        'http://localhost:5176',
        'https://frontend.leavecode.co.in'
      ],
      credentials: true
    });
    await app.register(fastifyExpress);
    (app as any).use(
      session({
        secret: env.SESSION_SECRET || 'change_me_session',
        resave: false,
        saveUninitialized: false,
        name: 'sid',
        cookie: {
          httpOnly: true,
          sameSite: 'lax',
          secure: isProd,
          domain: env.COOKIE_DOMAIN
        }
      })
    );
    try {
      const pp = await import('./config/passport.config.js');
      setupPassport = (pp as any).setupPassport;
      if (setupPassport) setupPassport();
    } catch {}
    if (passport) {
      (app as any).use(passport.initialize());
      (app as any).use(passport.session());
    }
  } catch {
    // Optional stack not installed; continue without it
  }

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
  app.addHook('preHandler', async (req: FastifyRequest) => {
    const raw: any = req.raw as any;
    if (raw && raw.user && !req.user) {
      req.user = {
        id: raw.user.id,
        email: raw.user.email,
        organizationId: raw.user.organizationId,
        globalRole: raw.user.globalRole || 'TEAM_MEMBER'
      };
      req.organizationId = raw.user.organizationId;
    }
  });

  // Register core Fastify routes
  const authRoutes = (authModule as any).authRoutes;
  if (authRoutes) await app.register(authRoutes);
  await app.register(orgRoutes);
  await app.register(meetingRoutes);
  await app.register(projectRoutes);
  await app.register(membersRoutes);
  await app.register(chatRoutes);
  await app.register(integrationRoutes);
  await app.register(googleCalendarRoutes);
  await app.register(webhookRoutes);
  await app.register(dashboardRoutes);
  await app.register(taskRoutes);
  await app.register(searchRoutes);
  await app.register(usersRoutes);
  const { workspaceRoutes } = await import('./modules/workspace/workspace.routes.js');
  await app.register(workspaceRoutes);
  // If OAuth router is available (Express), mount it
  const oauthRouter = (authModule as any).oauthRouter;
  if (oauthRouter && (app as any).use) {
    (app as any).use('/auth', oauthRouter());
  }

  app.get('/health', async () => ({ ok: true, env: env.NODE_ENV }));
  app.get('/', async () => ({ ok: true }));
  app.get('/profile', async (req, reply) => {
    if (!req.user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
    return reply.send({ user: req.user });
  });

  app.get('/login', async (request, reply) => {
    const error = (request.query as any)?.error;
    return reply.send({
      message: 'Login Page',
      oauth_error: error || null
    });
  });

  app.get('/privacy', async (request, reply) => {
  return {
    message: 'Privacy Policy',
    app: 'AgentOps',
    note: 'We respect user privacy.'
  };
});

app.get('/terms', async (request, reply) => {
  return {
    message: 'Terms & Conditions',
    app: 'AgentOps',
    note: 'Use responsibly.'
  };
});

  // Temporary chat test endpoint
  app.post('/chat', async (request, reply) => {
    const body: any = request.body;
    return reply.send({
      success: true,
      message: 'Backend connected successfully ✅',
      userMessage: body?.message || null
    });
  });

  // Debug API to inspect ProjectMember records
  app.get('/debug/project-members', async (request, reply) => {
    const { prisma } = await import('./prisma/client.js');
    const members = await (prisma as any).projectMember.findMany({
      include: {
        user: { select: { email: true, name: true } },
        project: { select: { name: true } }
      }
    });
    return reply.send(members);
  });

  // Cleanup API to fix invalid ProjectMember roles
  app.post('/debug/cleanup-project-roles', async (request, reply) => {
    const { prisma } = await import('./prisma/client.js');
    
    // Using raw SQL for safety when enum values might be corrupted/empty
    const result = await (prisma as any).$executeRawUnsafe(`
      UPDATE ProjectMember 
      SET projectRole = 'CONTRIBUTOR' 
      WHERE projectRole = '' OR projectRole IS NULL
    `);
    
    return reply.send({ 
      success: true, 
      message: `Updated ${result} records with invalid roles to 'CONTRIBUTOR'.` 
    });
  });

  return app;
}
