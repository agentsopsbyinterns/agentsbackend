import { z } from 'zod';

export const createProjectSchema = z.object({
  name: z.string().min(1),
  client: z.string().optional(),
  dueDate: z.string().optional()
});
