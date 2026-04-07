import { FastifyReply, FastifyRequest } from 'fastify';
import { forbidden, unauthorized } from '../errors/api-error.js';
import { prisma } from '../../prisma/client.js';
import { mapLegacyRole, PROJECT_ROLES, ProjectRole } from '../utils/roles.js';

export function rbacMiddleware(roles: Array<ProjectRole>) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    if (!request.user) throw unauthorized();

    const params = request.params as any;
    let projectId: string | undefined;

    // Resolve projectId from meetingId if this is a meeting route
    const isMeetingRoute = request.routerPath?.includes('/meetings/');
    if (isMeetingRoute && params.id) {
      const meeting = await (prisma as any).meeting.findUnique({
        where: { id: params.id },
        select: { projectId: true }
      });
      if (!meeting) {
        throw forbidden('Meeting not found');
      }
      projectId = meeting.projectId;
    } else {
      projectId = params.projectId || params.id;
    }
    
    // Default to a restricted role if no membership found
    let userRole: ProjectRole = PROJECT_ROLES.CONTRIBUTOR;

    // If we have a project context, always prefer the project-specific role
    if (projectId && typeof projectId === 'string') {
      const [membership, project] = await Promise.all([
        (prisma as any).projectMember.findUnique({
          where: { userId_projectId: { userId: request.user.id, projectId } }
        }),
        (prisma as any).project.findUnique({
          where: { id: projectId },
          select: { createdById: true }
        })
      ]);

      const globalRole = (request.user as any).globalRole;
      const normalizedGlobal = mapLegacyRole(globalRole);
      const isOwner = project?.createdById === request.user.id;

      if (membership) {
        userRole = mapLegacyRole(membership.projectRole);
        console.log(`[RBAC] Resolved project role for user ${request.user.id} on project ${projectId}: ${userRole}`);
      } else if (normalizedGlobal === PROJECT_ROLES.ADMIN) {
        // Global admin bypass
        console.log(`[RBAC] Global ADMIN access granted for user ${request.user.id} on project ${projectId}`);
        return;
      } else if (isOwner) {
        // Project owner (creator) bypass - give them ADMIN access on their project
        userRole = PROJECT_ROLES.ADMIN;
        console.log(`[RBAC] Project OWNER access granted for user ${request.user.id} on project ${projectId}`);
      } else {
        throw forbidden('You are not a member of this project');
      }
    } else {
      // Global actions fallback to global role
      const globalRole = (request.user as any).globalRole;
      userRole = mapLegacyRole(globalRole);
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

    const params = request.params as any;
    let projectId: string | undefined;

    // Resolve projectId from meetingId if this is a meeting route
    const isMeetingRoute = request.routerPath?.includes('/meetings/');
    if (isMeetingRoute && params.id) {
      const meeting = await (prisma as any).meeting.findUnique({
        where: { id: params.id },
        select: { projectId: true }
      });
      if (!meeting) {
        throw forbidden('Meeting not found');
      }
      projectId = meeting.projectId;
    } else {
      projectId = params.projectId || params.id;
    }

    if (!projectId) {
      console.error('[RBAC] projectId missing in request params');
      throw forbidden('Project context is required');
    }

    const userId = request.user.id;

    // Check membership and role in ProjectMember table
    const [membership, project] = await Promise.all([
      (prisma as any).projectMember.findUnique({
        where: { userId_projectId: { userId, projectId } }
      }),
      (prisma as any).project.findUnique({
        where: { id: projectId },
        select: { createdById: true }
      })
    ]);

    const globalRole = (request.user as any).globalRole;
    const normalizedGlobal = mapLegacyRole(globalRole);
    const isOwner = project?.createdById === userId;

    if (normalizedGlobal === PROJECT_ROLES.ADMIN) {
      console.log(`[RBAC] Global ADMIN access granted for user ${userId}`);
      return;
    }

    if (isOwner) {
      console.log(`[RBAC] Project OWNER access granted for user ${userId} on project ${projectId}`);
      return;
    }

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
