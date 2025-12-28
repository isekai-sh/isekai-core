-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "DeviationStatus" AS ENUM ('review', 'draft', 'scheduled', 'uploading', 'publishing', 'published', 'failed');

-- CreateEnum
CREATE TYPE "UploadMode" AS ENUM ('single', 'multiple');

-- CreateEnum
CREATE TYPE "MatureLevel" AS ENUM ('moderate', 'strict');

-- CreateEnum
CREATE TYPE "TemplateType" AS ENUM ('tag', 'description', 'comment');

-- CreateEnum
CREATE TYPE "NoteFolderType" AS ENUM ('inbox', 'unread', 'starred', 'spam', 'sent', 'drafts');

-- CreateEnum
CREATE TYPE "SaleQueueStatus" AS ENUM ('pending', 'processing', 'completed', 'failed', 'skipped');

-- CreateEnum
CREATE TYPE "InstanceUserRole" AS ENUM ('admin', 'member');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "deviantart_id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "avatar_url" TEXT,
    "email" TEXT,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "token_expires_at" TIMESTAMP(3) NOT NULL,
    "refresh_token_expires_at" TIMESTAMP(3) NOT NULL,
    "refresh_token_warning_email_sent" BOOLEAN NOT NULL DEFAULT false,
    "refresh_token_expired_email_sent" BOOLEAN NOT NULL DEFAULT false,
    "last_refresh_token_refresh" TIMESTAMP(3),
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deviations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "DeviationStatus" NOT NULL DEFAULT 'draft',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "tags" TEXT[],
    "category_path" TEXT,
    "gallery_ids" TEXT[],
    "automation_id" TEXT,
    "is_mature" BOOLEAN NOT NULL DEFAULT false,
    "mature_level" "MatureLevel",
    "allow_comments" BOOLEAN NOT NULL DEFAULT true,
    "allow_free_download" BOOLEAN NOT NULL DEFAULT false,
    "is_ai_generated" BOOLEAN NOT NULL DEFAULT false,
    "no_ai" BOOLEAN NOT NULL DEFAULT false,
    "stash_only" BOOLEAN NOT NULL DEFAULT false,
    "add_watermark" BOOLEAN NOT NULL DEFAULT false,
    "display_resolution" INTEGER NOT NULL DEFAULT 0,
    "upload_mode" "UploadMode" NOT NULL DEFAULT 'single',
    "scheduled_at" TIMESTAMP(3),
    "jitter_seconds" INTEGER NOT NULL DEFAULT 0,
    "actual_publish_at" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "stash_item_id" TEXT,
    "deviation_id" TEXT,
    "deviation_url" TEXT,
    "error_message" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "last_retry_at" TIMESTAMP(3),
    "execution_lock_id" TEXT,
    "execution_locked_at" TIMESTAMP(3),
    "execution_version" INTEGER NOT NULL DEFAULT 0,
    "post_count_incremented" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deviations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deviation_files" (
    "id" TEXT NOT NULL,
    "deviation_id" TEXT NOT NULL,
    "original_filename" TEXT NOT NULL,
    "r2_key" TEXT NOT NULL,
    "r2_url" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "duration" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deviation_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "key_prefix" TEXT NOT NULL,
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "galleries_cache" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "folder_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parent_id" TEXT,
    "cached_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "galleries_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "note_folders" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "folder_id" TEXT NOT NULL,
    "folder_type" "NoteFolderType" NOT NULL DEFAULT 'inbox',
    "subject" TEXT,
    "last_username" TEXT NOT NULL,
    "last_user_avatar" TEXT,
    "last_user_deviantart_id" TEXT,
    "preview" TEXT,
    "is_unread" BOOLEAN NOT NULL DEFAULT false,
    "is_starred" BOOLEAN NOT NULL DEFAULT false,
    "message_count" INTEGER NOT NULL DEFAULT 0,
    "last_message_at" TIMESTAMP(3),
    "cached_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "note_folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "note_labels" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "note_labels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "note_folder_labels" (
    "id" TEXT NOT NULL,
    "note_folder_id" TEXT NOT NULL,
    "label_id" TEXT NOT NULL,

    CONSTRAINT "note_folder_labels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "note_templates" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "note_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "browse_cache" (
    "id" TEXT NOT NULL,
    "cache_key" TEXT NOT NULL,
    "user_id" TEXT,
    "response_data" TEXT NOT NULL,
    "cached_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "browse_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "templates" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "TemplateType" NOT NULL,
    "name" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_roles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "granted_by" TEXT NOT NULL,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "revoked_by" TEXT,

    CONSTRAINT "admin_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instance_users" (
    "id" TEXT NOT NULL,
    "da_user_id" TEXT NOT NULL,
    "da_username" TEXT NOT NULL,
    "da_avatar" TEXT,
    "role" "InstanceUserRole" NOT NULL DEFAULT 'member',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login_at" TIMESTAMP(3),

    CONSTRAINT "instance_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instance_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "team_invites_enabled" BOOLEAN,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "instance_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_presets" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "min_price" INTEGER,
    "max_price" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "description" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_presets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_queue" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "deviation_id" TEXT NOT NULL,
    "price_preset_id" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "status" "SaleQueueStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_attempt_at" TIMESTAMP(3),
    "processing_by" TEXT,
    "locked_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "error_message" TEXT,
    "error_details" JSONB,
    "screenshot_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "icon" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "draft_selection_method" TEXT NOT NULL,
    "stash_only_by_default" BOOLEAN NOT NULL DEFAULT false,
    "jitter_min_seconds" INTEGER NOT NULL DEFAULT 0,
    "jitter_max_seconds" INTEGER NOT NULL DEFAULT 300,
    "last_execution_lock" TIMESTAMP(3),
    "is_executing" BOOLEAN NOT NULL DEFAULT false,
    "auto_add_to_sale_queue" BOOLEAN NOT NULL DEFAULT false,
    "sale_queue_preset_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_schedule_rules" (
    "id" TEXT NOT NULL,
    "automation_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "time_of_day" TEXT,
    "interval_minutes" INTEGER,
    "deviations_per_interval" INTEGER,
    "daily_quota" INTEGER,
    "days_of_week" JSONB,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_schedule_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_default_values" (
    "id" TEXT NOT NULL,
    "automation_id" TEXT NOT NULL,
    "field_name" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "apply_if_empty" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_default_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_execution_logs" (
    "id" TEXT NOT NULL,
    "automation_id" TEXT NOT NULL,
    "executed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scheduled_count" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "triggered_by_rule_type" TEXT,

    CONSTRAINT "automation_execution_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_deviantart_id_key" ON "users"("deviantart_id");

-- CreateIndex
CREATE INDEX "deviations_user_id_status_idx" ON "deviations"("user_id", "status");

-- CreateIndex
CREATE INDEX "deviations_status_actual_publish_at_idx" ON "deviations"("status", "actual_publish_at");

-- CreateIndex
CREATE INDEX "deviations_execution_lock_id_status_idx" ON "deviations"("execution_lock_id", "status");

-- CreateIndex
CREATE INDEX "deviations_automation_id_idx" ON "deviations"("automation_id");

-- CreateIndex
CREATE UNIQUE INDEX "deviations_deviation_id_key" ON "deviations"("deviation_id");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");

-- CreateIndex
CREATE UNIQUE INDEX "browse_cache_cache_key_key" ON "browse_cache"("cache_key");

-- CreateIndex
CREATE INDEX "admin_roles_user_id_idx" ON "admin_roles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "admin_roles_user_id_role_key" ON "admin_roles"("user_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "instance_users_da_user_id_key" ON "instance_users"("da_user_id");

-- CreateIndex
CREATE INDEX "price_presets_user_id_idx" ON "price_presets"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "sale_queue_deviation_id_key" ON "sale_queue"("deviation_id");

-- CreateIndex
CREATE INDEX "sale_queue_user_id_status_idx" ON "sale_queue"("user_id", "status");

-- CreateIndex
CREATE INDEX "sale_queue_status_created_at_idx" ON "sale_queue"("status", "created_at");

-- CreateIndex
CREATE INDEX "automations_user_id_enabled_idx" ON "automations"("user_id", "enabled");

-- CreateIndex
CREATE INDEX "automations_user_id_sort_order_idx" ON "automations"("user_id", "sort_order");

-- CreateIndex
CREATE INDEX "automations_sale_queue_preset_id_idx" ON "automations"("sale_queue_preset_id");

-- CreateIndex
CREATE INDEX "automation_schedule_rules_automation_id_enabled_idx" ON "automation_schedule_rules"("automation_id", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "automation_default_values_automation_id_field_name_key" ON "automation_default_values"("automation_id", "field_name");

-- CreateIndex
CREATE INDEX "automation_execution_logs_automation_id_executed_at_idx" ON "automation_execution_logs"("automation_id", "executed_at");

-- AddForeignKey
ALTER TABLE "deviations" ADD CONSTRAINT "deviations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deviations" ADD CONSTRAINT "deviations_automation_id_fkey" FOREIGN KEY ("automation_id") REFERENCES "automations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deviation_files" ADD CONSTRAINT "deviation_files_deviation_id_fkey" FOREIGN KEY ("deviation_id") REFERENCES "deviations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "galleries_cache" ADD CONSTRAINT "galleries_cache_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_folders" ADD CONSTRAINT "note_folders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_labels" ADD CONSTRAINT "note_labels_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_folder_labels" ADD CONSTRAINT "note_folder_labels_note_folder_id_fkey" FOREIGN KEY ("note_folder_id") REFERENCES "note_folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_folder_labels" ADD CONSTRAINT "note_folder_labels_label_id_fkey" FOREIGN KEY ("label_id") REFERENCES "note_labels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_templates" ADD CONSTRAINT "note_templates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "browse_cache" ADD CONSTRAINT "browse_cache_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "templates" ADD CONSTRAINT "templates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_roles" ADD CONSTRAINT "admin_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_presets" ADD CONSTRAINT "price_presets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_queue" ADD CONSTRAINT "sale_queue_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_queue" ADD CONSTRAINT "sale_queue_deviation_id_fkey" FOREIGN KEY ("deviation_id") REFERENCES "deviations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_queue" ADD CONSTRAINT "sale_queue_price_preset_id_fkey" FOREIGN KEY ("price_preset_id") REFERENCES "price_presets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automations" ADD CONSTRAINT "automations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automations" ADD CONSTRAINT "automations_sale_queue_preset_id_fkey" FOREIGN KEY ("sale_queue_preset_id") REFERENCES "price_presets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_schedule_rules" ADD CONSTRAINT "automation_schedule_rules_automation_id_fkey" FOREIGN KEY ("automation_id") REFERENCES "automations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_default_values" ADD CONSTRAINT "automation_default_values_automation_id_fkey" FOREIGN KEY ("automation_id") REFERENCES "automations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_execution_logs" ADD CONSTRAINT "automation_execution_logs_automation_id_fkey" FOREIGN KEY ("automation_id") REFERENCES "automations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

