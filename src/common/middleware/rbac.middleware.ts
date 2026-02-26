import { FastifyReply, FastifyRequest } from 'fastify';
import { forbidden, unauthorized } from '../errors/api-error';
import { prisma } from '../../prisma/client';

export function rbacMiddleware(roles: Array<'ADMIN' | 'PM' | 'MEMBER'>) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    if (!request.user) {
      throw unauthorized();
    }
    if (!roles.includes(request.user.role)) {
      throw forbidden();
    }
  };
}

export function requireGlobalRole(roles: Array<'ADMIN' | 'PROJECT_MANAGER' | 'TEAM_MEMBER'>) {
  return async (request: FastifyRequest) => {
    if (!request.user) {
      throw unauthorized();
    }
    const userRole = (request.user as any).globalRole || request.user.role;
    if (!roles.includes(userRole as any)) {
      throw forbidden();
    }
  };
}

export function requireProjectRole(roles: Array<'OWNER' | 'EDITOR' | 'VIEWER'>) {
  return async (request: FastifyRequest) => {
    if (!request.user) {
      throw unauthorized();
    }
    const projectId = (request.params as any)?.id || (request.params as any)?.projectId;
    if (!projectId) {
      throw forbidden();
    }
    const membership = await (prisma as any).projectMember.findFirst({
      where: { projectId, userId: request.user.id }
    });
    if (!membership || !roles.includes(membership.projectRole)) {
      throw forbidden();
    }
  };
}
