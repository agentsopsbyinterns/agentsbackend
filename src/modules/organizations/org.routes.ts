import { FastifyInstance } from 'fastify';
import { OrgController } from './org.controller';
import { authMiddleware } from '../../common/middleware/auth.middleware';
import { rbacMiddleware } from '../../common/middleware/rbac.middleware';

export async function orgRoutes(app: FastifyInstance) {
  app.post('/organizations', { preHandler: [authMiddleware, rbacMiddleware(['ADMIN'])] }, OrgController.create);
  app.post('/organizations/:id/invites', { preHandler: [authMiddleware, rbacMiddleware(['ADMIN'])] }, OrgController.invite);
  app.post('/invitations/invite', { preHandler: [authMiddleware, rbacMiddleware(['ADMIN'])] }, OrgController.inviteAlias);
  app.get('/invitations/accept', OrgController.acceptInvite);
}
