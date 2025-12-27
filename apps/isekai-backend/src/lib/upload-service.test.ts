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

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock the shared storage module
const mockUpload = vi.fn();
const mockDelete = vi.fn();
const mockGetPresignedUploadUrl = vi.fn();
const mockGetPublicUrl = vi.fn();
const mockGetClient = vi.fn();
const mockGetBucket = vi.fn().mockReturnValue('test-bucket');

vi.mock('@isekai/shared/storage', () => ({
  createStorageService: vi.fn(() => ({
    upload: mockUpload,
    delete: mockDelete,
    getPresignedUploadUrl: mockGetPresignedUploadUrl,
    getPublicUrl: mockGetPublicUrl,
    getClient: mockGetClient,
    getBucket: mockGetBucket,
  })),
  getS3ConfigFromEnv: vi.fn(() => ({
    endpoint: 'https://test.r2.cloudflarestorage.com',
    region: 'auto',
    accessKeyId: 'test-key',
    secretAccessKey: 'test-secret',
    bucket: 'test-bucket',
    publicUrl: 'https://cdn.example.com',
  })),
  ALLOWED_MIME_TYPES: [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'video/mp4',
    'video/webm',
    'video/quicktime',
  ],
  MAX_FILE_SIZE: 50 * 1024 * 1024,
  validateFileType: (mimeType: string) => [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'video/mp4',
    'video/webm',
    'video/quicktime',
  ].includes(mimeType),
  validateFileSize: (fileSize: number) => fileSize > 0 && fileSize <= 50 * 1024 * 1024,
  checkStorageLimit: (currentUsage: number, fileSize: number, tierLimit: number) =>
    currentUsage + fileSize <= tierLimit,
  generateStorageKey: (userId: string, filename: string) => {
    const filenameWithoutExt = filename.replace(/\.[^/.]+$/, '');
    const sanitized = filenameWithoutExt.replace(/[^a-zA-Z0-9-_]/g, '-').slice(0, 50);
    const shortUuid = 'abc12345';
    const ext = filename.split('.').pop() || 'jpg';
    return `deviations/${userId}/${sanitized}---${shortUuid}.${ext}`;
  },
}));

import {
  validateFileType,
  validateFileSize,
  generateR2Key,
  getPublicUrl,
  checkStorageLimit,
  uploadToR2,
  deleteFromR2,
  getPresignedUploadUrl,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
} from './upload-service.js';

