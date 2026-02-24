import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../common/middleware/auth.middleware';
import { ProjectController } from './project.controller';

export async function projectRoutes(app: FastifyInstance) {
  app.get('/projects', { preHandler: [authMiddleware] }, ProjectController.list);
  app.get('/projects/:id', { preHandler: [authMiddleware] }, ProjectController.get);
  app.get('/projects/:id/tasks', { preHandler: [authMiddleware] }, ProjectController.tasks);
  app.get('/projects/:id/metrics', { preHandler: [authMiddleware] }, ProjectController.metrics);
}
