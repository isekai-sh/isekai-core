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

import {
  createStorageService,
  getS3ConfigFromEnv,
  // Re-export validation utilities for backward compatibility
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
  validateFileType,
  validateFileSize,
  checkStorageLimit,
  generateStorageKey,
  type StorageService,
} from "@isekai/shared/storage";

// Re-export for backward compatibility
export {
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
  validateFileType,
  validateFileSize,
  checkStorageLimit,
};

// Create storage service singleton
let storageService: StorageService | null = null;

function getStorageService(): StorageService {
  if (!storageService) {
    const config = getS3ConfigFromEnv();
    storageService = createStorageService(config);
  }
  return storageService;
}

/**
 * Get the S3 client for direct operations (presigned URLs, etc.)
 * @deprecated Use storageService methods instead where possible
 */
export function getS3Client() {
  return getStorageService().getClient();
}

/**
 * Get the bucket name
 */
export function getBucket(): string {
  return getStorageService().getBucket();
}

/**
 * Generate storage key with sanitized filename.
 * Alias for generateStorageKey for backward compatibility.
 */
export function generateR2Key(userId: string, filename: string): string {
  return generateStorageKey(userId, filename);
}

/**
 * Upload file directly to storage.
 */
export async function uploadToR2(
  key: string,
  buffer: Buffer,
  mimeType: string
): Promise<void> {
  return getStorageService().upload(key, buffer, mimeType);
}

/**
 * Delete file from storage.
 */
export async function deleteFromR2(key: string): Promise<void> {
  return getStorageService().delete(key);
}

/**
 * Get public URL for uploaded file.
 */
export function getPublicUrl(key: string): string {
  return getStorageService().getPublicUrl(key);
}

/**
 * Get presigned URL for direct browser upload.
 */
export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  contentLength: number,
  expiresIn: number = 900
): Promise<string> {
  return getStorageService().getPresignedUploadUrl(
    key,
    contentType,
    contentLength,
    expiresIn
  );
}

/**
 * Get the storage service instance for advanced operations.
 */
export { getStorageService };
