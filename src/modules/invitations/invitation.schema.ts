import { z } from 'zod';

export const inviteTeamSchema = z.object({
  emails: z.array(z.string().email()).min(1),
});

export type InviteTeamInput = z.infer<typeof inviteTeamSchema>;
