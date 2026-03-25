import type { FastifyInstance } from 'fastify';
import { handleGlobalSearch } from './search.controller';
import { authMiddleware } from '../../common/middleware/auth.middleware';

export async function searchRoutes(app: FastifyInstance) {
  app.get('/api/search', {
    preHandler: [authMiddleware],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          q: { type: 'string' }
        },
        required: ['q']
      }
    }
  }, handleGlobalSearch);
}
