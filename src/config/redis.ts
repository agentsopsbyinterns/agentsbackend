import Redis from 'ioredis';
import { env } from './env';

let client: any | undefined;

export function getRedis() {
  if (!env.REDIS_URL) return undefined;
  if (!client) client = new (Redis as any)(env.REDIS_URL);
  return client;
}
