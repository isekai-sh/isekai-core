-- Add a recoverable trash state without rewriting any existing rows.
BEGIN;

ALTER TYPE "DeviationStatus" ADD VALUE IF NOT EXISTS 'trashed';

CREATE TYPE "DeviationIngestSource" AS ENUM ('manual', 'manual_review', 'direct_to_draft');

ALTER TABLE "deviations"
  ADD COLUMN "ingest_source" "DeviationIngestSource",
  ADD COLUMN "curated_at" TIMESTAMP(3),
  ADD COLUMN "discarded_at" TIMESTAMP(3),
  ADD COLUMN "purge_after" TIMESTAMP(3),
  ADD COLUMN "purge_started_at" TIMESTAMP(3);

CREATE INDEX "deviations_user_id_status_curated_at_created_at_idx"
  ON "deviations"("user_id", "status", "curated_at", "created_at");

CREATE INDEX "deviations_status_purge_after_idx"
  ON "deviations"("status", "purge_after");

COMMIT;
