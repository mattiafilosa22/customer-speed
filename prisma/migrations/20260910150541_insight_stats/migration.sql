-- CreateEnum
CREATE TYPE "ChatChannel" AS ENUM ('WELCOME', 'OUTBOUND_COMMENT', 'OUTBOUND_STORY', 'INBOUND');

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "chatChannel" "ChatChannel",
ADD COLUMN     "createdFromInsight" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "insightActiveFrom" DATE,
ADD COLUMN     "insightSourceId" TEXT;

-- CreateTable
CREATE TABLE "ChatActivityDay" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "welcomeSent" INTEGER NOT NULL DEFAULT 0,
    "welcomeReplies" INTEGER NOT NULL DEFAULT 0,
    "outboundComments" INTEGER NOT NULL DEFAULT 0,
    "outboundStories" INTEGER NOT NULL DEFAULT 0,
    "outboundReplies" INTEGER NOT NULL DEFAULT 0,
    "inboundReceived" INTEGER NOT NULL DEFAULT 0,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "archivedOutboundMessages" INTEGER,
    "archivedWelcomeAppointments" INTEGER,
    "archivedWelcomeSales" INTEGER,
    "archivedOutboundAppointments" INTEGER,
    "archivedOutboundSales" INTEGER,
    "archivedInboundAppointments" INTEGER,
    "archivedInboundSales" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatActivityDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatActivityDay_organizationId_date_key" ON "ChatActivityDay"("organizationId", "date");

-- CreateIndex
CREATE INDEX "Lead_organizationId_chatChannel_createdAt_idx" ON "Lead"("organizationId", "chatChannel", "createdAt");

-- CreateIndex
CREATE INDEX "StageHistory_organizationId_toStage_changedAt_idx" ON "StageHistory"("organizationId", "toStage", "changedAt");

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_insightSourceId_fkey" FOREIGN KEY ("insightSourceId") REFERENCES "LeadSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatActivityDay" ADD CONSTRAINT "ChatActivityDay_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
