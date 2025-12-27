-- Rename r2_key and r2_url columns to storage_key and storage_url
-- This migration renames the R2-specific column names to provider-agnostic names

ALTER TABLE "deviation_files" RENAME COLUMN "r2_key" TO "storage_key";
ALTER TABLE "deviation_files" RENAME COLUMN "r2_url" TO "storage_url";
