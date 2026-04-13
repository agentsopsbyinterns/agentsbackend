import { FastifyReply, FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';
import { jwtConfig } from '../../config/jwt.js';
import { unauthorized } from '../../common/errors/api-error.js';

export async function authMiddleware(request: FastifyRequest, _reply: FastifyReply) {
  const header = request.headers.authorization;

  if (!header || !header.toLowerCase().startsWith('bearer ')) {
    throw unauthorized();
  }

  const token = header.split(' ')[1];

  try {
    const decoded = jwt.verify(token, jwtConfig.access.secret) as {
      sub: string;
      email: string;
      organizationId: string;
      globalRole?: 'SUPER_ADMIN' | 'ADMIN' | 'TEAM_MEMBER';
    };

    console.log(`[AuthMiddleware] Token verified for user: ${decoded.email} (${decoded.sub})`);

    const incomingGlobal = decoded.globalRole as any;
    const mappedGlobal: 'ADMIN' | 'TEAM_MEMBER' | undefined =
      incomingGlobal === 'SUPER_ADMIN'
        ? 'ADMIN'
        : incomingGlobal === 'ADMIN'
        ? 'ADMIN'
        : incomingGlobal === 'TEAM_MEMBER'
        ? 'TEAM_MEMBER'
        : 'TEAM_MEMBER';

    request.user = {
      id: decoded.sub,
      email: decoded.email,
      organizationId: decoded.organizationId,
      globalRole: mappedGlobal
    };

    request.organizationId = decoded.organizationId;
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      console.warn('[AuthMiddleware] JWT Token Expired');
    } else if (err.name === 'JsonWebTokenError') {
      console.warn(`[AuthMiddleware] JWT Token Invalid: ${err.message}`);
    } else {
      console.error(`[AuthMiddleware] Auth Error: ${err.message}`);
    }
    throw unauthorized();
  }
}
