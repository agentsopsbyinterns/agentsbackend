import { z } from 'zod';

export const createMeetingSchema = z.object({
  title: z.string().min(1),
  agenda: z.string().optional(),
  scheduledTime: z.string().transform((v) => new Date(v)),
  meetingLink: z.string().url().optional(),
  projectId: z.string().min(1, "projectId required"),
  attendees: z.array(z.string().email()).optional()
});

export const rescheduleSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Invalid time format (HH:MM)")
});

export const reviewSchema = z.object({
  text: z.string().min(1),
  assignee: z.string().optional(),
  dueDate: z.string().optional()
});

export const addAttendeeSchema = z.object({
  email: z.string().email()
});

export type CreateMeetingInput = z.infer<typeof createMeetingSchema>;
export type RescheduleInput = z.infer<typeof rescheduleSchema>;
export type ReviewInput = z.infer<typeof reviewSchema>;
export type AddAttendeeInput = z.infer<typeof addAttendeeSchema>;
