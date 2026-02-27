import { z } from 'zod';

export const createMeetingSchema = z.object({
  title: z.string().min(1),
  agenda: z.string().optional(),
  scheduledTime: z.string().transform((v) => new Date(v)),
  meetingLink: z.string().url().optional()
});

export const rescheduleSchema = z.object({
  scheduledTime: z.string().transform((v) => new Date(v))
});

export const reviewSchema = z.object({
  text: z.string().min(1),
  assignee: z.string().optional(),
  dueDate: z.string().optional()
});

export type CreateMeetingInput = z.infer<typeof createMeetingSchema>;
export type RescheduleInput = z.infer<typeof rescheduleSchema>;
export type ReviewInput = z.infer<typeof reviewSchema>;
