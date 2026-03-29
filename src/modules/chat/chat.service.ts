import { prisma } from '../../prisma/client.js';
import OpenAI from "openai";
import { env } from "../../config/env.js";
import { badRequest, notFound } from '../../common/errors/api-error.js';

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

export async function askAI(conversationId: string, orgId: string, onChunk: (chunk: string) => void) {
  if (!env.OPENAI_API_KEY) {
    throw new Error("AI Assistant is not configured. Please add OPENAI_API_KEY to your environment.");
  }

  const [messages, projects, meetings] = await Promise.all([
    listMessages(conversationId),
    (prisma as any).project.findMany({ 
      where: { organizationId: orgId, deletedAt: null },
      select: { name: true, client: true, status: true, budgetTotal: true }
    }),
    (prisma as any).meeting.findMany({ 
      where: { organizationId: orgId, deletedAt: null }, 
      take: 5, 
      orderBy: { scheduledTime: 'desc' },
      select: { title: true, scheduledTime: true }
    })
  ]);

  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  
  const context = `
You are the AgentOps AI Assistant. You have access to the user's projects and recent meetings.
Current Projects: ${JSON.stringify(projects.map((p: any) => ({ name: p.name, client: p.client, status: p.status, budget: p.budgetTotal?.toString() || "0" })))}
Recent Meetings: ${JSON.stringify(meetings.map((m: any) => ({ title: m.title, date: m.scheduledTime })))}

Answer the user's questions accurately based on this data. If you don't know something, say so.
`;

  try {
    const response = await openai.chat.completions.create({
      model: env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        { role: "system", content: context },
        ...messages.map((m: any) => ({ 
          role: (m.role === 'assistant' || m.role === 'user' || m.role === 'system') ? m.role : 'user', 
          content: m.content 
        }))
      ],
      stream: true,
    });

    let fullContent = "";
    for await (const chunk of response) {
      const content = chunk.choices[0]?.delta?.content || "";
      if (content) {
        fullContent += content;
        onChunk(content);
      }
    }

    await createMessage(conversationId, null, 'assistant', fullContent);
  } catch (err: any) {
    console.error("OpenAI Error:", err);
    throw new Error(`AI Request failed: ${err.message || "Unknown error"}`);
  }
}
