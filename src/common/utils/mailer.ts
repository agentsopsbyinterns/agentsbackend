import { Resend } from 'resend';
import { env } from '../../config/env';

const resend = new Resend(env.RESEND_API_KEY);

export async function sendMail(options: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}) {
  const response = await resend.emails.send({
    from: 'onboarding@resend.dev', // testing sender
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text,
  });

  return response;
}