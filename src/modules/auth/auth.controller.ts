import { FastifyReply, FastifyRequest } from 'fastify';
import { env, isProd } from '../../config/env';
import { forgotPassword, login, me, refresh, resetPassword, signup, logout } from './auth.service';
import { forgotPasswordSchema, loginSchema, resetPasswordSchema, signupSchema, logoutSchema } from './auth.schema';
import { unauthorized } from '../../common/errors/api-error';

function setRefreshCookie(reply: FastifyReply, value: string) {
  (reply as any).setCookie(env.REFRESH_COOKIE_NAME, value, {
    httpOnly: true,
    sameSite: isProd ? 'lax' : 'lax',
    secure: isProd,
    path: '/',
    domain: env.COOKIE_DOMAIN || undefined,
    maxAge: 60 * 60 * 24 * 7
  });
}

function clearRefreshCookie(reply: FastifyReply) {
  (reply as any).clearCookie(env.REFRESH_COOKIE_NAME, {
    path: '/',
    domain: env.COOKIE_DOMAIN || undefined
  });
}

export const AuthController = {
  signup: async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as any;
    const parsed = signupSchema.safeParse(body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    try {
      const result = await signup({
        ...parsed.data,
        organizationId: body.organizationId,
        projectId: body.projectId,
        token: body.token
      });
      setRefreshCookie(reply, result.refreshCookieValue);
      return reply.send({ user: result.user, accessToken: result.accessToken });
    } catch (err: any) {
      console.error('Signup error:', err);
      return reply.status(err.status || 500).send({ error: err.message || 'Signup failed' });
    }
  },
  login: async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    try {
      const result = await login(parsed.data);
      setRefreshCookie(reply, result.refreshCookieValue);
      return reply.send({ user: result.user, accessToken: result.accessToken });
    } catch (err: any) {
      return reply.status(503).send({ error: 'Database unavailable', code: 'DB_UNAVAILABLE' });
    }
  },
  logout: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const parsed = logoutSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    const provided = parsed.data.refreshToken;
    const cookie = (request as any).cookies?.[env.REFRESH_COOKIE_NAME];
    const tokenToRevoke = provided || cookie;
    await logout(request.user.id, tokenToRevoke);
    clearRefreshCookie(reply);
    return reply.send({ success: true });
  },
  refresh: async (request: FastifyRequest, reply: FastifyReply) => {
    const cookie = (request as any).cookies?.[env.REFRESH_COOKIE_NAME];
    if (!cookie) throw unauthorized('Missing refresh token');
    try {
      const result = await refresh(cookie);
      setRefreshCookie(reply, result.newRefresh);
      return reply.send({ accessToken: result.accessToken });
    } catch (err: any) {
      return reply.status(503).send({ error: 'Database unavailable', code: 'DB_UNAVAILABLE' });
    }
  },
  forgotPassword: async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = forgotPasswordSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    await forgotPassword(parsed.data);
    return reply.send({ success: true });
  },
  resetPassword: async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = resetPasswordSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    await resetPassword(parsed.data);
    return reply.send({ success: true });
  },
  me: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const data = await me(request.user.id);
    return reply.send(data);
  }
};
