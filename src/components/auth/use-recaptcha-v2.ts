"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import "@/components/auth/recaptcha-types";

/**
 * reCAPTCHA v2 (checkbox "I'm not a robot") client integration — the FALLBACK
 * rendered when the v3 score is low and the server replies `recaptchaV2Required`
 * (docs/06 §6.2).
 *
 * Coexistence with v3: both versions share `window.grecaptcha`, but v2 needs the
 * `render=explicit` flavour of the script (a `grecaptcha.render(container, …)`
 * call) while v3 loads with `render=<v3SiteKey>`. We therefore load a SEPARATE,
 * explicitly-rendered script (id `recaptcha-v2`) and wait for the API via
 * `grecaptcha.ready` before rendering exactly once into the given container.
 *
 * Degrades gracefully: with no `NEXT_PUBLIC_RECAPTCHA_V2_SITE_KEY` the hook is
 * disabled (`enabled: false`) and renders nothing — callers must guard on it.
 * `getResponse()` returns the current widget token (or null), `reset()` clears it
 * so the user can re-challenge after a server-side rejection.
 */

const SCRIPT_ID = "recaptcha-v2";

function v2SiteKey(): string | undefined {
  const key = process.env.NEXT_PUBLIC_RECAPTCHA_V2_SITE_KEY;
  return key && key.length > 0 ? key : undefined;
}

export interface UseRecaptchaV2 {
  readonly enabled: boolean;
  /** Attach to the container that should host the checkbox widget. */
  readonly containerRef: React.RefObject<HTMLDivElement | null>;
  /** Current widget response token (empty string / null when unsolved). */
  getResponse: () => string | null;
  /** Clear the widget so the user can solve it again. */
  reset: () => void;
}

/**
 * @param active when false the hook does not load the script or render the
 *   widget (the v2 challenge is only needed after a low-score response).
 */
export function useRecaptchaV2(active: boolean): UseRecaptchaV2 {
  const key = v2SiteKey();
  const enabled = Boolean(key);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<number | null>(null);
  const [apiReady, setApiReady] = useState(false);

  // Load the explicit-render script once, only when the widget is actually needed.
  useEffect(() => {
    if (!key || !active) return;

    const onReady = () => {
      const g = window.grecaptcha;
      if (g?.ready) g.ready(() => setApiReady(true));
      else setApiReady(true);
    };

    // If the API object is already on `window` (e.g. the script loaded earlier,
    // or v3's script already populated it), use it immediately.
    if (window.grecaptcha?.render) {
      onReady();
      return;
    }

    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      existing.addEventListener("load", onReady, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = "https://www.google.com/recaptcha/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.addEventListener("load", onReady, { once: true });
    document.head.appendChild(script);

    // The grecaptcha API attaches asynchronously after the script executes; the
    // `load` event is the primary trigger, but poll as a resilient fallback for
    // environments where the load event does not fire (and to surface the API as
    // soon as it appears). Cleared on unmount.
    const poll = window.setInterval(() => {
      if (window.grecaptcha?.render) {
        window.clearInterval(poll);
        onReady();
      }
    }, 200);
    return () => window.clearInterval(poll);
  }, [key, active]);

  // Render the widget once the API is ready and the container is mounted.
  useEffect(() => {
    if (!key || !active || !apiReady) return;
    const container = containerRef.current;
    const render = window.grecaptcha?.render;
    if (!container || !render || widgetIdRef.current !== null) return;
    widgetIdRef.current = render(container, { sitekey: key });
  }, [key, active, apiReady]);

  const getResponse = useCallback((): string | null => {
    const g = window.grecaptcha;
    if (!g?.getResponse || widgetIdRef.current === null) return null;
    const token = g.getResponse(widgetIdRef.current);
    return token && token.length > 0 ? token : null;
  }, []);

  const reset = useCallback((): void => {
    const g = window.grecaptcha;
    if (g?.reset && widgetIdRef.current !== null) g.reset(widgetIdRef.current);
  }, []);

  return { enabled, containerRef, getResponse, reset };
}
