
import { FastifyRequest, FastifyReply } from 'fastify';
import { getProjectMembers, inviteMember, removeMember, updateMemberRole, acceptProjectInvite } from './members.service';
import { prisma } from '../../prisma/client';

export const MembersController = {
  getMembers: async (request: FastifyRequest, reply: FastifyReply) => {
    const { projectId } = request.params as any;
    const { members, invites } = (await getProjectMembers(projectId)) as any;
    
    const activeMembers = (members || []).map((m: any) => ({
       id: m.id,
       userId: m.userId,
       email: m.user?.email,
       name: m.user?.name,
       role: m.projectRole,
       status: 'ACTIVE'
     }));

    const invitedMembers = (invites || []).map((i: any) => ({
       id: i.id,
       email: i.email,
       name: i.email.split('@')[0],
       role: i.projectRole,
       status: 'INVITED'
    }));

    const allMembers = [...activeMembers, ...invitedMembers];

    return reply.send({ 
      items: allMembers,
      total: allMembers.length
    });
  },

  inviteMember: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!(request as any).user) return reply.status(401).send({ message: 'Unauthorized' });
    const { projectId } = request.params as any;
    const { email, role } = request.body as any;
    try {
      console.log('Controller: inviteMember request params:', request.params);
      console.log('Controller: inviteMember request body:', request.body);
      console.log('Controller: user organizationId:', (request as any).user.organizationId);
      let orgId = (request as any).user.organizationId;
      if (!orgId) {
        const dbUser = await prisma.user.findUnique({ where: { id: (request as any).user.id } });
        orgId = dbUser?.organizationId as string | undefined;
        if (!orgId) {
          return reply.status(400).send({ message: 'User organization context is missing' });
        }
      }
      
      const result = await inviteMember(projectId, orgId, email, role);
      if (result && 'message' in result && result.message === 'User already in project') {
        return reply.code(200).send(result);
      }
      return reply.code(201).send(result);
    } catch (error: any) {
      console.error('Controller: inviteMember error:', error);
      return reply.status(400).send({ message: error.message, stack: error.stack });
    }
  },

  acceptProjectInvite: async (request: FastifyRequest, reply: FastifyReply) => {
    const { token } = request.query as any;
    if (!token) return reply.status(400).send({ message: 'Token is required' });
    try {
      const result = await acceptProjectInvite(token);
      return reply.send(result);
    } catch (error: any) {
      return reply.status(400).send({ message: error.message });
    }
  },

  removeMember: async (request: FastifyRequest, reply: FastifyReply) => {
    const { projectId, memberId } = request.params as any;
    try {
      await removeMember(projectId, memberId);
      return reply.code(204).send();
    } catch (error: any) {
      return reply.status(404).send({ message: error.message });
    }
  },

  updateMemberRole: async (request: FastifyRequest, reply: FastifyReply) => {
    const { projectId, memberId } = request.params as any;
    const { role } = request.body as any;
    try {
      const updatedMember = await updateMemberRole(projectId, memberId, role);
      return reply.send(updatedMember);
    } catch (error: any) {
      return reply.status(404).send({ message: error.message });
    }
  }
};
