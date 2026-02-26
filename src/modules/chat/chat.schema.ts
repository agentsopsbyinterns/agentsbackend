import { z } from 'zod';

export const createConversationSchema = z.object({});
export const sendMessageSchema = z.object({
  content: z.string().min(1)
});
