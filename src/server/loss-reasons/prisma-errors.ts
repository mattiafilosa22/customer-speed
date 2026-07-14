/**
 * Narrows an unknown error to a specific Prisma error code (e.g. `P2002` unique
 * violation, `P2025` record-not-found), without importing the Prisma runtime
 * class (mirrors `src/server/admin/update-organization.ts`'s helper). Kept here
 * as the single spot both mutation use cases (`create`/`update`) check against.
 */
export function isPrismaErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}
