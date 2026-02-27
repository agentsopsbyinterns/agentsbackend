import express from 'express';
import type { Request, Response } from 'express-serve-static-core';
import { sendMail } from '../common/utils/mailer';
import { env } from '../config/env';
import { generateRandomToken } from '../common/utils/tokens';

const invitationsRouter = express.Router();

invitationsRouter.post('/invite', async (req: Request, res: Response) => {
  console.log('INVITE ROUTE HIT');
  const { emails } = (req.body as any) || {};
  if (!Array.isArray(emails) || emails.length === 0) {
    return res.status(400).json({ success: false, message: 'Emails array required' });
  }
  const validEmails = emails.filter((e: unknown) => typeof e === 'string' && e.includes('@'));
  if (validEmails.length === 0) {
    return res.status(400).json({ success: false, message: 'No valid emails provided' });
  }
  const results: Array<{ email: string; sent: boolean; error?: string }> = [];
  for (const email of validEmails) {
    try {
      const token = generateRandomToken(24);
      const link = `${env.APP_URL}/accept-invite?token=${encodeURIComponent(token)}`;
      await sendMail({
        to: email,
        subject: "You're invited to AgentOps",
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.5;">
            <h2>You're invited to AgentOps</h2>
            <p>You have been invited to join the AgentOps workspace.</p>
            <p><a href="${link}" style="display:inline-block;padding:10px 16px;background:#4f46e5;color:#fff;border-radius:6px;text-decoration:none;">Accept Invite</a></p>
            <p>If the button does not work, copy and paste this link:</p>
            <p>${link}</p>
          </div>
        `
      });
      console.log(`Invite email sent to ${email}`);
      results.push({ email, sent: true });
    } catch (err: any) {
      console.error(`Invite email failed for ${email}:`, err?.message || err);
      results.push({ email, sent: false, error: err?.message || 'send failed' });
    }
  }
  return res.status(200).json({ success: true, invited: results.length, results });
});

export default invitationsRouter;
