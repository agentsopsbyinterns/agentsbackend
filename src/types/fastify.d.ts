import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: string;
      email: string;
      organizationId: string;
      role: 'ADMIN' | 'PM' | 'MEMBER';
      globalRole?: 'ADMIN' | 'PROJECT_MANAGER' | 'TEAM_MEMBER';
    };
    organizationId?: string;
  }
}
