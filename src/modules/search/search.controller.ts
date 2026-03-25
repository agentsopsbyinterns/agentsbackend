import type { FastifyReply, FastifyRequest } from 'fastify';
import { globalSearch } from './search.service';

export async function handleGlobalSearch(request: FastifyRequest, reply: FastifyReply) {
  const { q } = request.query as { q: string };
  const orgId = request.organizationId;

  if (!orgId) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  try {
    const results = await globalSearch(orgId, q);
    return reply.send(results);
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ error: 'Search failed' });
  }
}
