import { FastifyReply, FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';
import { jwtConfig } from '../../config/jwt';
import { unauthorized } from '../errors/api-error';

export async function authMiddleware(request: FastifyRequest, _reply: FastifyReply) {
  const header = request.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw unauthorized();
  }
  const token = header.slice('Bearer '.length);
  try {
    const decoded = jwt.verify(token, jwtConfig.access.secret) as {
      sub: string;
      email: string;
      organizationId: string;
      role: 'ADMIN' | 'PM' | 'MEMBER';
    };
    request.user = {
      id: decoded.sub,
      email: decoded.email,
      organizationId: decoded.organizationId,
      role: decoded.role
    };
    request.organizationId = decoded.organizationId;
  } catch {
    throw unauthorized();
  }
}
