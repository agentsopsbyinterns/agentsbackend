import { z } from 'zod';

export const bulkCreateTasksSchema = z.object({
  projectId: z.string(),
  meetingId: z.string().optional(),
  tasks: z.array(z.object({
    title: z.string(),
    assignee: z.string().optional(),
    priority: z.string().optional(),
    dueDate: z.string().optional(),
    status: z.string().optional(),
  }))
});
