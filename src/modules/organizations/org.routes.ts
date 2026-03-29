import { FastifyInstance } from 'fastify';
import { OrgController } from './org.controller.js';
import { authMiddleware } from '../../common/middleware/auth.middleware.js';
import { rbacMiddleware } from '../../common/middleware/rbac.middleware.js';

export async function orgRoutes(app: FastifyInstance) {
  app.post('/organizations', { preHandler: [authMiddleware, rbacMiddleware(['ADMIN'])] }, OrgController.create);
  app.post('/organizations/:id/invites', { preHandler: [authMiddleware, rbacMiddleware(['ADMIN'])] }, OrgController.invite);
  app.post('/invitations/invite', { preHandler: [authMiddleware, rbacMiddleware(['ADMIN'])] }, OrgController.inviteAlias);
  app.get('/invitations/accept', OrgController.acceptInvite);
}
