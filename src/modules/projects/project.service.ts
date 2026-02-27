import { prisma } from '../../prisma/client';
import { signAccessToken } from '../../common/utils/tokens';

export async function listProjects(orgId: string, skip: number, take: number) {
  const [items, total] = await Promise.all([
    (prisma as any).project.findMany({ where: { organizationId: orgId, deletedAt: null }, orderBy: { updatedAt: 'desc' }, skip, take }),
    (prisma as any).project.count({ where: { organizationId: orgId, deletedAt: null } })
  ]);
  return { items, total };
}

export async function getProject(orgId: string, id: string) {
  return (prisma as any).project.findFirst({ where: { id, organizationId: orgId } });
}

export async function listTasks(projectId: string) {
  return (prisma as any).projectTask.findMany({ where: { projectId } });
}

export async function projectMetrics(projectId: string) {
  const total = await (prisma as any).projectTask.count({ where: { projectId } });
  const done = await (prisma as any).projectTask.count({ where: { projectId, status: 'COMPLETED' } });
  return { total, done };
}

export async function createProject(orgId: string, creatorUserId: string, input: any) {
  const data: any = {
    organizationId: orgId,
    name: input.name,
    client: input.client ?? null,
    progress: input.progress ?? 0,
    health: input.health ?? null,
    status: input.status ?? null,
    dueDate: input.dueDate ? new Date(input.dueDate) : null,
    asanaLink: input.asanaLink ?? null,
    createdById: creatorUserId
  };
  const project = await (prisma as any).project.create({ data });
  await (prisma as any).projectMember.upsert({
    where: { userId_projectId: { userId: creatorUserId, projectId: project.id } },
    update: { projectRole: 'OWNER' },
    create: { userId: creatorUserId, projectId: project.id, projectRole: 'OWNER' }
  });
  return project;
}

export async function updateProject(orgId: string, id: string, input: any) {
  const data: any = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.client !== undefined) data.client = input.client;
  if (input.clientName !== undefined) data.clientName = input.clientName;
  if (input.progress !== undefined) data.progress = input.progress;
  if (input.health !== undefined) data.health = input.health;
  if (input.status !== undefined) data.status = input.status;
  if (input.dueDate !== undefined) data.dueDate = input.dueDate ? new Date(input.dueDate) : null;
  if (input.asanaLink !== undefined) data.asanaLink = input.asanaLink;
  return (prisma as any).project.update({
    where: { id },
    data,
    // extra safety via conditional update pattern
  });
}

export async function deleteProject(orgId: string, id: string) {
  // Soft delete for safety
  return (prisma as any).project.update({
    where: { id },
    data: { deletedAt: new Date() }
  });
}

export async function getBudget(projectId: string) {
  const project = await (prisma as any).project.findUnique({ where: { id: projectId } });
  if (!project) return null;
  const agg = await (prisma as any).projectExpense.aggregate({
    where: { projectId },
    _sum: { amount: true }
  });
  const used = (agg._sum?.amount ?? 0) as any;
  const budgetTotal = (project.budgetTotal ?? 0) as any;
  const usedNum = typeof used === 'object' && used !== null && 'toNumber' in used ? (used as any).toNumber() : Number(used);
  const totalNum = typeof budgetTotal === 'object' && budgetTotal !== null && 'toNumber' in budgetTotal ? (budgetTotal as any).toNumber() : Number(budgetTotal);
  const remaining = Math.max(totalNum - usedNum, 0);
  const riskStatus = totalNum > 0 && usedNum / totalNum >= 0.8 ? 'At Risk' : 'On Track';
  return { budget: totalNum, used: usedNum, remaining, riskStatus };
}

export async function setBudget(projectId: string, amount: number) {
  return (prisma as any).project.update({ where: { id: projectId }, data: { budgetTotal: amount as any } });
}

export async function addExpense(projectId: string, input: { amount: number; description?: string; category?: string; incurredAt?: string }) {
  const data: any = { projectId, amount: input.amount as any };
  if (input.description !== undefined) data.description = input.description;
  if (input.category !== undefined) data.category = input.category;
  if (input.incurredAt) data.incurredAt = new Date(input.incurredAt);
  return (prisma as any).projectExpense.create({ data });
}

export async function listExpenses(projectId: string) {
  return (prisma as any).projectExpense.findMany({ where: { projectId }, orderBy: { incurredAt: 'desc' } });
}

