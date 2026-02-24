import Fastify, { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import { env, isProd } from './config/env.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { ApiError } from './common/errors/api-error.js';

export async function buildApp() {
  const app = Fastify({
    logger: true
  });

  const allowedOrigins = new Set([
    ...(
      (env.CORS_ORIGINS ??
        'https://frontend.leavecode.co.in,http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:5176,http://localhost:5177')
        .split(',')
        .map((s) => s.trim().replace(/\/+$/, ''))
        .filter(Boolean)
    )
  ]);

  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      cb(null, allowedOrigins.has(origin.replace(/\/+$/, '')));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  });

  await app.register(cookie, {
    secret: undefined,
    hook: 'onRequest'
  });

  app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof ApiError) {
      reply.status(error.statusCode).send({ error: error.message, details: error.details });
      return;
    }
    request.log.error(error);
    reply.status(500).send({ error: 'Internal server error' });
  });

  app.addHook('onRequest', async (req: FastifyRequest, _res: FastifyReply) => {
    req.headers['x-org-id'] = req.user?.organizationId;
  });

  await app.register(authRoutes);

  app.get('/health', async () => ({ ok: true, env: env.NODE_ENV }));

  app.get('/', async () => {
  return {
    status: 'API running 🚀',
    service: 'AgentOps Backend'
  };
});

  return app;
}
