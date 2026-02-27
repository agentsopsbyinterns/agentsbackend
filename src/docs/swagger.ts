import { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

export async function registerSwagger(app: FastifyInstance) {
  await app.register(swagger, {
    openapi: {
      info: { title: 'AgentOps API', version: '1.0.0' }
    }
  });
  await app.register(swaggerUi, {
    routePrefix: '/docs'
  });
}
