type DatabaseUrlSource = {
  readonly [key: string]: string | undefined;
};

/**
 * Supabase's shared pooler uses the same host for session and transaction
 * modes; the port selects the mode. Runtime traffic is moved from 5432 to 6543
 * so short-lived serverless requests share backend connections efficiently.
 */
export function resolveRuntimeDatabaseUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  const isSupabaseSharedPooler = url.hostname.endsWith(".pooler.supabase.com");

  if (!isSupabaseSharedPooler || url.port !== "5432") {
    return databaseUrl;
  }

  url.port = "6543";
  url.searchParams.set("pgbouncer", "true");
  return url.toString();
}

/**
 * Prisma CLI operations need a session/direct connection, while the deployed
 * application can use a transaction pooler. Local development keeps working
 * with only DATABASE_URL configured.
 */
export function resolveMigrationDatabaseUrl(source: DatabaseUrlSource): string {
  const url = source.DIRECT_URL?.trim() || source.DATABASE_URL?.trim();

  if (!url) {
    throw new Error("DIRECT_URL or DATABASE_URL is required for Prisma CLI operations.");
  }

  return url;
}
