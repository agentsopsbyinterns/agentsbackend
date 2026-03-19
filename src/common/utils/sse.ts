import { FastifyReply } from 'fastify';

export function sseInit(reply: FastifyReply) {
  reply.raw.setHeader('Content-Type', 'text/event-stream');
  reply.raw.setHeader('Cache-Control', 'no-cache');
  reply.raw.setHeader('Connection', 'keep-alive');
  reply.raw.flushHeaders();
}

export function sseSend(reply: FastifyReply, data: any) {
  try {
    reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch (err) {
    console.error('SSE send error:', err);
  }
}

export function sseClose(reply: FastifyReply) {
  reply.raw.end();
}
