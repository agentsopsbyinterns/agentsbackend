import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../common/middleware/auth.middleware.js';
import { DashboardController } from './dashboard.controller.js';

export async function dashboardRoutes(app: FastifyInstance) {
  app.get('/dashboard', { preHandler: [authMiddleware] }, DashboardController.get);
}
