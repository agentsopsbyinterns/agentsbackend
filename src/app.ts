import Fastify, { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import fastifyExpress from '@fastify/express';
import cors from '@fastify/cors';
import session from 'express-session';
import passport from 'passport';
import { env, isProd } from './config/env';
import { authRoutes, oauthRouter } from './modules/auth/auth.routes';
import { ApiError } from './common/errors/api-error';
import { setupPassport } from './config/passport.config';

export async function buildApp() {
  const app = Fastify({
    logger: true
  });

  await app.register(cors, {
  origin: [
    "http://localhost:5173","http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
    "http://localhost:5176",
    "https://frontend.leavecode.co.in"
  ],
  credentials: true
});
  
  await app.register(cookie, {
    secret: undefined,
    hook: 'onRequest'
  });

  await app.register(fastifyExpress);

  app.use(
    session({
      secret: env.SESSION_SECRET,
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

  setupPassport();
  app.use(passport.initialize());
  app.use(passport.session());

  app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof ApiError) {
      reply.status(error.statusCode).send({ error: error.message, details: error.details });
      return;
    }
    request.log.error(error);
    reply.status(500).send({ error: 'Internal server error' });
  });

  app.addHook('preHandler', async (req: FastifyRequest, _res: FastifyReply) => {
    const raw: any = req.raw as any;
    if (raw && raw.user && !req.user) {
      req.user = {
        id: raw.user.id,
        email: raw.user.email,
        organizationId: raw.user.organizationId,
        role: raw.user.role
      };
      req.organizationId = raw.user.organizationId;
    }
    req.headers['x-org-id'] = req.user?.organizationId;
  });

  await app.register(authRoutes);
  app.use('/auth', oauthRouter());

  app.get('/health', async () => ({ ok: true, env: env.NODE_ENV }));
  app.get('/', async () => ({ ok: true }));
  app.get('/profile', async (req, reply) => {
    if (!req.user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
    return reply.send({ user: req.user });
  });

app.get("/login", async (request, reply) => {
  const error = (request.query as any)?.error;

  return reply.send({
    message: "Login Page",
    oauth_error: error || null
  });
});

// ✅ TEMP CHAT API (testing ke liye)
app.post("/chat", async (request, reply) => {
  const body: any = request.body;

  return reply.send({
    success: true,
    message: "Backend connected successfully ✅",
    userMessage: body?.message || null
  });
});

  return app;
}