describe('upload-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPublicUrl.mockImplementation((key: string) => `https://cdn.example.com/${key}`);
    mockGetPresignedUploadUrl.mockResolvedValue('https://presigned-url.example.com');
  });

  describe('validateFileType', () => {
    it('should accept allowed image types', () => {
      expect(validateFileType('image/jpeg')).toBe(true);
      expect(validateFileType('image/png')).toBe(true);
      expect(validateFileType('image/gif')).toBe(true);
      expect(validateFileType('image/webp')).toBe(true);
    });

    it('should accept allowed video types', () => {
      expect(validateFileType('video/mp4')).toBe(true);
      expect(validateFileType('video/webm')).toBe(true);
      expect(validateFileType('video/quicktime')).toBe(true);
    });

    it('should reject disallowed mime types', () => {
      expect(validateFileType('application/pdf')).toBe(false);
      expect(validateFileType('text/plain')).toBe(false);
      expect(validateFileType('application/zip')).toBe(false);
      expect(validateFileType('image/svg+xml')).toBe(false);
    });

    it('should be case-sensitive', () => {
      expect(validateFileType('IMAGE/JPEG')).toBe(false);
      expect(validateFileType('Image/Png')).toBe(false);
    });

    it('should reject empty string', () => {
      expect(validateFileType('')).toBe(false);
    });

    it('should reject partial matches', () => {
      expect(validateFileType('image')).toBe(false);
      expect(validateFileType('jpeg')).toBe(false);
    });
  });

  describe('validateFileSize', () => {
    it('should accept valid file sizes', () => {
      expect(validateFileSize(1)).toBe(true);
      expect(validateFileSize(1024)).toBe(true);
      expect(validateFileSize(1024 * 1024)).toBe(true);
      expect(validateFileSize(MAX_FILE_SIZE)).toBe(true);
    });

    it('should reject file size of zero', () => {
      expect(validateFileSize(0)).toBe(false);
    });

    it('should reject negative file sizes', () => {
      expect(validateFileSize(-1)).toBe(false);
      expect(validateFileSize(-1000)).toBe(false);
    });

    it('should reject file sizes exceeding maximum', () => {
      expect(validateFileSize(MAX_FILE_SIZE + 1)).toBe(false);
      expect(validateFileSize(MAX_FILE_SIZE + 1000)).toBe(false);
      expect(validateFileSize(100 * 1024 * 1024)).toBe(false); // 100MB
    });

    it('should accept exactly at the maximum size', () => {
      expect(validateFileSize(MAX_FILE_SIZE)).toBe(true);
    });
  });

  describe('generateR2Key', () => {
    it('should generate key with correct structure', () => {
      const key = generateR2Key('user-123', 'my-image.jpg');
      expect(key).toMatch(/^deviations\/user-123\/my-image---[a-f0-9]{8}\.jpg$/);
    });

    it('should sanitize filename with special characters', () => {
      const key = generateR2Key('user-123', 'my file!@#$%.jpg');
      // Special characters are replaced with hyphens
      expect(key).toMatch(/^deviations\/user-123\/my-file-+---[a-f0-9]{8}\.jpg$/);
    });

    it('should handle different file extensions', () => {
      expect(generateR2Key('user-123', 'file.png')).toMatch(/\.png$/);
      expect(generateR2Key('user-123', 'file.gif')).toMatch(/\.gif$/);
      expect(generateR2Key('user-123', 'file.webp')).toMatch(/\.webp$/);
      expect(generateR2Key('user-123', 'file.mp4')).toMatch(/\.mp4$/);
    });

    it('should include user ID in path', () => {
      const key = generateR2Key('user-456', 'file.jpg');
      expect(key).toMatch(/^deviations\/user-456\//);
    });
  });

  describe('getPublicUrl', () => {
    it('should construct public URL correctly', () => {
      const url = getPublicUrl('deviations/user-123/image.jpg');
      expect(url).toBe('https://cdn.example.com/deviations/user-123/image.jpg');
    });

    it('should handle different keys', () => {
      expect(getPublicUrl('path/to/file.png')).toBe('https://cdn.example.com/path/to/file.png');
      expect(getPublicUrl('simple.jpg')).toBe('https://cdn.example.com/simple.jpg');
    });

    it('should preserve special characters in key', () => {
      const url = getPublicUrl('deviations/user-123/my-file---abc123.jpg');
      expect(url).toBe('https://cdn.example.com/deviations/user-123/my-file---abc123.jpg');
    });
  });

  describe('checkStorageLimit', () => {
    it('should return true when within limit', () => {
      expect(checkStorageLimit(1000, 500, 2000)).toBe(true);
      expect(checkStorageLimit(0, 1000, 1000)).toBe(true);
    });

    it('should return true when exactly at limit', () => {
      expect(checkStorageLimit(1000, 1000, 2000)).toBe(true);
    });

    it('should return false when exceeding limit', () => {
      expect(checkStorageLimit(1500, 600, 2000)).toBe(false);
      expect(checkStorageLimit(2000, 1, 2000)).toBe(false);
    });

    it('should handle zero current usage', () => {
      expect(checkStorageLimit(0, 1000, 1000)).toBe(true);
      expect(checkStorageLimit(0, 1001, 1000)).toBe(false);
    });

    it('should handle large file sizes', () => {
      const oneGB = 1024 * 1024 * 1024;
      const fiveGB = 5 * oneGB;
      expect(checkStorageLimit(oneGB, oneGB, fiveGB)).toBe(true);
      expect(checkStorageLimit(oneGB * 3, oneGB * 3, fiveGB)).toBe(false);
    });

    it('should work with different tier limits', () => {
      const freeTier = 1024 * 1024 * 100; // 100MB
      const proPier = 1024 * 1024 * 1000; // 1GB

      expect(checkStorageLimit(50 * 1024 * 1024, 60 * 1024 * 1024, freeTier)).toBe(false);
      expect(checkStorageLimit(50 * 1024 * 1024, 60 * 1024 * 1024, proPier)).toBe(true);
    });
  });

  describe('uploadToR2', () => {
    it('should upload file using storage service', async () => {
      const buffer = Buffer.from('test file content');
      const key = 'deviations/user-123/test.jpg';
      const mimeType = 'image/jpeg';

      await uploadToR2(key, buffer, mimeType);

      expect(mockUpload).toHaveBeenCalledWith(key, buffer, mimeType);
    });

    it('should handle different mime types', async () => {
      const buffer = Buffer.from('video data');

      await uploadToR2('video.mp4', buffer, 'video/mp4');
      expect(mockUpload).toHaveBeenCalledWith('video.mp4', buffer, 'video/mp4');

      await uploadToR2('image.png', buffer, 'image/png');
      expect(mockUpload).toHaveBeenCalledWith('image.png', buffer, 'image/png');
    });
  });

  describe('deleteFromR2', () => {
    it('should delete file using storage service', async () => {
      const key = 'deviations/user-123/test.jpg';

      await deleteFromR2(key);

      expect(mockDelete).toHaveBeenCalledWith(key);
    });

    it('should handle different keys', async () => {
      await deleteFromR2('path/to/file.jpg');
      expect(mockDelete).toHaveBeenCalledWith('path/to/file.jpg');

      await deleteFromR2('simple.png');
      expect(mockDelete).toHaveBeenCalledWith('simple.png');
    });
  });

  describe('getPresignedUploadUrl', () => {
    it('should get presigned URL from storage service', async () => {
      const key = 'deviations/user-123/test.jpg';
      const contentType = 'image/jpeg';
      const contentLength = 1024;

      const url = await getPresignedUploadUrl(key, contentType, contentLength);

      expect(mockGetPresignedUploadUrl).toHaveBeenCalledWith(key, contentType, contentLength, 900);
      expect(url).toBe('https://presigned-url.example.com');
    });

    it('should support custom expiration time', async () => {
      await getPresignedUploadUrl('test.jpg', 'image/jpeg', 1024, 3600);

      expect(mockGetPresignedUploadUrl).toHaveBeenCalledWith('test.jpg', 'image/jpeg', 1024, 3600);
    });
  });

  describe('constants', () => {
    it('should have correct ALLOWED_MIME_TYPES', () => {
      expect(ALLOWED_MIME_TYPES).toContain('image/jpeg');
      expect(ALLOWED_MIME_TYPES).toContain('image/png');
      expect(ALLOWED_MIME_TYPES).toContain('image/gif');
      expect(ALLOWED_MIME_TYPES).toContain('image/webp');
      expect(ALLOWED_MIME_TYPES).toContain('video/mp4');
      expect(ALLOWED_MIME_TYPES).toContain('video/webm');
      expect(ALLOWED_MIME_TYPES).toContain('video/quicktime');
      expect(ALLOWED_MIME_TYPES).toHaveLength(7);
    });

    it('should have correct MAX_FILE_SIZE', () => {
      expect(MAX_FILE_SIZE).toBe(50 * 1024 * 1024); // 50MB
    });
  });
});
