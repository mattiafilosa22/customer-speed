import { env } from "@/lib/env";
import { LoggingEmailSender } from "@/server/email/logging-sender";
import { ResendEmailSender } from "@/server/email/resend-sender";
import type { EmailSender } from "@/server/email/types";

export type { EmailMessage, EmailSender } from "@/server/email/types";
export { LoggingEmailSender } from "@/server/email/logging-sender";
export { ResendEmailSender } from "@/server/email/resend-sender";

/**
 * Factory: returns the Resend sender when `RESEND_API_KEY` is configured,
 * otherwise the logging sender (dev). Keeps provider selection in one place.
 */
export function createEmailSender(): EmailSender {
  if (env.RESEND_API_KEY) {
    return new ResendEmailSender(env.RESEND_API_KEY, env.EMAIL_FROM);
  }
  return new LoggingEmailSender();
}

/** Lazily-created default sender for app code. */
let cached: EmailSender | undefined;
export function getEmailSender(): EmailSender {
  cached ??= createEmailSender();
  return cached;
}
