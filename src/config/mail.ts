import { Resend } from "resend";
import { env } from "./env";

const resend = new Resend(env.RESEND_API_KEY);

export async function sendMail(options: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
}) {
  const { data, error } = await resend.emails.send({
    from: "onboarding@resend.dev",
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}