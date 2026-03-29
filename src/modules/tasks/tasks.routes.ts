import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../common/middleware/auth.middleware.js';
import { TaskController } from './tasks.controller.js';

export async function taskRoutes(app: FastifyInstance) {
  app.post('/api/tasks/bulk-create', { preHandler: [authMiddleware] }, TaskController.bulkCreate);
}
