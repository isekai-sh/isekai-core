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

/**
 * Configuration for S3-compatible storage providers.
 *
 * Supports: AWS S3, Cloudflare R2, MinIO, DigitalOcean Spaces, Backblaze B2, etc.
 */
export interface S3Config {
  /**
   * S3-compatible endpoint URL.
   * - AWS S3: Leave undefined (uses default AWS endpoints)
   * - Cloudflare R2: https://<account-id>.r2.cloudflarestorage.com
   * - MinIO: http://localhost:9000
   * - DigitalOcean Spaces: https://<region>.digitaloceanspaces.com
   * - Backblaze B2: https://s3.<region>.backblazeb2.com
   */
  endpoint?: string;

  /**
   * AWS region or equivalent.
   * - AWS S3: us-east-1, eu-west-1, etc.
   * - Cloudflare R2: 'auto'
   * - MinIO: typically 'us-east-1'
   * - DigitalOcean Spaces: nyc3, sfo3, etc.
   */
  region: string;

  /** Access key ID for authentication */
  accessKeyId: string;

  /** Secret access key for authentication */
  secretAccessKey: string;

  /** Bucket name */
  bucket: string;

  /**
   * Public URL for accessing uploaded files.
   * Used for generating public URLs after upload.
   * Examples:
   * - https://my-bucket.s3.amazonaws.com
   * - https://pub-xxx.r2.dev
   * - http://localhost:9000/my-bucket (MinIO)
   */
  publicUrl?: string;

  /**
   * Force path-style URLs instead of virtual-hosted style.
   * - AWS S3: false (uses virtual-hosted style)
   * - Cloudflare R2: false
   * - MinIO: true (required)
   * - Some S3-compatible providers may require true
   */
  forcePathStyle?: boolean;

  /**
   * External endpoint URL for presigned URLs (browser uploads).
   * Use this when the internal endpoint (endpoint) differs from what browsers can access.
   *
   * Example: In Docker, backend uses http://minio:9000 internally,
   * but browsers need http://localhost:9000 for presigned URLs.
   *
   * If not set, uses the main endpoint.
   */
  presignedEndpoint?: string;
}

/**
 * Storage service interface for S3-compatible operations.
 */
export interface StorageService {
  /**
   * Upload a file to storage.
   * @param key - Object key (path) in the bucket
   * @param buffer - File content as Buffer
   * @param contentType - MIME type of the file
   */
  upload(key: string, buffer: Buffer, contentType: string): Promise<void>;

  /**
   * Delete a file from storage.
   * @param key - Object key (path) to delete
   */
  delete(key: string): Promise<void>;

  /**
   * Generate a presigned URL for direct browser upload.
   * @param key - Object key (path) for the upload
   * @param contentType - Expected MIME type
   * @param contentLength - Expected file size in bytes
   * @param expiresIn - URL expiration time in seconds (default: 900 = 15 minutes)
   */
  getPresignedUploadUrl(
    key: string,
    contentType: string,
    contentLength: number,
    expiresIn?: number
  ): Promise<string>;

  /**
   * Get the public URL for an uploaded file.
   * @param key - Object key (path) in the bucket
   */
  getPublicUrl(key: string): string;

  /** Get the underlying S3 client for advanced operations */
  getClient(): unknown;

  /** Get the bucket name */
  getBucket(): string;
}