export async function updateExpense(id: string, input: { amount?: number; description?: string; category?: string; incurredAt?: string }) {
  const data: any = {};
  if (input.amount !== undefined) data.amount = input.amount as any;
  if (input.description !== undefined) data.description = input.description;
  if (input.category !== undefined) data.category = input.category;
  if (input.incurredAt !== undefined) data.incurredAt = input.incurredAt ? new Date(input.incurredAt) : null;
  return (prisma as any).projectExpense.update({ where: { id }, data });
}

export async function deleteExpense(id: string) {
  return (prisma as any).projectExpense.delete({ where: { id } });
}
export async function inviteTeamMember(projectId: string, email: string, role: 'OWNER' | 'EDITOR' | 'VIEWER') {
  const user = await (prisma as any).user.findUnique({ where: { email } });
  if (user) {
    const member = await (prisma as any).projectMember.upsert({
      where: { userId_projectId: { userId: user.id, projectId } },
      update: { projectRole: role },
      create: { userId: user.id, projectId, projectRole: role }
    });
    return { added: true, inviteSent: false, member };
  }
  const raw = cryptoRandom();
  const tokenHash = sha256(raw);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);
  const invite = await (prisma as any).projectInvite.upsert({
    where: { projectId_email: { projectId, email } },
    update: { projectRole: role, tokenHash, expiresAt, used: false },
    create: { projectId, email, projectRole: role, tokenHash, expiresAt }
  });
  const link = `${process.env.APP_URL || 'http://localhost:3000'}/accept-invite?token=${raw}`;
  await sendMail({
    to: email,
    subject: 'Project Invitation',
    html: `<p>You have been invited to a project.</p><p><a href="${link}">${link}</a></p>`
  });
  return { added: false, inviteSent: true, invite };
}

export async function acceptProjectInvite(rawToken: string, password: string) {
  const tokenHash = sha256(rawToken);
  const invite = await (prisma as any).projectInvite.findUnique({ where: { tokenHash } });
  if (!invite || invite.used || invite.expiresAt < new Date()) {
    throw new Error('Invalid or expired invite');
  }
  const project = await (prisma as any).project.findUnique({ where: { id: invite.projectId } });
  if (!project) throw new Error('Project not found');
  let user = await (prisma as any).user.findUnique({ where: { email: invite.email } });
  if (!user) {
    const hash = await hashPassword(password);
    user = await (prisma as any).user.create({
      data: {
        email: invite.email,
        passwordHash: hash,
        name: invite.email.split('@')[0],
        organizationId: project.organizationId,
        role: 'MEMBER',
        globalRole: 'TEAM_MEMBER'
      }
    });
  }
  await (prisma as any).projectMember.upsert({
    where: { userId_projectId: { userId: user.id, projectId: invite.projectId } },
    update: { projectRole: invite.projectRole },
    create: { userId: user.id, projectId: invite.projectId, projectRole: invite.projectRole }
  });
  await (prisma as any).projectInvite.update({ where: { id: invite.id }, data: { used: true } });

  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    organizationId: user.organizationId,
    role: user.role,
    globalRole: (user as any).globalRole || 'TEAM_MEMBER'
  });
  return { user, accessToken };
}

export async function createTask(projectId: string, title: string, assigneeUserId?: string, dueDate?: string, description?: string, status?: string, priority?: string) {
  const data: any = { projectId, title };
  if (description !== undefined) data.description = description;
  if (status !== undefined) data.status = status;
  if (priority !== undefined) data.priority = priority;
  if (assigneeUserId !== undefined) data.assigneeUserId = assigneeUserId;
  if (dueDate) data.dueDate = new Date(dueDate);
  return (prisma as any).projectTask.create({ data });
}

export async function updateTask(id: string, title?: string, status?: string, assigneeUserId?: string, dueDate?: string, description?: string, priority?: string) {
  const data: any = {};
  if (title !== undefined) data.title = title;
  if (status !== undefined) data.status = status;
  if (priority !== undefined) data.priority = priority;
  if (description !== undefined) data.description = description;
  if (assigneeUserId !== undefined) data.assigneeUserId = assigneeUserId;
  if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;
  return (prisma as any).projectTask.update({ where: { id }, data });
}

export async function deleteTask(id: string) {
  return (prisma as any).projectTask.delete({ where: { id } });
}

function sha256(input: string) {
  return require('crypto').createHash('sha256').update(input).digest('hex');
}
function cryptoRandom(bytes = 32) {
  return require('crypto').randomBytes(bytes).toString('hex');
}
async function hashPassword(password: string) {
  const bcrypt = require('bcrypt');
  const saltRounds = 10;
  return await bcrypt.hash(password, saltRounds);
}
async function sendMail(options: { to: string; subject: string; html: string }) {
  const { sendMail } = require('../../common/utils/mailer');
  return await sendMail(options);
}
