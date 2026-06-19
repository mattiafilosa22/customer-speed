-- Fase 7 — Pannello white-label "Aspetto & brand".
-- Organization: asset di brand per il pannello (docs/05 §5.4).
--   logoUrl/faviconUrl: per ora data URL (PNG/SVG) in TEXT (nessun blob storage
--     in questa fase; TODO infra: object storage + solo URL).
--   markFallback: sigla testuale fallback (max 3 char, validato in Zod).
--   poweredBy: mostra/nasconde la dicitura "powered by".
-- I controlli tema/componenti (radius, buttonStyle, density, softShadows) vivono
-- nel JSON `theme` esistente — nessuna colonna nuova per quelli.

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "logoUrl" TEXT;
ALTER TABLE "Organization" ADD COLUMN "markFallback" TEXT;
ALTER TABLE "Organization" ADD COLUMN "faviconUrl" TEXT;
ALTER TABLE "Organization" ADD COLUMN "poweredBy" BOOLEAN NOT NULL DEFAULT true;
