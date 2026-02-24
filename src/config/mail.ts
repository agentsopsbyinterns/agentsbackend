<<<<<<< HEAD
import { env } from './env.js';
=======
import { env } from './env';
>>>>>>> origin/main
import nodemailer from 'nodemailer';

export function createTransport() {
  const hasCreds = !!(env.SMTP_HOST && env.SMTP_PORT);
  if (!hasCreds) {
    return nodemailer.createTransport({ jsonTransport: true });
  }
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER && env.SMTP_PASS ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined
  });
}

export const defaultFrom = env.SMTP_FROM || 'no-reply@example.com';
