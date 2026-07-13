-- Composite index for kanban (organizationId, stage) queries + retention
-- purge candidate selection (organizationId, stage=LOST, stageChangedAt aged
-- past the tenant's retention window). Replaces the narrower
-- (organizationId, stage) index: its prefix still covers equality-only
-- lookups, so no redundant index is kept.
DROP INDEX "Lead_organizationId_stage_idx";

CREATE INDEX "Lead_organizationId_stage_stageChangedAt_idx" ON "Lead"("organizationId", "stage", "stageChangedAt");
