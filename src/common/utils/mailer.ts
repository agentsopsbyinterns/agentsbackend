import { env } from "../../config/env";

type MailOptions = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
};

export async function sendMail(options: MailOptions) {

  const from = options.from || "AgentOps <noreply@mail.leavecode.co.in>";

  // 1️⃣ Try Resend first
  if (env.RESEND_API_KEY) {
    try {
      const { Resend } = await import("resend");
      const resend = new Resend(env.RESEND_API_KEY);

      const { data, error } = await resend.emails.send({
        from,
        to: [options.to],
        subject: options.subject,
        html: options.html,
        text: options.text
      });

      if (!error) {
        return data;
      }

      console.warn("Resend failed, fallback to SMTP:", error?.message);

    } catch (e) {
      console.warn("Resend error, fallback to SMTP:", e);
    }
  }

  // 2️⃣ SMTP fallback
  const nodemailer = await import("nodemailer");

  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT) || 587,
    secure: Number(env.SMTP_PORT) === 465,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS
    }
  });

  const info = await transport.sendMail({
    from,
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text
  });

  return info;
}