import { FastifyReply, FastifyRequest } from 'fastify';
import { forbidden, unauthorized } from '../errors/api-error';

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
