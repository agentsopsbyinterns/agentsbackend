
import { FastifyInstance } from 'fastify';
import { MembersController } from './members.controller';
import { authMiddleware } from '../../common/middleware/auth.middleware';
import { requireProjectRole } from '../../common/middleware/rbac.middleware';

export async function membersRoutes(app: FastifyInstance) {
  app.get(
    '/projects/:projectId/members',
    { preHandler: [authMiddleware, requireProjectRole(['ADMIN', 'PROJECT_MANAGER', 'CONTRIBUTOR'])] },
    MembersController.getMembers
  );
  app.post(
    '/projects/:projectId/members',
    { preHandler: [authMiddleware, requireProjectRole(['ADMIN', 'PROJECT_MANAGER'])] },
    MembersController.inviteMember
  );
  app.patch(
    '/projects/:projectId/members/:memberId',
    { preHandler: [authMiddleware, requireProjectRole(['ADMIN', 'PROJECT_MANAGER'])] },
    MembersController.updateMemberRole
  );
  app.delete(
    '/projects/:projectId/members/:memberId',
    { preHandler: [authMiddleware, requireProjectRole(['ADMIN', 'PROJECT_MANAGER'])] },
    MembersController.removeMember
  );
  app.post(
    '/accept-invite',
    { preHandler: [authMiddleware] },
    MembersController.acceptProjectInvite
  );
  app.get(
    '/accept-invite',
    MembersController.acceptProjectInvite
  );
}
