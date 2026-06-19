import type { HttpClient, HttpRequest, HttpResponse } from "@/server/calendar/http-client";

/**
 * Test double for the {@link HttpClient} port. Records every request and replies
 * from a programmable queue/handler — NO real network. Shared by the provider
 * tests so they assert URLs/headers/bodies + drive responses deterministically.
 */

export interface FakeResponse {
  readonly status?: number;
  readonly body?: string;
}

export interface FakeHttpClient extends HttpClient {
  readonly calls: HttpRequest[];
}

function toResponse(res: FakeResponse): HttpResponse {
  const status = res.status ?? 200;
  return {
    status,
    ok: status >= 200 && status < 300,
    text: () => Promise.resolve(res.body ?? ""),
  };
}

/**
 * Build a fake client driven by a handler. The handler receives the request and
 * the call index and returns a {@link FakeResponse}. Throwing inside is allowed
 * to simulate transport errors.
 */
export function createFakeHttp(
  handler: (req: HttpRequest, index: number) => FakeResponse,
): FakeHttpClient {
  const calls: HttpRequest[] = [];
  return {
    calls,
    request(req: HttpRequest): Promise<HttpResponse> {
      const index = calls.length;
      calls.push(req);
      return Promise.resolve(toResponse(handler(req, index)));
    },
  };
}

/** Convenience: a client that returns the same JSON body for every call. */
export function jsonHttp(body: unknown, status = 200): FakeHttpClient {
  return createFakeHttp(() => ({ status, body: JSON.stringify(body) }));
}

/** Convenience: a client that replays a fixed sequence of responses in order. */
export function sequenceHttp(responses: FakeResponse[]): FakeHttpClient {
  return createFakeHttp((_req, index) => responses[index] ?? { status: 500, body: "{}" });
}
