import { FastifyReply, FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';
import { jwtConfig } from '../../config/jwt';
import { unauthorized } from '../../common/errors/api-error';

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
  } catch {
    throw unauthorized();
  }
}
