import { z } from 'zod';

export const createOrgSchema = z.object({
  name: z.string().min(1)
});

export const inviteSchema = z.object({
  email: z.string().email()
});

export const bulkInviteSchema = z.object({
  emails: z.array(z.string().email()).min(1)
});

export type CreateOrgInput = z.infer<typeof createOrgSchema>;
export type InviteInput = z.infer<typeof inviteSchema>;
export type BulkInviteInput = z.infer<typeof bulkInviteSchema>;
