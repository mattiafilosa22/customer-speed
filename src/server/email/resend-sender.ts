import { Resend } from "resend";

import type { EmailMessage, EmailSender } from "@/server/email/types";

/**
 * Resend-backed {@link EmailSender} (production). Thin adapter over the Resend
 * SDK so the rest of the app stays provider-agnostic.
 */
export class ResendEmailSender implements EmailSender {
  private readonly client: Resend;
  private readonly from: string;

  constructor(apiKey: string, from: string) {
    this.client = new Resend(apiKey);
    this.from = from;
  }

  async send(message: EmailMessage): Promise<void> {
    const { error } = await this.client.emails.send({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
    });
    if (error) {
      throw new Error(`Resend failed to send email: ${error.message}`);
    }
  }
}
