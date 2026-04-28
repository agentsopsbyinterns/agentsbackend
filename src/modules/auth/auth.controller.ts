import { FastifyReply, FastifyRequest } from 'fastify';
import { env, isProd } from '../../config/env.js';
import { forgotPassword, login, me, refresh, resetPassword, signup, logout, verifyOTP } from './auth.service.js';
import { forgotPasswordSchema, loginSchema, resetPasswordSchema, signupSchema, logoutSchema, verifyOTPSchema } from './auth.schema.js';
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
      return reply.send({ user: result.user, message: result.message });
    } catch (err: any) {
      console.error('Signup error:', err);
      return reply.status(err.statusCode || 500).send({ error: err.message || 'Signup failed' });
    }
  },
  verifyOTP: async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as any;
    const parsed = verifyOTPSchema.safeParse(body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    try {
      const result = await verifyOTP(parsed.data.email, parsed.data.otp);
      setRefreshCookie(reply, result.refreshCookieValue);
      return reply.send({ 
        user: result.user, 
        accessToken: result.accessToken,
        message: 'Email verified successfully' 
      });
    } catch (err: any) {
      console.error('OTP verification error:', err);
      return reply.status(err.statusCode || 400).send({ error: err.message || 'Verification failed' });
    }
  },
  login: async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as any;
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    try {
      const result = await login({
        ...parsed.data,
        projectId: body.projectId,
        token: body.token
      });
      setRefreshCookie(reply, result.refreshCookieValue);
      return reply.send({ user: result.user, accessToken: result.accessToken });
    } catch (err: any) {
      console.error('Login error:', err);
      return reply.status(err.statusCode || 401).send({ error: err.message || 'Login failed' });
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
    if (!cookie) return reply.send({ accessToken: null });
    try {
      const result = await refresh(cookie);
      setRefreshCookie(reply, result.newRefresh);
      return reply.send({ accessToken: result.accessToken });
    } catch (err: any) {
      if (err.status === 401) {
        clearRefreshCookie(reply);
        return reply.send({ accessToken: null });
      }
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
