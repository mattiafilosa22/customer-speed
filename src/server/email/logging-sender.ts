import type { EmailMessage, EmailSender } from "@/server/email/types";

/**
 * Development/test email sender: logs the message instead of delivering it.
 * Never used in production (the factory selects Resend when configured).
 *
 * It records sent messages so tests can assert on them (e.g. that a reset link
 * was generated) without a real provider.
 */
export class LoggingEmailSender implements EmailSender {
  readonly sent: EmailMessage[] = [];
  private readonly logger: Pick<typeof console, "info">;

  constructor(logger: Pick<typeof console, "info"> = console) {
    this.logger = logger;
  }

  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
    this.logger.info(
      `[email:dev] to=${message.to} subject=${JSON.stringify(message.subject)}\n${message.text}`,
    );
  }
}
