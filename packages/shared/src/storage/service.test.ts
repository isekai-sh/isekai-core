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

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock AWS SDK before importing the service
vi.mock('@aws-sdk/client-s3', () => {
  const mockSend = vi.fn();
  return {
    S3Client: vi.fn().mockImplementation(() => ({
      send: mockSend,
    })),
    PutObjectCommand: vi.fn().mockImplementation((params) => ({
      ...params,
      _type: 'PutObjectCommand',
    })),
    DeleteObjectCommand: vi.fn().mockImplementation((params) => ({
      ...params,
      _type: 'DeleteObjectCommand',
    })),
    __mockSend: mockSend,
  };
});

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://presigned-url.example.com'),
}));

import { S3StorageService, createStorageService } from './service.js';
import type { S3Config } from './types.js';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

describe('S3StorageService', () => {
  const testConfig: S3Config = {
    endpoint: 'https://test.r2.cloudflarestorage.com',
    region: 'auto',
    accessKeyId: 'test-key',
    secretAccessKey: 'test-secret',
    bucket: 'test-bucket',
    publicUrl: 'https://cdn.example.com',
    forcePathStyle: false,
  };

  let service: S3StorageService;
  let mockSend: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new S3StorageService(testConfig);
    // Get the mock send function from the mocked module
    mockSend = (service.getClient() as any).send;
  });

  describe('constructor', () => {
    it('should create S3Client with correct configuration', () => {
      expect(S3Client).toHaveBeenCalledWith({
        region: 'auto',
        endpoint: 'https://test.r2.cloudflarestorage.com',
        credentials: {
          accessKeyId: 'test-key',
          secretAccessKey: 'test-secret',
        },
        forcePathStyle: false,
      });
    });

    it('should handle missing endpoint (for AWS S3)', () => {
      const awsConfig: S3Config = {
        region: 'us-east-1',
        accessKeyId: 'aws-key',
        secretAccessKey: 'aws-secret',
        bucket: 'aws-bucket',
      };
      const awsService = new S3StorageService(awsConfig);
      expect(awsService).toBeInstanceOf(S3StorageService);
    });

    it('should enable forcePathStyle for MinIO', () => {
      vi.clearAllMocks();
      const minioConfig: S3Config = {
        endpoint: 'http://localhost:9000',
        region: 'us-east-1',
        accessKeyId: 'minioadmin',
        secretAccessKey: 'minioadmin',
        bucket: 'test',
        forcePathStyle: true,
      };
      new S3StorageService(minioConfig);
      expect(S3Client).toHaveBeenCalledWith(
        expect.objectContaining({
          forcePathStyle: true,
        })
      );
    });
  });

  describe('upload', () => {
    it('should upload file with correct parameters', async () => {
      const buffer = Buffer.from('test content');
      await service.upload('path/to/file.jpg', buffer, 'image/jpeg');

      expect(PutObjectCommand).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: 'path/to/file.jpg',
        Body: buffer,
        ContentType: 'image/jpeg',
        ContentLength: buffer.length,
      });
      expect(mockSend).toHaveBeenCalled();
    });

    it('should handle different content types', async () => {
      const buffer = Buffer.from('video data');
      await service.upload('video.mp4', buffer, 'video/mp4');

      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          ContentType: 'video/mp4',
        })
      );
    });
  });

  describe('delete', () => {
    it('should delete file with correct parameters', async () => {
      await service.delete('path/to/file.jpg');

      expect(DeleteObjectCommand).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: 'path/to/file.jpg',
      });
      expect(mockSend).toHaveBeenCalled();
    });
  });

  describe('getPresignedUploadUrl', () => {
    it('should generate presigned URL with default expiry', async () => {
      const url = await service.getPresignedUploadUrl('path/to/file.jpg', 'image/jpeg', 1024);

      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          Bucket: 'test-bucket',
          Key: 'path/to/file.jpg',
          ContentType: 'image/jpeg',
          ContentLength: 1024,
        }),
        { expiresIn: 900 }
      );
      expect(url).toBe('https://presigned-url.example.com');
    });

    it('should support custom expiry time', async () => {
      await service.getPresignedUploadUrl('file.jpg', 'image/jpeg', 1024, 3600);

      expect(getSignedUrl).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
        expiresIn: 3600,
      });
    });
  });

  describe('getPublicUrl', () => {
    it('should construct public URL correctly', () => {
      const url = service.getPublicUrl('path/to/file.jpg');
      expect(url).toBe('https://cdn.example.com/path/to/file.jpg');
    });

    it('should handle trailing slash in publicUrl', () => {
      const configWithSlash: S3Config = {
        ...testConfig,
        publicUrl: 'https://cdn.example.com/',
      };
      const serviceWithSlash = new S3StorageService(configWithSlash);
      const url = serviceWithSlash.getPublicUrl('file.jpg');
      expect(url).toBe('https://cdn.example.com/file.jpg');
    });

    it('should throw error if publicUrl not configured', () => {
      const configWithoutPublicUrl: S3Config = {
        ...testConfig,
        publicUrl: undefined,
      };
      const serviceWithoutPublicUrl = new S3StorageService(configWithoutPublicUrl);
      expect(() => serviceWithoutPublicUrl.getPublicUrl('file.jpg')).toThrow(
        'Public URL not configured'
      );
    });
  });

  describe('getClient', () => {
    it('should return the S3 client', () => {
      const client = service.getClient();
      expect(client).toBeDefined();
      expect(client).toHaveProperty('send');
    });
  });

  describe('getBucket', () => {
    it('should return the bucket name', () => {
      expect(service.getBucket()).toBe('test-bucket');
    });
  });
});

describe('createStorageService', () => {
  it('should create an S3StorageService instance', () => {
    const config: S3Config = {
      region: 'us-east-1',
      accessKeyId: 'key',
      secretAccessKey: 'secret',
      bucket: 'bucket',
    };
    const service = createStorageService(config);
    expect(service).toBeInstanceOf(S3StorageService);
  });
});
