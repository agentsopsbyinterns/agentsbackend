import { FastifyInstance } from 'fastify';
import { AuthController } from './auth.controller';
import { authMiddleware } from '../../common/middleware/auth.middleware';
import passport from 'passport';
import express from 'express';
import { env } from '../../config/env';

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/signup', AuthController.signup);
  app.post('/auth/login', AuthController.login);
  app.post('/auth/logout', { preHandler: authMiddleware }, AuthController.logout);
  app.post('/auth/refresh', AuthController.refresh);
  app.post('/auth/forgot-password', AuthController.forgotPassword);
  app.post('/auth/reset-password', AuthController.resetPassword);
  app.get('/auth/me', { preHandler: authMiddleware }, AuthController.me);

  const router = express.Router();

  router.get(
    '/google',
    passport.authenticate('google', {
      scope: ['profile', 'email'],
      session: true
    })
  );

  router.get(
    '/google/callback',
    passport.authenticate('google', {
      failureRedirect: '/login?error=oauth_google',
      session: true
    }),
    (req, res) => {
      const format = (req.query as any)?.format;
      if (format === 'json') {
        return res.json({ user: (req as any).user });
      }
      return res.redirect(`${env.APP_URL}/profile`);
    }
  );

  router.get(
    '/facebook',
    passport.authenticate('facebook', {
      scope: ['email'],
      session: true
    })
  );

  router.get(
    '/facebook/callback',
    passport.authenticate('facebook', {
      failureRedirect: '/login?error=oauth_facebook',
      session: true
    }),
    (req, res) => {
      const format = (req.query as any)?.format;
      if (format === 'json') {
        return res.json({ user: (req as any).user });
      }
      return res.redirect(`${env.APP_URL}/profile`);
    }
  );

  // Do not mount here; export for app.ts to mount at top-level instance
}

export function oauthRouter() {
  const router = express.Router();
  router.get(
    '/google',
    passport.authenticate('google', {
      scope: ['profile', 'email'],
      session: true
    })
  );
  router.get(
    '/google/callback',
    passport.authenticate('google', {
      failureRedirect: '/login?error=oauth_google',
      session: true
    }),
    (req, res) => {
      const format = (req.query as any)?.format;
      if (format === 'json') {
        return res.json({ user: (req as any).user });
      }
      return res.redirect(`${env.APP_URL}/profile`);
    }
  );
  router.get(
    '/facebook',
    passport.authenticate('facebook', {
      scope: ['email'],
      session: true
    })
  );
  router.get(
    '/facebook/callback',
    passport.authenticate('facebook', {
      failureRedirect: '/login?error=oauth_facebook',
      session: true
    }),
    (req, res) => {
      const format = (req.query as any)?.format;
      if (format === 'json') {
        return res.json({ user: (req as any).user });
      }
      return res.redirect(`${env.APP_URL}/profile`);
    }
  );
  return router;
}
