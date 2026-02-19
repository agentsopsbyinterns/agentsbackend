import { FastifyInstance } from 'fastify';
import { AuthController } from './auth.controller';
import { authMiddleware } from '../../common/middleware/auth.middleware';

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/signup', AuthController.signup);
  app.post('/auth/login', AuthController.login);
  app.post('/auth/logout', { preHandler: authMiddleware }, AuthController.logout);
  app.post('/auth/refresh', AuthController.refresh);
  app.post('/auth/forgot-password', AuthController.forgotPassword);
  app.post('/auth/reset-password', AuthController.resetPassword);
  app.get('/auth/me', { preHandler: authMiddleware }, AuthController.me);
}
