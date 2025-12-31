/*
 * Copyright (C) 2025 Isekai
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import type { S3Config } from "./types.js";

/**
 * Check if S3 environment variables are present.
 */
export function hasS3Config(): boolean {
  return !!(
    process.env.S3_ACCESS_KEY_ID &&
    process.env.S3_SECRET_ACCESS_KEY &&
    process.env.S3_BUCKET_NAME
  );
}

/**
 * Get S3 configuration from environment variables.
 * Throws an error if required variables are missing.
 */
export function getS3ConfigFromEnv(): S3Config {

  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  const bucket = process.env.S3_BUCKET_NAME;
  const region = process.env.S3_REGION || "auto";

  if (!accessKeyId || !secretAccessKey || !bucket) {
    throw new Error(
      "Missing required S3 configuration. " +
        "Please set S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, and S3_BUCKET_NAME environment variables."
    );
  }

  // Normalize path prefix: strip leading slash, ensure trailing slash
  let pathPrefix = process.env.S3_PATH_PREFIX || "";
  if (pathPrefix) {
    pathPrefix = pathPrefix.replace(/^\/+/, ""); // strip leading slash
    if (!pathPrefix.endsWith("/")) {
      pathPrefix += "/"; // ensure trailing slash
    }
  }

  return {
    endpoint: process.env.S3_ENDPOINT || undefined,
    region,
    accessKeyId,
    secretAccessKey,
    bucket,
    publicUrl: process.env.S3_PUBLIC_URL || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    presignedEndpoint: process.env.S3_PRESIGNED_ENDPOINT || undefined,
    pathPrefix,
  };
}

// ============================================
// File Validation Utilities
// ============================================

/**
 * Allowed MIME types for file uploads.
 */
export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/webm",
  "video/quicktime",
];

/**
 * Maximum file size in bytes (50MB).
 */
export const MAX_FILE_SIZE = 50 * 1024 * 1024;

/**
 * Validate file MIME type against allowed types.
 */
export function validateFileType(mimeType: string): boolean {
  return ALLOWED_MIME_TYPES.includes(mimeType);
}

/**
 * Validate file size against maximum limit.
 */
export function validateFileSize(fileSize: number): boolean {
  return fileSize > 0 && fileSize <= MAX_FILE_SIZE;
}

/**
 * Check if user has enough storage quota for a file.
 */
export function checkStorageLimit(
  currentUsage: number,
  fileSize: number,
  tierLimit: number
): boolean {
  return currentUsage + fileSize <= tierLimit;
}
