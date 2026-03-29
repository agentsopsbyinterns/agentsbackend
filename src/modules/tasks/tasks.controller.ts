import { FastifyReply, FastifyRequest } from 'fastify';
import { unauthorized } from '../../common/errors/api-error.js';
import { bulkCreateTasksSchema } from './tasks.schema.js';
import { bulkCreateTasks } from './tasks.service.js';

export const TaskController = {
  bulkCreate: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    console.log('Request Body:', request.body);
    const parsed = bulkCreateTasksSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Validation failed' });

    const { projectId, tasks } = parsed.data;
    const result = await bulkCreateTasks(projectId, tasks);
    return reply.code(201).send(result);
  },
};
