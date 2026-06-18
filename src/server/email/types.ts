/**
 * Email port (abstraction). Auth use cases depend on `EmailSender`, not on a
 * concrete provider (Dependency Inversion, docs/00 §1). Implementations: Resend
 * (prod) and a logging sender (dev/test).
 */

export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  /** Plain-text body. HTML can be added per-template later. */
  readonly text: string;
  readonly html?: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}
