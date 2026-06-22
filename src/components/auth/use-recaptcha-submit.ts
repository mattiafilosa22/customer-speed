"use client";

import { useState, useTransition, type FormEvent } from "react";

import { useRecaptcha } from "@/components/auth/use-recaptcha";

/**
 * Bridges async reCAPTCHA v3 token retrieval with a React 19 form action driven
 * by `useActionState`.
 *
 * We intercept submit (always preventDefault), fetch the token, set it on the
 * hidden field, build a FormData snapshot and dispatch `formAction` INSIDE a
 * `startTransition`. Dispatching within a transition is what lets React track
 * the action and follow a redirect it throws (e.g. signIn on login) — a bare
 * call outside a transition does not. When reCAPTCHA is disabled (no site key)
 * `execute` resolves to null and the token stays empty (server verifier no-ops).
 *
 * v2 fallback (docs/06 §6.2): when the server has asked for the checkbox
 * challenge, the form passes `getV2Token` — the current v2 widget response is
 * read synchronously and attached as `recaptchaV2Token` alongside the fresh v3
 * token, so a single resubmit carries both.
 *
 * Pending state: because we preventDefault and dispatch the action MANUALLY,
 * `useFormStatus` never reports pending (it only tracks NATIVE form submissions),
 * so the submit button would look inert during the reCAPTCHA round-trip + server
 * call. We therefore expose our own `pending` flag — true from the click, through
 * the async reCAPTCHA `execute`, and for the whole transition — so the button can
 * show a loader. On success the action throws a redirect and the form unmounts
 * (stays pending until navigation); on error the transition settles → false.
 */
export interface RecaptchaSubmitOptions {
  readonly tokenFieldName?: string;
  /** Reads the current v2 checkbox response (null when unsolved/disabled). */
  readonly getV2Token?: () => string | null;
  readonly v2FieldName?: string;
}

export interface RecaptchaSubmit {
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  /** True from click until the action settles — drive the submit button loader. */
  readonly pending: boolean;
}

export function useRecaptchaSubmit(
  action: string,
  formAction: (formData: FormData) => void,
  options: RecaptchaSubmitOptions = {},
): RecaptchaSubmit {
  const { execute } = useRecaptcha();
  const [isTransitionPending, startTransition] = useTransition();
  // Covers the reCAPTCHA `execute` round-trip, which happens BEFORE the
  // transition starts (so `isTransitionPending` alone would miss it).
  const [isPreparing, setIsPreparing] = useState(false);
  const tokenFieldName = options.tokenFieldName ?? "recaptchaToken";
  const v2FieldName = options.v2FieldName ?? "recaptchaV2Token";
  const getV2Token = options.getV2Token;

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsPreparing(true);
    // Snapshot the form fields SYNCHRONOUSLY, inside the submit user-gesture.
    // WebKit (Safari/iOS) only exposes Keychain/Apple-Passwords autofilled values
    // to script during the gesture that submits the form; reading FormData after
    // the async reCAPTCHA `await` lands in a continuation outside that gesture, so
    // the autofilled email/password come back empty and the login silently fails.
    const data = new FormData(event.currentTarget);
    void execute(action)
      .then((token) => {
        data.set(tokenFieldName, token ?? "");
        if (getV2Token) {
          data.set(v2FieldName, getV2Token() ?? "");
        }
        setIsPreparing(false);
        startTransition(() => formAction(data));
      })
      .catch(() => setIsPreparing(false));
  };

  return { onSubmit, pending: isPreparing || isTransitionPending };
}
