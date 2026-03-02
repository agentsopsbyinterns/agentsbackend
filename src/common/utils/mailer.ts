import { createTransport, defaultFrom } from '../../config/mail';

const transporter = createTransport();

export async function sendMail(options: { to: string; subject: string; html: string; text?: string; from?: string }) {
  const info = await transporter.sendMail({
    from: options.from || defaultFrom,
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text
  });
  return info;
}
