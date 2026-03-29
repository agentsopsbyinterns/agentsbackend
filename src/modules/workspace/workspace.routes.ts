import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../common/middleware/auth.middleware.js';
import { WorkspaceController } from './workspace.controller.js';

export async function workspaceRoutes(app: FastifyInstance) {
  app.get('/workspace', { preHandler: [authMiddleware] }, WorkspaceController.get);
}
