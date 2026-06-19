import type { AuditEvent } from "@/server/audit/audit-log";
import type { OrganizationDeps } from "@/server/organization/deps";

/**
 * In-memory fake of the minimal Prisma `organization` surface the white-label
 * use cases need, plus an audit recorder. Keeps the use-case tests DB-free and
 * focused on behaviour + tenant isolation. The fake faithfully enforces the
 * `where: { id }` scoping so a cross-tenant write is observable (it simply does
 * not match a row of another org).
 */
export interface FakeOrgRow {
  id: string;
  appName: string;
  theme: unknown;
  logoUrl: string | null;
  faviconUrl: string | null;
  markFallback: string | null;
  poweredBy: boolean;
  [key: string]: unknown;
}

export class OrganizationStore {
  private readonly rows = new Map<string, FakeOrgRow>();

  seed(row: Partial<FakeOrgRow> & { id: string }): FakeOrgRow {
    const full: FakeOrgRow = {
      appName: "App",
      theme: {},
      logoUrl: null,
      faviconUrl: null,
      markFallback: null,
      poweredBy: true,
      ...row,
    };
    this.rows.set(full.id, full);
    return full;
  }

  get(id: string): FakeOrgRow | undefined {
    return this.rows.get(id);
  }

  /** A Prisma-shaped `organization` delegate (only the methods we use). */
  get delegate(): OrganizationDeps["prisma"]["organization"] {
    const rows = this.rows;
    return {
      findUnique: async ({ where, select }: { where: { id: string }; select?: Record<string, boolean> }) => {
        const row = rows.get(where.id);
        if (!row) return null;
        if (!select) return row;
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(select)) out[key] = (row as Record<string, unknown>)[key];
        return out;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = rows.get(where.id);
        if (!row) {
          // Mirror Prisma: updating a non-matching row throws.
          throw new Error("Record to update not found.");
        }
        for (const [key, value] of Object.entries(data)) {
          if (value !== undefined) (row as Record<string, unknown>)[key] = value;
        }
        return row;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial Prisma surface for tests
    } as any;
  }
}

export function buildFakeOrganizationDeps(
  store: OrganizationStore,
  organizationId: string,
  userId = "user_1",
): { deps: OrganizationDeps; audits: AuditEvent[] } {
  const audits: AuditEvent[] = [];
  const deps: OrganizationDeps = {
    prisma: { organization: store.delegate },
    audit: {
      record: async (event: AuditEvent) => {
        audits.push(event);
      },
    },
    actor: { organizationId, userId },
  };
  return { deps, audits };
}
