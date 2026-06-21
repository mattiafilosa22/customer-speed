"use client";

import { useCallback, useEffect, useRef } from "react";

import "@/components/auth/recaptcha-types";

/**
 * reCAPTCHA v3 client integration (docs/06 §6.2).
 *
 * - Loads Google's script ONCE, and ONLY when a public site key is configured
 *   (`NEXT_PUBLIC_RECAPTCHA_SITE_KEY`). With no key it degrades gracefully:
 *   `execute()` resolves to `null` and the server verifier returns "skipped",
 *   so local dev works without Google keys.
 * - `execute(action)` returns a fresh token (or null), to be sent with the form
 *   and verified server-side. The token is short-lived and single-use.
 *
 * Privacy (docs/09 §9.3): the script is a Google third-party resource. It is the
 * minimum needed to operate the security control on auth forms; its use is
 * declared in the cookie/privacy policy. It is loaded on the auth pages only.
 */

const SCRIPT_ID = "recaptcha-v3";

function siteKey(): string | undefined {
  const key = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
  return key && key.length > 0 ? key : undefined;
}

export function useRecaptcha(): {
  readonly enabled: boolean;
  execute: (action: string) => Promise<string | null>;
} {
  const key = siteKey();
  const enabled = Boolean(key);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!key || loadedRef.current) return;
    if (document.getElementById(SCRIPT_ID)) {
      loadedRef.current = true;
      return;
    }
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(key)}`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
    loadedRef.current = true;
  }, [key]);

  const execute = useCallback(
    async (action: string): Promise<string | null> => {
      const grecaptcha = window.grecaptcha;
      if (!key || typeof window === "undefined" || !grecaptcha?.ready || !grecaptcha.execute) {
        return null;
      }
      const { ready, execute: run } = grecaptcha;
      return new Promise<string | null>((resolve) => {
        ready(() => {
          run(key, { action })
            .then((token) => resolve(token))
            .catch(() => resolve(null));
        });
      });
    },
    [key],
  );

  return { enabled, execute };
}
