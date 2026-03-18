import { env } from "../../config/env";

type MailOptions = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
};

export async function sendMail(options: MailOptions) {
  const primaryFrom =
    options.from ||
    (env.SMTP_FROM ? env.SMTP_FROM : undefined) ||
    "AgentOps <noreply@mail.leavecode.co.in>";
  const fallbackResendFrom = "onboarding@resend.dev";

  // 1️⃣ Try Resend first
  if (env.RESEND_API_KEY) {
    try {
      const { Resend } = await import("resend");
      const resend = new Resend(env.RESEND_API_KEY);

      const { data, error } = await resend.emails.send({
        from: primaryFrom,
        to: [options.to],
        subject: options.subject,
        html: options.html,
        text: options.text
      });

      if (!error) {
        return data;
      }

      console.warn("Resend failed, fallback to SMTP:", error?.message);
      // Try Resend once more with a known valid sender for testing
      const secondAttempt = await resend.emails.send({
        from: fallbackResendFrom,
        to: [options.to],
        subject: options.subject,
        html: options.html,
        text: options.text
      });
      if (!(secondAttempt as any)?.error) {
        return (secondAttempt as any)?.data;
      }

    } catch (e) {
      console.warn("Resend error, fallback to SMTP:", e);
    }
  }

  // 2️⃣ SMTP fallback
  const nodemailer = await import("nodemailer");

  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
    throw new Error(
      "SMTP not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS (and SMTP_FROM)."
    );
  }
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT) || 587,
    secure: Number(env.SMTP_PORT) === 465,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS
    }
  });

  try {
    const info = await transport.sendMail({
      from: primaryFrom,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text
    });
    return info;
  } catch (err: any) {
    console.error("SMTP sendMail error:", err?.message || err);
    throw err;
  }
}
