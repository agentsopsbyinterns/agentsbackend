import { prisma } from '../../prisma/client';

export async function createConversation(orgId: string, userId: string) {
  return (prisma as any).conversation.create({
    data: { organizationId: orgId, createdById: userId }
  });
}

export async function listConversations(orgId: string) {
  return (prisma as any).conversation.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: 'desc' }
  });
}

export async function listMessages(conversationId: string) {
  return (prisma as any).message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' }
  });
}

export async function createMessage(conversationId: string, userId: string | null, role: string, content: string) {
  return (prisma as any).message.create({ data: { conversationId, userId, role, content } });
}
