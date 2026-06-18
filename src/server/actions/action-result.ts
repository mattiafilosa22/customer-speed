import { ForbiddenError } from "@/lib/rbac";
import {
  ConflictError,
  RateLimitedError,
  UnauthorizedError,
  ValidationError,
} from "@/lib/errors";

/**
 * Shared shape for Server Action results consumed by client forms via
 * `useActionState` (docs/00 §1 — UI talks to Server Actions, never to use cases
 * or Prisma directly).
 *
 * Errors are returned as STABLE i18n message KEYS (not localized strings): the
 * server layer must not import the message catalogues, and the client localizes
 * via next-intl. Field errors are keyed by form field name and carry message
 * keys too, so the form can wire them to `aria-describedby` per field.
 *
 * `status: "error"` plus `formError` is intentionally NON-REVEALING for the
 * sensitive flows (login/forgot): the caller maps every credential failure to a
 * single generic key, so an attacker cannot enumerate accounts (docs/06 §6.1).
 */
export type ActionState =
  | { status: "idle" }
  | { status: "success"; messageKey?: string }
  | {
      status: "error";
      /** Global, form-level error message key (e.g. "errors.invalidCredentials"). */
      formError?: string;
      /** Per-field message keys, keyed by the form field name. */
      fieldErrors?: Record<string, string>;
    };

/** Convenience constructors keep call sites terse and consistent. */
export const ok = (messageKey?: string): ActionState => ({
  status: "success",
  ...(messageKey ? { messageKey } : {}),
});

export const fail = (
  formError?: string,
  fieldErrors?: Record<string, string>,
): ActionState => ({
  status: "error",
  ...(formError ? { formError } : {}),
  ...(fieldErrors ? { fieldErrors } : {}),
});

/**
 * Map a thrown domain error to an `ActionState`, using the provided i18n keys.
 *
 * Field-level Zod issues are flattened to ONE message key per field
 * (`fieldErrorKey(field)`), so the UI never renders raw English Zod text — the
 * specific reason stays generic and localized. Unknown errors fall back to a
 * generic key and are NOT rethrown (so the form degrades gracefully) but are
 * logged for diagnosis.
 */
export interface ErrorKeyMap {
  /** Generic, non-revealing message for unauthorized/credential failures. */
  readonly unauthorized: string;
  /** Generic message for conflicts (e.g. registration could not complete). */
  readonly conflict: string;
  /** Message for rate limiting. */
  readonly rateLimited: string;
  /** Fallback for unexpected errors. */
  readonly generic: string;
  /** Maps a field name to its generic invalid-field message key. */
  readonly fieldErrorKey: (field: string) => string;
}

export function toActionState(error: unknown, keys: ErrorKeyMap): ActionState {
  if (error instanceof ValidationError) {
    const fieldErrors: Record<string, string> = {};
    for (const field of Object.keys(error.issues)) {
      fieldErrors[field] = keys.fieldErrorKey(field);
    }
    return fail(undefined, fieldErrors);
  }
  if (error instanceof UnauthorizedError) {
    return fail(keys.unauthorized);
  }
  if (error instanceof ForbiddenError) {
    return fail(keys.unauthorized);
  }
  if (error instanceof ConflictError) {
    return fail(keys.conflict);
  }
  if (error instanceof RateLimitedError) {
    return fail(keys.rateLimited);
  }
  // Unexpected: log server-side, surface a generic message to the user.
  console.error("[action] unexpected error", error);
  return fail(keys.generic);
}
