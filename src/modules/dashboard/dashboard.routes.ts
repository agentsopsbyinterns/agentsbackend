import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../common/middleware/auth.middleware';
import { DashboardController } from './dashboard.controller';

export async function dashboardRoutes(app: FastifyInstance) {
  app.get('/dashboard', { preHandler: [authMiddleware] }, DashboardController.get);
}
