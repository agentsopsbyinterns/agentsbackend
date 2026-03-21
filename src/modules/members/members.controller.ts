
import { FastifyRequest, FastifyReply } from 'fastify';
import { getProjectMembers, inviteMember, removeMember, updateMemberRole, acceptProjectInvite } from './members.service';

export const MembersController = {
  getMembers: async (request: FastifyRequest, reply: FastifyReply) => {
    const { projectId } = request.params as any;
    const result = await getProjectMembers(projectId);
    
    return reply.send(result);
  },

  inviteMember: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!(request as any).user) return reply.status(401).send({ message: 'Unauthorized' });
    if (!(request as any).user.organizationId) {
      return reply.status(400).send({ message: 'User organization ID is missing' });
    }
    const { projectId } = request.params as any;
    const { email, projectRole, role } = request.body as any;
    try {
      console.log('Controller: inviteMember request params:', request.params);
      console.log('Controller: inviteMember request body:', request.body);
      console.log('Controller: user organizationId:', (request as any).user.organizationId);
      
      const result = await inviteMember(projectId, (request as any).user.organizationId, email, projectRole || role);
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
    
    // Get currently logged-in user from JWT if available
    const user = (request as any).user;

    try {
      if (request.method === 'POST') {
        if (!user || !user.id) {
          return reply.status(401).send({ message: 'Authentication required to accept invite' });
        }
        console.log("INVITE ACCEPT API CALLED", { token, userId: user.id });
        const result = await acceptProjectInvite(token, user.id);
        return reply.send(result);
      } else {
        // GET request is for verifying the token before signup/login
        const result = await acceptProjectInvite(token);
        return reply.send(result);
      }
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
    const { projectRole, role } = request.body as any;
    try {
      const updatedMember = await updateMemberRole(projectId, memberId, projectRole || role);
      return reply.send(updatedMember);
    } catch (error: any) {
      return reply.status(404).send({ message: error.message });
    }
  }
};
