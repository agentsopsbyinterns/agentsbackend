import { env } from '../../config/env';

type MailOptions = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
};

export async function sendMail(options: MailOptions) {
  const from = options.from || env.SMTP_FROM || 'no-reply@example.com';

  // Try Resend first only if API key is present and module is available
  if (env.RESEND_API_KEY) {
    try {
      const dynamicImport = new Function('p', 'return import(p)');
      const mod: any = await (dynamicImport as any)('resend');
      const Resend = mod?.Resend;
      const resend = new Resend(env.RESEND_API_KEY);
      const { data, error } = await resend.emails.send({
        from,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text
      } as any);
      if (error) {
        console.warn('[mailer] Resend send failed, falling back to SMTP:', error?.message);
      } else {
        return data;
      }
    } catch (e: any) {
      // Module missing or other error — fall back to nodemailer
      console.warn('[mailer] Resend not available, falling back to SMTP:', e?.message);
    }
  }

  // Fallback: Nodemailer SMTP or JSON transport
  const nodemailer = await import('nodemailer');
  let transport: any;
  if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) {
    transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT ? Number(env.SMTP_PORT) : 587,
      secure: Number(env.SMTP_PORT) === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS }
    } as any);
  } else {
    // Dev/logging transport
    transport = nodemailer.createTransport({ jsonTransport: true } as any);
  }
  const info = await transport.sendMail({
    from,
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text
  });
  return info;
}
