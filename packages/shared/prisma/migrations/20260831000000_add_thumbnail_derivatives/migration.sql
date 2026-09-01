-- Durable, versioned thumbnail generation state and object metadata.
CREATE TYPE "ThumbnailStatus" AS ENUM ('not_requested', 'pending', 'processing', 'ready', 'failed', 'skipped');
CREATE TYPE "ThumbnailBackfillStatus" AS ENUM ('running', 'completed', 'failed');

ALTER TABLE "deviation_files"
  ADD COLUMN "thumbnail_status" "ThumbnailStatus" NOT NULL DEFAULT 'not_requested',
  ADD COLUMN "thumbnail_version" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "thumbnail_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "thumbnail_error" TEXT,
  ADD COLUMN "thumbnail_updated_at" TIMESTAMP(3),
  ADD COLUMN "thumbnail_next_attempt_at" TIMESTAMP(3),
  ADD COLUMN "thumbnail_lease_id" TEXT,
  ADD COLUMN "thumbnail_lease_expires_at" TIMESTAMP(3);

CREATE TABLE "deviation_file_variants" (
  "id" TEXT NOT NULL,
  "deviation_file_id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "format" TEXT NOT NULL,
  "storage_key" TEXT NOT NULL,
  "file_size" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "deviation_file_variants_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "deviation_file_variants_deviation_file_id_fkey"
    FOREIGN KEY ("deviation_file_id") REFERENCES "deviation_files"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "deviation_file_variants_storage_key_key"
  ON "deviation_file_variants"("storage_key");
CREATE UNIQUE INDEX "deviation_file_variants_deviation_file_id_kind_version_width_format_key"
  ON "deviation_file_variants"("deviation_file_id", "kind", "version", "width", "format");
CREATE INDEX "deviation_file_variants_deviation_file_id_version_idx"
  ON "deviation_file_variants"("deviation_file_id", "version");
CREATE INDEX "deviation_files_thumbnail_status_thumbnail_version_thumbnail_next_attempt_at_created_at_id_idx"
  ON "deviation_files"("thumbnail_status", "thumbnail_version", "thumbnail_next_attempt_at", "created_at", "id");

CREATE TABLE "thumbnail_backfill_runs" (
  "id" TEXT NOT NULL,
  "target_version" INTEGER NOT NULL,
  "status" "ThumbnailBackfillStatus" NOT NULL DEFAULT 'running',
  "upper_bound_created_at" TIMESTAMP(3) NOT NULL,
  "upper_bound_id" TEXT NOT NULL,
  "cursor_created_at" TIMESTAMP(3),
  "cursor_id" TEXT,
  "filter_file_id" TEXT,
  "filter_user_id" TEXT,
  "max_files" INTEGER,
  "scanned_count" INTEGER NOT NULL DEFAULT 0,
  "queued_count" INTEGER NOT NULL DEFAULT 0,
  "skipped_count" INTEGER NOT NULL DEFAULT 0,
  "last_error" TEXT,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "completed_at" TIMESTAMP(3),
  CONSTRAINT "thumbnail_backfill_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "thumbnail_backfill_runs_target_version_status_started_at_idx"
  ON "thumbnail_backfill_runs"("target_version", "status", "started_at");
