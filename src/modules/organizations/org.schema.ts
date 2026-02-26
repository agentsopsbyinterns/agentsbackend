import { z } from 'zod';

export const createOrgSchema = z.object({
  name: z.string().min(1)
});

export const inviteSchema = z.object({
  email: z.string().email()
});

export type CreateOrgInput = z.infer<typeof createOrgSchema>;
export type InviteInput = z.infer<typeof inviteSchema>;
