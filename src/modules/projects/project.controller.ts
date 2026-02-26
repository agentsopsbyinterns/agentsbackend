import { FastifyReply, FastifyRequest } from 'fastify';
import { unauthorized } from '../../common/errors/api-error';
import { getPagination } from '../../common/utils/pagination';
import { createProject, deleteProject, getProject, listProjects, listTasks, projectMetrics, updateProject } from './project.service';

export const ProjectController = {
  list: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const { skip, take, page, pageSize } = getPagination(request.query as any);
    const { items, total } = await listProjects(request.user.organizationId, skip, take);
    return reply.send({ page, pageSize, total, items });
  },
  get: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const id = (request.params as any).id;
    const p = await getProject(request.user.organizationId, id);
    return reply.send(p);
  },
  create: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const body = request.body as any;
    const p = await createProject(request.user.organizationId, body);
    return reply.code(201).send(p);
  },
  update: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const id = (request.params as any).id;
    const existing = await getProject(request.user.organizationId, id);
    if (!existing) return reply.status(404).send({ error: 'Not found' });
    const body = request.body as any;
    const p = await updateProject(request.user.organizationId, id, body);
    return reply.send(p);
  },
  remove: async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    const id = (request.params as any).id;
    const existing = await getProject(request.user.organizationId, id);
    if (!existing) return reply.status(404).send({ error: 'Not found' });
    await deleteProject(request.user.organizationId, id);
    return reply.send({ success: true });
  },
  tasks: async (request: FastifyRequest, reply: FastifyReply) => {
    const id = (request.params as any).id;
    const t = await listTasks(id);
    return reply.send(t);
  },
  metrics: async (request: FastifyRequest, reply: FastifyReply) => {
    const id = (request.params as any).id;
    const m = await projectMetrics(id);
    return reply.send(m);
  }
};
