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

import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { S3Config, StorageService } from './types.js';

/**
 * S3-compatible storage service.
 *
 * Works with AWS S3, Cloudflare R2, MinIO, DigitalOcean Spaces,
 * Backblaze B2, and any other S3-compatible storage provider.
 */
export class S3StorageService implements StorageService {
  private client: S3Client;
  private presignedClient: S3Client;
  private bucket: string;
  private publicUrl?: string;
  private pathPrefix: string;

  constructor(config: S3Config) {
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: config.forcePathStyle ?? false,
    });

    // Create a separate client for presigned URLs if a different endpoint is configured.
    // This is needed in Docker environments where the backend uses an internal hostname
    // (e.g., http://minio:9000) but browsers need an external URL (e.g., http://localhost:9000).
    const presignedEndpoint = config.presignedEndpoint || config.endpoint;
    this.presignedClient = new S3Client({
      region: config.region,
      endpoint: presignedEndpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: config.forcePathStyle ?? false,
    });

    this.bucket = config.bucket;
    this.publicUrl = config.publicUrl;
    this.pathPrefix = config.pathPrefix || '';
  }

  async upload(key: string, buffer: Buffer, contentType: string): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ContentLength: buffer.length,
    });
    await this.client.send(command);
  }

  async delete(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    await this.client.send(command);
  }

  async getPresignedUploadUrl(
    key: string,
    contentType: string,
    contentLength: number,
    expiresIn: number = 900
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: contentLength,
    });
    // Use presignedClient which may have a browser-accessible endpoint
    return getSignedUrl(this.presignedClient, command, { expiresIn });
  }

  getPublicUrl(key: string): string {
    if (!this.publicUrl) {
      throw new Error('Public URL not configured. Set S3_PUBLIC_URL environment variable.');
    }
    // Remove trailing slash from publicUrl if present
    const baseUrl = this.publicUrl.replace(/\/$/, '');
    return `${baseUrl}/${key}`;
  }

  getClient(): S3Client {
    return this.client;
  }

  getBucket(): string {
    return this.bucket;
  }

  getPathPrefix(): string {
    return this.pathPrefix;
  }
}

/**
 * Create a storage service from configuration.
 */
export function createStorageService(config: S3Config): StorageService {
  return new S3StorageService(config);
}

// ============================================
// Singleton helpers for apps that need direct S3 client access
// ============================================

import { getS3ConfigFromEnv } from './config.js';

let _s3Client: S3Client | null = null;
let _storageConfig: { bucketName: string; publicUrl?: string; pathPrefix: string } | null = null;

/**
 * Get a shared S3 client instance.
 * Uses environment configuration to create the client on first call.
 */
export function getS3Client(): S3Client {
  if (!_s3Client) {
    const config = getS3ConfigFromEnv();
    _s3Client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: config.forcePathStyle ?? false,
    });
  }
  return _s3Client;
}

/**
 * Get storage configuration for direct bucket access.
 */
export function getStorageConfig(): { bucketName: string; publicUrl?: string; pathPrefix: string } {
  if (!_storageConfig) {
    const config = getS3ConfigFromEnv();
    _storageConfig = {
      bucketName: config.bucket,
      publicUrl: config.publicUrl,
      pathPrefix: config.pathPrefix || '',
    };
  }
  return _storageConfig;
}
