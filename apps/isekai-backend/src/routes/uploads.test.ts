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
import { uploadsRouter } from './uploads.js';
import { createMockRequest, createMockResponse } from '../test-helpers/express-mock.js';

// Mock dependencies
vi.mock('../db/index.js', () => ({
  prisma: {
    deviationFile: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock('../lib/upload-service.js', () => ({
  validateFileType: vi.fn(),
  validateFileSize: vi.fn(),
  generateStorageKey: vi.fn(),
  getPublicUrl: vi.fn(),
  checkStorageLimit: vi.fn(),
  deleteFromStorage: vi.fn(),
  getPresignedUploadUrl: vi.fn(),
}));

vi.mock('crypto', () => ({
  randomUUID: vi.fn(),
}));

import { prisma } from '../db/index.js';
import {
  validateFileType,
  validateFileSize,
  generateStorageKey,
  getPublicUrl,
  deleteFromStorage,
  getPresignedUploadUrl,
} from '../lib/upload-service.js';
import { randomUUID } from 'crypto';

describe('uploads routes', () => {
  const mockUser = {
    id: 'user-123',
    deviantartId: 'da-123',
    username: 'testuser',
  };

  const mockDeviationFile = {
    id: 'file-123',
    deviationId: 'deviation-123',
    originalFilename: 'test.jpg',
    storageKey: 'deviations/user-123/test---abc123.jpg',
    storageUrl: 'https://cdn.example.com/deviations/user-123/test---abc123.jpg',
    mimeType: 'image/jpeg',
    fileSize: 1024,
    width: 1920,
    height: 1080,
    duration: null,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.R2_BUCKET_NAME = 'test-bucket';
  });

  async function callRoute(method: string, path: string, req: any, res: any) {
    const routes = (uploadsRouter as any).stack;
    const route = routes.find(
      (r: any) => r.route?.path === path && r.route?.methods?.[method.toLowerCase()]
    );
    if (!route) throw new Error(`Route not found: ${method} ${path}`);
    const handler = route.route.stack[route.route.stack.length - 1].handle;
    await handler(req, res);
  }

  describe('POST /presigned', () => {
    it('should generate presigned URL for valid request', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: {
          filename: 'test.jpg',
          contentType: 'image/jpeg',
          fileSize: 1024,
        },
      });
      const res = createMockResponse();

      (validateFileType as any).mockReturnValue(true);
      (validateFileSize as any).mockReturnValue(true);
      (randomUUID as any).mockReturnValue('file-uuid-123');
      (generateStorageKey as any).mockReturnValue('deviations/user-123/test---abc123.jpg');
      (getPresignedUploadUrl as any).mockResolvedValue('https://presigned-url.com');

      await callRoute('POST', '/presigned', req, res);

      expect(validateFileType).toHaveBeenCalledWith('image/jpeg');
      expect(validateFileSize).toHaveBeenCalledWith(1024);
      expect(generateStorageKey).toHaveBeenCalledWith('user-123', 'test.jpg');
      expect(getPresignedUploadUrl).toHaveBeenCalledWith(
        'deviations/user-123/test---abc123.jpg',
        'image/jpeg',
        1024
      );
      expect(res.json).toHaveBeenCalledWith({
        uploadUrl: 'https://presigned-url.com',
        fileId: 'file-uuid-123',
        storageKey: 'deviations/user-123/test---abc123.jpg',
      });
    });

    it('should reject when filename is missing', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: {
          contentType: 'image/jpeg',
          fileSize: 1024,
        },
      });
      const res = createMockResponse();

      await expect(callRoute('POST', '/presigned', req, res)).rejects.toThrow(
        'filename, contentType, and fileSize are required'
      );
    });

    it('should reject when contentType is missing', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: {
          filename: 'test.jpg',
          fileSize: 1024,
        },
      });
      const res = createMockResponse();

      await expect(callRoute('POST', '/presigned', req, res)).rejects.toThrow(
        'filename, contentType, and fileSize are required'
      );
    });

    it('should reject when fileSize is missing', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: {
          filename: 'test.jpg',
          contentType: 'image/jpeg',
        },
      });
      const res = createMockResponse();

      await expect(callRoute('POST', '/presigned', req, res)).rejects.toThrow(
        'filename, contentType, and fileSize are required'
      );
    });

    it('should reject invalid file type', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: {
          filename: 'document.pdf',
          contentType: 'application/pdf',
          fileSize: 1024,
        },
      });
      const res = createMockResponse();

      (validateFileType as any).mockReturnValue(false);

      await expect(callRoute('POST', '/presigned', req, res)).rejects.toThrow(
        'Invalid file type. Allowed: JPEG, PNG, GIF, WebP, MP4, WebM, MOV'
      );
    });

    it('should reject file exceeding size limit', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: {
          filename: 'large.jpg',
          contentType: 'image/jpeg',
          fileSize: 100 * 1024 * 1024,
        },
      });
      const res = createMockResponse();

      (validateFileType as any).mockReturnValue(true);
      (validateFileSize as any).mockReturnValue(false);

      await expect(callRoute('POST', '/presigned', req, res)).rejects.toThrow(
        'File size exceeds 50MB limit'
      );
    });
  });

  describe('POST /complete', () => {
    it('should complete upload with all required fields', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: {
          fileId: 'file-uuid-123',
          deviationId: 'deviation-123',
          storageKey: 'deviations/user-123/test---abc123.jpg',
          originalFilename: 'test.jpg',
          mimeType: 'image/jpeg',
          fileSize: 1024,
          width: 1920,
          height: 1080,
          duration: null,
        },
      });
      const res = createMockResponse();

      (getPublicUrl as any).mockReturnValue(
        'https://cdn.example.com/deviations/user-123/test---abc123.jpg'
      );
      (prisma.deviationFile.findMany as any).mockResolvedValue([]);
      (prisma.deviationFile.create as any).mockResolvedValue(mockDeviationFile);

      await callRoute('POST', '/complete', req, res);

      expect(getPublicUrl).toHaveBeenCalledWith('deviations/user-123/test---abc123.jpg');
      expect(prisma.deviationFile.findMany).toHaveBeenCalledWith({
        where: { deviationId: 'deviation-123' },
      });
      expect(prisma.deviationFile.create).toHaveBeenCalledWith({
        data: {
          id: 'file-uuid-123',
          deviationId: 'deviation-123',
          originalFilename: 'test.jpg',
          storageKey: 'deviations/user-123/test---abc123.jpg',
          storageUrl: 'https://cdn.example.com/deviations/user-123/test---abc123.jpg',
          mimeType: 'image/jpeg',
          fileSize: 1024,
          width: 1920,
          height: 1080,
          duration: null,
          sortOrder: 0,
        },
      });
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it('should set correct sortOrder based on existing files', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: {
          fileId: 'file-uuid-456',
          deviationId: 'deviation-123',
          storageKey: 'deviations/user-123/test2---abc123.jpg',
          originalFilename: 'test2.jpg',
          mimeType: 'image/jpeg',
          fileSize: 2048,
        },
      });
      const res = createMockResponse();

      (getPublicUrl as any).mockReturnValue(
        'https://cdn.example.com/deviations/user-123/test2---abc123.jpg'
      );
      (prisma.deviationFile.findMany as any).mockResolvedValue([
        mockDeviationFile,
        { ...mockDeviationFile, id: 'file-2' },
        { ...mockDeviationFile, id: 'file-3' },
      ]);
      (prisma.deviationFile.create as any).mockResolvedValue({
        ...mockDeviationFile,
        sortOrder: 3,
      });

      await callRoute('POST', '/complete', req, res);

      expect(prisma.deviationFile.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sortOrder: 3,
        }),
      });
    });

    it('should reject when exceeding max 100 files per deviation', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: {
          fileId: 'file-uuid-123',
          deviationId: 'deviation-123',
          storageKey: 'deviations/user-123/test---abc123.jpg',
          originalFilename: 'test.jpg',
          mimeType: 'image/jpeg',
          fileSize: 1024,
        },
      });
      const res = createMockResponse();

      const existingFiles = Array.from({ length: 100 }, (_, i) => ({
        ...mockDeviationFile,
        id: `file-${i}`,
      }));
      (prisma.deviationFile.findMany as any).mockResolvedValue(existingFiles);

      await expect(callRoute('POST', '/complete', req, res)).rejects.toThrow(
        'Maximum 100 files per deviation'
      );
    });

    it('should reject when missing required fields', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: {
          fileId: 'file-uuid-123',
          deviationId: 'deviation-123',
          // Missing storageKey, originalFilename, mimeType, fileSize
        },
      });
      const res = createMockResponse();

      await expect(callRoute('POST', '/complete', req, res)).rejects.toThrow(
        'Missing required fields'
      );
    });
  });

  describe('DELETE /:fileId', () => {
    it('should delete file successfully', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { fileId: 'file-123' },
      });
      const res = createMockResponse();

      (prisma.deviationFile.findFirst as any).mockResolvedValue({
        ...mockDeviationFile,
        deviation: { userId: 'user-123' },
      });
      (deleteFromStorage as any).mockResolvedValue(undefined);
      (prisma.deviationFile.delete as any).mockResolvedValue(mockDeviationFile);

      await callRoute('DELETE', '/:fileId', req, res);

      expect(prisma.deviationFile.findFirst).toHaveBeenCalledWith({
        where: { id: 'file-123' },
        include: { deviation: true },
      });
      expect(deleteFromStorage).toHaveBeenCalledWith('deviations/user-123/test---abc123.jpg');
      expect(prisma.deviationFile.delete).toHaveBeenCalledWith({
        where: { id: 'file-123' },
      });
      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalled();
    });

    it('should return 404 when file not found', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { fileId: 'nonexistent' },
      });
      const res = createMockResponse();

      (prisma.deviationFile.findFirst as any).mockResolvedValue(null);

      await expect(callRoute('DELETE', '/:fileId', req, res)).rejects.toThrow('File not found');
    });

    it('should return 404 when user does not own the file', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { fileId: 'file-123' },
      });
      const res = createMockResponse();

      (prisma.deviationFile.findFirst as any).mockResolvedValue({
        ...mockDeviationFile,
        deviation: { userId: 'different-user' },
      });

      await expect(callRoute('DELETE', '/:fileId', req, res)).rejects.toThrow('File not found');
    });

    it('should continue DB deletion even when storage deletion fails', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { fileId: 'file-123' },
      });
      const res = createMockResponse();

      (prisma.deviationFile.findFirst as any).mockResolvedValue({
        ...mockDeviationFile,
        deviation: { userId: 'user-123' },
      });
      (deleteFromStorage as any).mockRejectedValue(new Error('Storage error'));
      (prisma.deviationFile.delete as any).mockResolvedValue(mockDeviationFile);

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await callRoute('DELETE', '/:fileId', req, res);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to delete from storage:',
        expect.any(Error)
      );
      expect(prisma.deviationFile.delete).toHaveBeenCalledWith({
        where: { id: 'file-123' },
      });
      expect(res.status).toHaveBeenCalledWith(204);

      consoleErrorSpy.mockRestore();
    });
  });

  describe('POST /batch-delete', () => {
    it('should batch delete multiple files', async () => {
      const fileIds = ['file-1', 'file-2', 'file-3'];
      const req = createMockRequest({
        user: mockUser,
        body: { fileIds },
      });
      const res = createMockResponse();

      const files = fileIds.map((id) => ({
        ...mockDeviationFile,
        id,
        deviation: { userId: 'user-123' },
      }));

      (prisma.deviationFile.findMany as any).mockResolvedValue(files);
      (deleteFromStorage as any).mockResolvedValue(undefined);
      (prisma.deviationFile.deleteMany as any).mockResolvedValue({ count: 3 });

      await callRoute('POST', '/batch-delete', req, res);

      expect(prisma.deviationFile.findMany).toHaveBeenCalledWith({
        where: { id: { in: fileIds } },
        include: { deviation: true },
      });
      expect(deleteFromStorage).toHaveBeenCalledTimes(3);
      expect(prisma.deviationFile.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: fileIds } },
      });
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        deletedCount: 3,
      });
    });

    it('should reject when fileIds is not an array', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: { fileIds: 'not-an-array' },
      });
      const res = createMockResponse();

      await expect(callRoute('POST', '/batch-delete', req, res)).rejects.toThrow(
        'fileIds array is required'
      );
    });

    it('should reject when fileIds is empty array', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: { fileIds: [] },
      });
      const res = createMockResponse();

      await expect(callRoute('POST', '/batch-delete', req, res)).rejects.toThrow(
        'fileIds array is required'
      );
    });

    it('should reject when user does not own all files', async () => {
      const fileIds = ['file-1', 'file-2'];
      const req = createMockRequest({
        user: mockUser,
        body: { fileIds },
      });
      const res = createMockResponse();

      const files = [
        { ...mockDeviationFile, id: 'file-1', deviation: { userId: 'user-123' } },
        { ...mockDeviationFile, id: 'file-2', deviation: { userId: 'different-user' } },
      ];

      (prisma.deviationFile.findMany as any).mockResolvedValue(files);

      await expect(callRoute('POST', '/batch-delete', req, res)).rejects.toThrow('Unauthorized');
    });

    it('should use Promise.allSettled for parallel R2 deletion', async () => {
      const fileIds = ['file-1', 'file-2'];
      const req = createMockRequest({
        user: mockUser,
        body: { fileIds },
      });
      const res = createMockResponse();

      const files = fileIds.map((id) => ({
        ...mockDeviationFile,
        id,
        storageKey: `deviations/user-123/${id}.jpg`,
        deviation: { userId: 'user-123' },
      }));

      (prisma.deviationFile.findMany as any).mockResolvedValue(files);
      (deleteFromStorage as any)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('R2 error'));
      (prisma.deviationFile.deleteMany as any).mockResolvedValue({ count: 2 });

      await callRoute('POST', '/batch-delete', req, res);

      // Should still succeed even with partial R2 failures
      expect(prisma.deviationFile.deleteMany).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        deletedCount: 2,
      });
    });
  });
});
