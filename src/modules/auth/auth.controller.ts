import { FastifyReply, FastifyRequest } from 'fastify';
import { env, isProd } from '../../config/env.js';
import { forgotPassword, login, me, refresh, resetPassword, signup, logout } from './auth.service.js';
import { forgotPasswordSchema, loginSchema, resetPasswordSchema, signupSchema } from './auth.schema.js';
import { unauthorized } from '../../common/errors/api-error.js';

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
    const parsed = signupSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    const result = await signup(parsed.data);
    setRefreshCookie(reply, result.refreshCookieValue);
    return reply.send({ user: result.user, accessToken: result.accessToken });
  },
  login: async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    const result = await login(parsed.data);
    setRefreshCookie(reply, result.refreshCookieValue);
    return reply.send({ user: result.user, accessToken: result.accessToken });
  },
  logout: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const cookie = (request as any).cookies?.[env.REFRESH_COOKIE_NAME];
    await logout(request.user.id, cookie);
    clearRefreshCookie(reply);
    return reply.send({ success: true });
  },
  refresh: async (request: FastifyRequest, reply: FastifyReply) => {
    const cookie = (request as any).cookies?.[env.REFRESH_COOKIE_NAME];
    if (!cookie) throw unauthorized('Missing refresh token');
    const result = await refresh(cookie);
    setRefreshCookie(reply, result.newRefresh);
    return reply.send({ accessToken: result.accessToken });
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
