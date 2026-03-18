import { prisma } from '../../prisma/client';
import { mergeProjectData, detectTaskChanges } from '../../services/ai.service';
import { badRequest, notFound } from '../../common/errors/api-error';

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
  return (prisma as any).projectTask.findMany({
    where: { projectId },
    include: { meeting: true }
  });
}

export async function projectMetrics(projectId: string) {
  const total = await (prisma as any).projectTask.count({ where: { projectId } });
  const done = await (prisma as any).projectTask.count({ where: { projectId, status: 'COMPLETED' } });
  return { total, done };
}

export async function listProjectMeetings(orgId: string, projectId: string) {
  return (prisma as any).meeting.findMany({
    where: { organizationId: orgId, projectId, deletedAt: null },
    orderBy: { scheduledTime: 'desc' }
  });
}

export async function listProjectMembers(projectId: string) {
  const members = await (prisma as any).projectMember.findMany({
    where: { projectId },
    include: { user: true }
  });
  return {
    items: members.map((m: any) => ({
      id: m.userId,
      email: m.user.email,
      name: m.user.name,
      role: m.projectRole,
      status: 'ACTIVE'
    })),
    total: members.length
  };
}

export async function getProjectIntegrations(orgId: string) {
  const connections = await (prisma as any).integrationConnection.findMany({
    where: { organizationId: orgId },
    include: { integration: true }
  });
  const providers = ['msteams', 'slack', 'asana'];
  return providers.map(p => {
    const conn = connections.find((c: any) => c.integration.name.toLowerCase() === p);
    return {
      provider: p,
      connected: !!conn && conn.status === 'connected',
      connectedAccount: conn?.status === 'connected' ? 'Connected' : undefined
    };
  });
}

export async function mergeMeetingToProject(orgId: string, projectId: string, meetingId: string) {
  const project = await (prisma as any).project.findUnique({
    where: { id: projectId, organizationId: orgId },
    include: { tasks: true, meetings: { where: { deletedAt: null }, orderBy: { scheduledTime: 'desc' } } }
  });

  if (!project) throw new Error('Project not found');

  const meeting = await (prisma as any).meeting.findUnique({
    where: { id: meetingId, organizationId: orgId }
  });

  if (!meeting) throw new Error('Meeting not found');

  // Identify the "previous state". We can use the extraction of the most recent 
  // PREVIOUS meeting (not the current one).
  const previousMeeting = project.meetings.find((m: any) => m.id !== meetingId && m.extractionJson);
  
  // If no previous meeting extraction, construct from project data
  const previousState = previousMeeting?.extractionJson || {
    final_summary: project.name,
    updated_tasks: project.tasks.map((t: any) => ({ 
      task: t.title, 
      owner: t.assigneeUserId || 'Not mentioned', 
      deadline: t.dueDate ? t.dueDate.toISOString() : 'Not mentioned' 
    })),
    deliverables: [],
    timeline: project.dueDate ? project.dueDate.toISOString() : '',
    budget: project.budgetTotal ? project.budgetTotal.toString() : '',
    client_information: {
      client_name: project.clientName || project.client || '',
    }
  };

  const newMeetingData = meeting.extractionJson || {};

  const merged = await mergeProjectData(previousState, newMeetingData);

  // Note: We are just returning the JSON as per the user's "Return ONLY valid JSON" requirement.
  // The user prompt in ai.service.ts already handles the logic.
  return merged;
}

