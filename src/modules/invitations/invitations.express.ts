import express from 'express';
import type { Request, Response } from 'express-serve-static-core';

const invitationsRouter = express.Router();

invitationsRouter.post('/invite', async (req: Request, res: Response) => {
  const { emails } = req.body || {};
  if (!emails || !Array.isArray(emails)) {
    return res.status(400).json({
      success: false,
      message: 'Emails array required',
    });
  }
  console.log('Invite emails received:', emails);
  return res.status(200).json({
    success: true,
    message: 'Invitations endpoint working',
  });
});

export default invitationsRouter;
