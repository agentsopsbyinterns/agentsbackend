import { FastifyReply, FastifyRequest } from 'fastify';
import { forbidden, unauthorized } from '../errors/api-error';
import { prisma } from '../../prisma/client';
import { mapLegacyRole, PROJECT_ROLES, ProjectRole } from '../utils/roles';

export function rbacMiddleware(roles: Array<ProjectRole>) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    if (!request.user) throw unauthorized();

    const params = request.params as any;
    const projectId = params.projectId || params.id;
    
    // Default to a restricted role if no membership found
    let userRole: ProjectRole = PROJECT_ROLES.CONTRIBUTOR;

    // If we have a project context, always prefer the project-specific role
    if (projectId && typeof projectId === 'string') {
      const membership = await (prisma as any).projectMember.findUnique({
        where: { userId_projectId: { userId: request.user.id, projectId } }
      });
      if (membership) {
        userRole = mapLegacyRole(membership.projectRole);
        // Requirement 10: Log role resolution
        console.log(`[RBAC] Resolved project role for user ${request.user.id} on project ${projectId}: ${userRole}`);
      } else {
        // Check if global admin (bypasses membership requirement for most actions)
        const globalRole = (request.user as any).globalRole;
        const normalizedGlobal = mapLegacyRole(globalRole);
        if (normalizedGlobal === PROJECT_ROLES.ADMIN) {
          // Requirement 10: Log role resolution
          console.log(`[RBAC] Global ADMIN access granted for user ${request.user.id} on project ${projectId}`);
          return;
        }
        throw forbidden('You are not a member of this project');
      }
    } else {
      // Global actions fallback to global role
      const globalRole = (request.user as any).globalRole;
      userRole = mapLegacyRole(globalRole);
      // Requirement 10: Log role resolution
      console.log(`[RBAC] Resolved global role for user ${request.user.id}: ${userRole}`);
    }

    if (!roles.includes(userRole as any)) {
      throw forbidden(`Required role missing. Your project role: ${userRole}`);
    }
  };
}

export function requireGlobalRole(roles: Array<string>) {
  return async (request: FastifyRequest) => {
    if (!request.user) {
      throw unauthorized();
    }
    const globalRole = (request.user as any).globalRole;
    const normalized = mapLegacyRole(globalRole);
    if (!roles.includes(normalized)) {
      throw forbidden();
    }
  };
}

export function requireProjectRole(allowedRoles: Array<ProjectRole>) {
  return async (request: FastifyRequest) => {
    if (!request.user) {
      throw unauthorized();
    }

    // Global admins bypass project-level checks
    const globalRole = (request.user as any).globalRole;
    const normalizedGlobal = mapLegacyRole(globalRole);
    if (normalizedGlobal === PROJECT_ROLES.ADMIN) {
      console.log(`[RBAC] Global ADMIN access granted for user ${request.user.id}`);
      return;
    }

    // Extract projectId from various possible param names
    const params = request.params as any;
    const projectId = params.projectId || params.id;

    if (!projectId) {
      console.error('[RBAC] projectId missing in request params');
      throw forbidden('Project context is required');
    }

    const userId = request.user.id;

    // Check membership and role in ProjectMember table
    const membership = await (prisma as any).projectMember.findUnique({
      where: {
        userId_projectId: {
          userId,
          projectId
        }
      }
    });

    const projectRole = mapLegacyRole(membership?.projectRole);

    console.log(`[RBAC] User ${userId} attempting access on project ${projectId}. Role found: ${projectRole || 'NONE'}, Required: ${allowedRoles}`);

    if (!membership || !allowedRoles.includes(projectRole)) {
      console.warn(`[RBAC] Access denied for user ${userId} on project ${projectId}. Role found: ${projectRole || 'NONE'}`);
      throw forbidden('You do not have the required role for this project');
    }
  };
}

export function allowProjectRoles(allowedRoles: Array<ProjectRole>) {
  return requireProjectRole(allowedRoles);
}
