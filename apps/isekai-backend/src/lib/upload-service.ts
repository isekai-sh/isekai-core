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
  generateStorageKey as generateStorageKeyBase,
  type StorageService,
} from '@isekai/shared/storage';

// Re-export utilities (but NOT generateStorageKey - we wrap it below)
export { ALLOWED_MIME_TYPES, MAX_FILE_SIZE, validateFileType, validateFileSize, checkStorageLimit };

// Create storage service singleton
let storageService: StorageService | null = null;
let pathPrefix: string = '';

function getStorageService(): StorageService {
  if (!storageService) {
    const config = getS3ConfigFromEnv();
    storageService = createStorageService(config);
    pathPrefix = config.pathPrefix || '';
  }
  return storageService;
}

/**
 * Generate storage key with configured path prefix.
 * Wraps the base function to automatically include the prefix from environment.
 */
export function generateStorageKey(userId: string, filename: string): string {
  getStorageService(); // ensure pathPrefix is initialized
  return generateStorageKeyBase(userId, filename, pathPrefix);
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
 * Upload file directly to storage.
 */
export async function uploadToStorage(
  key: string,
  buffer: Buffer,
  mimeType: string
): Promise<void> {
  return getStorageService().upload(key, buffer, mimeType);
}

/**
 * Delete file from storage.
 */
export async function deleteFromStorage(key: string): Promise<void> {
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
  return getStorageService().getPresignedUploadUrl(key, contentType, contentLength, expiresIn);
}

/**
 * Get the storage service instance for advanced operations.
 */
export { getStorageService };
