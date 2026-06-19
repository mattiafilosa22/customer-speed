import type { CalendarConnectionStore, DecryptedConnection } from "@/server/calendar/connection-store";
import type { CalendarProvider } from "@/server/calendar/provider";

/**
 * Resolve a VALID access token for a connection, refreshing it transparently
 * when it is expired (or about to expire).
 *
 * Refresh flow (docs/08 Fase 6 "refresh automatico su scadenza"):
 *  1. if the token has no expiry or is still comfortably valid → use as-is;
 *  2. otherwise, if the provider supports refresh AND we hold a refresh token →
 *     call `refreshTokens`, PERSIST the new (re-encrypted) tokens, and return
 *     the fresh access token;
 *  3. if no refresh is possible → return the existing token (the upstream call
 *     will 401 and the connection is effectively stale; the UI can prompt a
 *     reconnect).
 *
 * The refreshed tokens are written back through the store, so they are
 * re-encrypted at rest — a refresh never leaks plaintext to the DB.
 */

/** Refresh when fewer than this many ms remain (avoids mid-call expiry). */
const EXPIRY_SKEW_MS = 60_000;

export async function getValidAccessToken(
  provider: CalendarProvider,
  store: CalendarConnectionStore,
  connection: DecryptedConnection,
  now: Date = new Date(),
): Promise<string> {
  const expiresAt = connection.expiresAt;
  const stillValid = !expiresAt || expiresAt.getTime() - now.getTime() > EXPIRY_SKEW_MS;
  if (stillValid) {
    return connection.accessToken;
  }

  if (provider.refreshTokens && connection.refreshToken) {
    const refreshed = await provider.refreshTokens(connection.refreshToken);
    await store.updateTokens(connection.id, refreshed);
    return refreshed.accessToken;
  }

  // No refresh capability/token: hand back what we have; the upstream call will
  // surface the 401 and the connection should be re-authorized.
  return connection.accessToken;
}
