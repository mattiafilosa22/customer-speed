import type { CalendarProviderType } from "@/generated/prisma/enums";
import type { TokenCipher } from "@/lib/crypto";
import type { OAuthTokens } from "@/server/calendar/provider";

/**
 * Persistence port for `CalendarConnection` (docs/03, docs/06 §6.4).
 *
 * The store is the ONLY place that touches the encrypted token columns. Tokens
 * are encrypted with the injected {@link TokenCipher} (AES-256-GCM) on the way IN
 * and decrypted on the way OUT — so plaintext tokens never hit the DB and the
 * decrypted form lives only in memory for the duration of a sync call. Nothing
 * else in the app may read `accessToken`/`refreshToken` directly.
 *
 * Tenant isolation: the store operates on the TENANT-SCOPED Prisma client and
 * always scopes by the SERVER-resolved `userId` (a connection is per-user). A
 * webhook lookup additionally narrows by `providerAccountId` so an inbound event
 * maps to a connection WE own — never to a tenant chosen by the payload.
 */

/** A connection with DECRYPTED tokens, for in-process sync use only. Never serialized to the client. */
export interface DecryptedConnection {
  readonly id: string;
  readonly organizationId: string;
  readonly userId: string;
  readonly provider: CalendarProviderType;
  readonly accessToken: string;
  readonly refreshToken: string | null;
  readonly expiresAt: Date | null;
  readonly scope: string | null;
  readonly providerAccountId: string | null;
}

/** Minimal Prisma surface the store needs (eases faking in tests). */
export interface ConnectionPrisma {
  calendarConnection: {
    upsert(args: unknown): Promise<{ id: string }>;
    findUnique(args: unknown): Promise<RawConnection | null>;
    findMany(args: unknown): Promise<RawConnection[]>;
    update(args: unknown): Promise<{ id: string }>;
    delete(args: unknown): Promise<{ id: string }>;
  };
}

interface RawConnection {
  id: string;
  organizationId: string;
  userId: string;
  provider: CalendarProviderType;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scope: string | null;
  providerAccountId: string | null;
}

export interface SaveConnectionInput {
  readonly userId: string;
  readonly provider: CalendarProviderType;
  readonly tokens: OAuthTokens;
  readonly providerAccountId?: string | null;
}

export interface CalendarConnectionStore {
  /** Upsert the per-user connection, encrypting tokens at rest. */
  save(input: SaveConnectionInput): Promise<{ id: string }>;
  /** Load + decrypt the current user's connection for a provider, or null. */
  getForUser(
    userId: string,
    provider: CalendarProviderType,
  ): Promise<DecryptedConnection | null>;
  /**
   * Load + decrypt the connection that OWNS an inbound webhook, identified by
   * the provider account id. The lookup is NOT tenant-scoped by the payload —
   * it is scoped by `(provider, providerAccountId)` against connections that
   * exist in OUR DB, so the connection's own `organizationId` is authoritative.
   */
  getByProviderAccount(
    provider: CalendarProviderType,
    providerAccountId: string,
  ): Promise<DecryptedConnection | null>;
  /** Persist refreshed tokens for an existing connection. */
  updateTokens(connectionId: string, tokens: OAuthTokens): Promise<void>;
  /** Remove the current user's connection for a provider (disconnect). */
  remove(userId: string, provider: CalendarProviderType): Promise<void>;
}

function decrypt(cipher: TokenCipher, raw: RawConnection): DecryptedConnection {
  return {
    id: raw.id,
    organizationId: raw.organizationId,
    userId: raw.userId,
    provider: raw.provider,
    accessToken: cipher.decrypt(raw.accessToken),
    refreshToken: raw.refreshToken ? cipher.decrypt(raw.refreshToken) : null,
    expiresAt: raw.expiresAt,
    scope: raw.scope,
    providerAccountId: raw.providerAccountId,
  };
}

const CONNECTION_SELECT = {
  id: true,
  organizationId: true,
  userId: true,
  provider: true,
  accessToken: true,
  refreshToken: true,
  expiresAt: true,
  scope: true,
  providerAccountId: true,
} as const;

/**
 * Build a {@link CalendarConnectionStore}. `tenantPrisma` MUST be the
 * tenant-scoped client (so writes/reads are forced to the tenant) EXCEPT for
 * {@link CalendarConnectionStore.getByProviderAccount}, which needs the BASE
 * client because the webhook arrives WITHOUT an authenticated tenant context —
 * the connection row itself carries the authoritative tenant. The webhook
 * handler passes the base client only for that call (see webhook handler).
 */
export function createConnectionStore(
  prisma: ConnectionPrisma,
  cipher: TokenCipher,
): CalendarConnectionStore {
  return {
    async save(input): Promise<{ id: string }> {
      const data = {
        provider: input.provider,
        accessToken: cipher.encrypt(input.tokens.accessToken),
        refreshToken: input.tokens.refreshToken
          ? cipher.encrypt(input.tokens.refreshToken)
          : null,
        expiresAt: input.tokens.expiresAt ?? null,
        scope: input.tokens.scope ?? null,
        providerAccountId: input.providerAccountId ?? null,
      };
      return prisma.calendarConnection.upsert({
        where: { userId_provider: { userId: input.userId, provider: input.provider } },
        // organizationId/userId are injected by the tenant client on create; we
        // also pass userId so the unique selector + create are consistent.
        create: { userId: input.userId, ...data },
        update: data,
        select: { id: true },
      });
    },

    async getForUser(userId, provider): Promise<DecryptedConnection | null> {
      const raw = await prisma.calendarConnection.findUnique({
        where: { userId_provider: { userId, provider } },
        select: CONNECTION_SELECT,
      });
      return raw ? decrypt(cipher, raw) : null;
    },

    async getByProviderAccount(provider, providerAccountId): Promise<DecryptedConnection | null> {
      // Collision-aware: `(provider, providerAccountId)` is NOT unique (the same
      // upstream account could be connected by two tenants). If more than one
      // row matches we CANNOT safely attribute the webhook to a single tenant, so
      // we refuse (return null) rather than pick one — preventing cross-tenant
      // misattribution. We read two rows to detect ambiguity cheaply.
      const rows = await prisma.calendarConnection.findMany({
        where: { provider, providerAccountId },
        select: CONNECTION_SELECT,
        take: 2,
      });
      if (rows.length !== 1) {
        return null; // none, or ambiguous → do not attribute.
      }
      return decrypt(cipher, rows[0]!);
    },

    async updateTokens(connectionId, tokens): Promise<void> {
      await prisma.calendarConnection.update({
        where: { id: connectionId },
        data: {
          accessToken: cipher.encrypt(tokens.accessToken),
          // Providers sometimes omit a fresh refresh token on refresh; keep the
          // existing one in that case (do not overwrite with null).
          ...(tokens.refreshToken
            ? { refreshToken: cipher.encrypt(tokens.refreshToken) }
            : {}),
          expiresAt: tokens.expiresAt ?? null,
          ...(tokens.scope ? { scope: tokens.scope } : {}),
        },
        select: { id: true },
      });
    },

    async remove(userId, provider): Promise<void> {
      await prisma.calendarConnection
        .delete({
          where: { userId_provider: { userId, provider } },
          select: { id: true },
        })
        .catch(() => {
          // Idempotent disconnect: deleting a non-existent connection is a no-op.
        });
    },
  };
}