export async function detectProjectTaskChanges(projectId: string, updatedTasks: any[]) {
  const tasks = await (prisma as any).projectTask.findMany({ where: { projectId } });
  const previousTasks = tasks.map((t: any) => ({
    id: t.id,
    task: t.title,
    owner: t.assigneeUserId,
    deadline: t.dueDate ? t.dueDate.toISOString() : 'Not mentioned',
    status: t.status
  }));

  return await detectTaskChanges(previousTasks, updatedTasks);
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
  await (prisma as any).projectMember.upsert({    where: { userId_projectId: { userId: creatorUserId, projectId: project.id } },    update: { projectRole: 'OWNER' },    create: { userId: creatorUserId, projectId: project.id, projectRole: 'OWNER' }  });
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
export async function inviteTeamMember(projectId: string, email: string, role: 'OWNER' | 'CONTRIBUTOR' | 'VIEWER') {
  if (!projectId) throw badRequest("Project ID required");
  if (!email) throw badRequest("Email required");

  const user = await (prisma as any).user.findUnique({ where: { email } });
  if (!user) throw notFound("User not found");

  const existing = await (prisma as any).projectMember.findUnique({
    where: { userId_projectId: { userId: user.id, projectId } }
  });

  if (existing) throw badRequest("User is already a member of this project");

  return (prisma as any).projectMember.create({
    data: {
      userId: user.id,
      projectId,
      projectRole: role
    }
  });
}

export async function updateProjectMemberRole(projectId: string, memberId: string, role: 'OWNER' | 'CONTRIBUTOR' | 'VIEWER') {
  const validRoles = ["OWNER", "CONTRIBUTOR", "VIEWER"];
  if (!validRoles.includes(role)) throw badRequest("Invalid role");

  return (prisma as any).projectMember.update({
    where: { userId_projectId: { userId: memberId, projectId } },
    data: { projectRole: role }
  });
}

export async function deleteProjectMember(projectId: string, memberId: string) {
  return (prisma as any).projectMember.delete({
    where: { userId_projectId: { userId: memberId, projectId } }
  });
}



export async function createTask(projectId: string, title: string, assigneeUserId?: string, dueDate?: string, description?: string, status?: string, priority?: string, meetingId?: string) {
  const data: any = { projectId, title };
  if (description !== undefined) data.description = description;
  if (status !== undefined) data.status = status;
  if (priority !== undefined) data.priority = priority;
  if (assigneeUserId !== undefined) data.assigneeUserId = assigneeUserId;
  if (dueDate) data.dueDate = new Date(dueDate);
  if (meetingId !== undefined) data.meetingId = meetingId || null;
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

export async function listMilestones(projectId: string) {
  return (prisma as any).projectMilestone.findMany({ where: { projectId }, orderBy: { dueDate: 'asc' } });
}

export async function createMilestone(projectId: string, title: string, dueDate?: string, status?: string, progress?: number) {
  const data: any = { projectId, title };
  if (dueDate) data.dueDate = new Date(dueDate);
  if (status) data.status = status;
  if (progress !== undefined) data.progress = progress;
  return (prisma as any).projectMilestone.create({ data });
}

export async function updateMilestone(id: string, title?: string, dueDate?: string, status?: string, progress?: number) {
  const data: any = {};
  if (title !== undefined) data.title = title;
  if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;
  if (status !== undefined) data.status = status;
  if (progress !== undefined) data.progress = progress;
  return (prisma as any).projectMilestone.update({ where: { id }, data });
}

export async function deleteMilestone(id: string) {
  return (prisma as any).projectMilestone.delete({ where: { id } });
}

export async function listRisks(projectId: string) {
  return (prisma as any).projectRisk.findMany({ where: { projectId }, orderBy: { updatedAt: 'desc' } });
}

export async function createRisk(projectId: string, title: string, description?: string, severity?: string, status?: string) {
  const data: any = { projectId, title };
  if (description) data.description = description;
  if (severity) data.severity = severity;
  if (status) data.status = status;
  return (prisma as any).projectRisk.create({ data });
}

export async function updateRisk(id: string, title?: string, description?: string, severity?: string, status?: string) {
  const data: any = {};
  if (title !== undefined) data.title = title;
  if (description !== undefined) data.description = description;
  if (severity !== undefined) data.severity = severity;
  if (status !== undefined) data.status = status;
  return (prisma as any).projectRisk.update({ where: { id }, data });
}

export async function deleteRisk(id: string) {
  return (prisma as any).projectRisk.delete({ where: { id } });
}

export async function archiveProject(orgId: string, id: string) {
  return (prisma as any).project.update({
    where: { id, organizationId: orgId },
    data: { status: 'ARCHIVED' }
  });
}

export async function syncAsana(orgId: string, id: string) {
  const project = await (prisma as any).project.findUnique({ where: { id, organizationId: orgId } });
  if (!project) throw new Error('Project not found');
  // Mocking Asana sync: updating updatedAt
  return (prisma as any).project.update({
    where: { id },
    data: { updatedAt: new Date() }
  });
}

export async function generateAITasks(orgId: string, id: string) {
  const project = await (prisma as any).project.findUnique({ where: { id, organizationId: orgId } });
  if (!project) throw new Error('Project not found');
  
  // Find latest meeting for this project to extract from
  const meeting = await (prisma as any).meeting.findFirst({
    where: { projectId: id, organizationId: orgId, deletedAt: null },
    orderBy: { scheduledTime: 'desc' }
  });

  if (!meeting || !meeting.rawTranscript) {
    // Return empty list if no transcript to extract from
    return [];
  }

  const { extractMeetingData } = require('../../services/ai.service');
  const extracted = await extractMeetingData(meeting.rawTranscript);
  
  const tasks = (extracted.milestones || extracted.tasks || []).map((t: any) => ({
    projectId: id,
    title: t.task || t.title || 'Extracted Task',
    description: `Extracted from meeting: ${meeting.title}`,
    status: 'NOT_STARTED',
    priority: 'MEDIUM'
  }));

  if (tasks.length > 0) {
    await (prisma as any).projectTask.createMany({ data: tasks });
  }

  return tasks;
}


