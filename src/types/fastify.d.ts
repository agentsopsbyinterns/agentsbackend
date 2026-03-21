import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: string;
      email: string;
      organizationId: string;
      globalRole?: 'ADMIN' | 'TEAM_MEMBER';
    };
    organizationId?: string;
  }
}
