-- Store explicit user curation choices separately from immutable ingest provenance.
BEGIN;

CREATE TYPE "DraftCurationStatus" AS ENUM ('uncurated', 'curated');

ALTER TABLE "deviations"
  ADD COLUMN "curation_status" "DraftCurationStatus";

CREATE INDEX "deviations_user_id_status_curation_status_created_at_idx"
  ON "deviations"("user_id", "status", "curation_status", "created_at");

COMMIT;
