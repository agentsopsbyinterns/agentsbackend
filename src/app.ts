import Fastify, { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import { env, isProd } from './config/env';
import { authRoutes } from './modules/auth/auth.routes';
import { ApiError } from './common/errors/api-error';

export async function buildApp() {
  const app = Fastify({
    logger: true
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

  return app;
}
