import nodemailer from 'nodemailer';
import type { Config } from '../config';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/** Sends email. Tests pass their own implementation to capture messages. */
export interface Mailer {
  /** False when no mail server is configured and messages only go to the server log. */
  readonly delivers: boolean;
  send(message: MailMessage): Promise<void>;
  /** Connects to the mail server and signs in without sending anything. */
  verify?(): Promise<void>;
}

/**
 * Picks the mail transport from configuration: SMTP when SMTP_HOST is set, otherwise the server
 * log, so a developer can still use the reset link printed in the terminal.
 */
export function createMailer(config: Config): Mailer {
  if (!config.SMTP_HOST) {
    return {
      delivers: false,
      async send(message) {
        console.log(
          `[mail] Email is not configured (SMTP_HOST is empty), so this message was not sent.\n` +
            `[mail] To: ${message.to}\n[mail] Subject: ${message.subject}\n${message.text}`,
        );
      },
    };
  }
  const transport = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE === 'true',
    auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined,
  });
  return {
    delivers: true,
    async send(message) {
      await transport.sendMail({ from: config.MAIL_FROM, ...message });
    },
    async verify() {
      await transport.verify();
    },
  };
}
