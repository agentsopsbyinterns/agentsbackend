
import { FastifyInstance } from 'fastify';
import { MembersController } from './members.controller';
import { authMiddleware } from '../../common/middleware/auth.middleware';
import { requireProjectRole } from '../../common/middleware/rbac.middleware';

export async function membersRoutes(app: FastifyInstance) {
  app.get(
    '/projects/:projectId/members',
    { preHandler: [authMiddleware, requireProjectRole(['OWNER', 'CONTRIBUTOR', 'VIEWER'])] },
    MembersController.getMembers
  );
  app.post(
    '/projects/:projectId/members',
    { preHandler: [authMiddleware, requireProjectRole(['OWNER', 'CONTRIBUTOR'])] },
    MembersController.inviteMember
  );
  app.patch(
    '/projects/:projectId/members/:memberId',
    { preHandler: [authMiddleware, requireProjectRole(['OWNER'])] },
    MembersController.updateMemberRole
  );
  app.delete(
    '/projects/:projectId/members/:memberId',
    { preHandler: [authMiddleware, requireProjectRole(['OWNER'])] },
    MembersController.removeMember
  );
  app.get(
    '/accept-invite',
    MembersController.acceptProjectInvite
  );
}
