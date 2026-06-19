/**
 * Injectable HTTP client port (DIP, docs/00 §1).
 *
 * Calendar providers MUST NOT call `fetch` directly: they depend on this small
 * interface so tests inject a deterministic fake (no real network) and so retry/
 * timeout/observability can be layered later without touching provider code.
 *
 * Intentionally minimal (Interface Segregation): just enough to do OAuth token
 * exchange + JSON REST calls against Google/Calendly.
 */

export interface HttpRequest {
  readonly method: "GET" | "POST" | "PATCH" | "DELETE";
  readonly url: string;
  readonly headers?: Readonly<Record<string, string>>;
  /** Already-serialized body (JSON string or `application/x-www-form-urlencoded`). */
  readonly body?: string;
}

export interface HttpResponse {
  readonly status: number;
  readonly ok: boolean;
  /** Raw response text; callers parse JSON themselves (keeps the port tiny). */
  text(): Promise<string>;
}

export interface HttpClient {
  request(req: HttpRequest): Promise<HttpResponse>;
}

/** Raised when a provider's HTTP call returns a non-2xx status. */
export class HttpError extends Error {
  readonly status: number;
  readonly bodySnippet: string;
  constructor(status: number, bodySnippet: string) {
    // Never include credentials in the message; bodySnippet is truncated by callers.
    super(`Upstream HTTP ${status}`);
    this.name = "HttpError";
    this.status = status;
    this.bodySnippet = bodySnippet;
  }
}

/**
 * Default `fetch`-backed client. Edge/Node-safe (uses the global `fetch`). Real
 * network — used in production, never in unit tests.
 */
export function createFetchHttpClient(): HttpClient {
  return {
    async request(req: HttpRequest): Promise<HttpResponse> {
      const res = await fetch(req.url, {
        method: req.method,
        headers: req.headers,
        body: req.body,
        // Server-to-server: no cookies, no caching of token endpoints.
        cache: "no-store",
      });
      return {
        status: res.status,
        ok: res.ok,
        text: () => res.text(),
      };
    },
  };
}

/** Parse a JSON response or throw `HttpError` on non-2xx. Shared by providers. */
export async function readJson<T>(res: HttpResponse): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    throw new HttpError(res.status, text.slice(0, 200));
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(res.status, "Invalid JSON in upstream response");
  }
}
