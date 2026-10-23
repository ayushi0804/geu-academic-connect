import nodemailer from 'nodemailer';
import { env } from '../config/env';
import { logger } from '../config/logger';

const transport = env.SMTP_HOST
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    })
  : null;

export const emailEnabled = !!transport;

/** Returns true only if an email was actually handed to the SMTP server. */
export async function sendMail(to: string, subject: string, text: string): Promise<boolean> {
  if (!transport) return false;
  try {
    await transport.sendMail({ from: env.SMTP_FROM || env.SMTP_USER, to, subject, text });
    return true;
  } catch (err) {
    logger.error({ err }, 'Email delivery failed');
    return false;
  }
}
