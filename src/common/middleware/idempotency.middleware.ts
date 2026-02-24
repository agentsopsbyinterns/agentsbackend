import { FastifyReply, FastifyRequest } from 'fastify';
import { getRedis } from '../../config/redis';

export function idempotencyMiddleware() {
  const redis = getRedis();
  return async function (request: FastifyRequest, reply: FastifyReply) {
    const key = request.headers['idempotency-key'] as string | undefined;
    if (!redis || !key) return;
    const exists = await redis.get(`idem:${key}`);
    if (exists) {
      reply.status(409).send({ error: 'Duplicate request' });
      return;
    }
    await redis.set(`idem:${key}`, '1', 'EX', 60 * 10);
  };
}
