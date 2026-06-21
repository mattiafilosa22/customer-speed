/**
 * Single source of truth for the SHARED `window.grecaptcha` global. Both the v3
 * (invisible, score-based) and v2 (explicit checkbox) hooks read the same global
 * object — declaring it once here avoids conflicting `declare global` blocks and
 * keeps the union of methods both versions use (docs/06 §6.2).
 *
 * All methods are optional because the object is populated asynchronously by
 * Google's script: at any moment a given method may not yet be present.
 */
export interface GrecaptchaApi {
  ready?(cb: () => void): void;
  /** v3 — invisible execution returning a fresh token for an action. */
  execute?(siteKey: string, options: { action: string }): Promise<string>;
  /** v2 — explicit render of the checkbox widget; returns a widget id. */
  render?(
    container: HTMLElement,
    params: {
      sitekey: string;
      callback?: (token: string) => void;
      "expired-callback"?: () => void;
    },
  ): number;
  /** v2 — current widget response token. */
  getResponse?(widgetId?: number): string;
  /** v2 — clear the widget so it can be solved again. */
  reset?(widgetId?: number): void;
}

declare global {
  interface Window {
    grecaptcha?: GrecaptchaApi;
  }
}
