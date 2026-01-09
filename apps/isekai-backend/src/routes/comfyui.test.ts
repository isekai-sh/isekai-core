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
import { comfyuiRouter } from './comfyui.js';
import { createMockRequest, createMockResponse } from '../test-helpers/express-mock.js';

// Mock dependencies
vi.mock('../db/index.js', () => ({
  prisma: {
    deviation: {
      create: vi.fn(),
    },
    deviationFile: {
      create: vi.fn(),
    },
  },
}));

vi.mock('../lib/upload-service.js', () => ({
  validateFileType: vi.fn(),
  validateFileSize: vi.fn(),
  generateStorageKey: vi.fn(),
  uploadToStorage: vi.fn(),
  getPublicUrl: vi.fn(),
  checkStorageLimit: vi.fn(),
}));

vi.mock('sharp', () => ({
  default: vi.fn(),
}));

vi.mock('../middleware/api-key-auth.js', () => ({
  apiKeyAuthMiddleware: (req: any, res: any, next: any) => next(),
}));

vi.mock('../middleware/rate-limit.js', () => ({
  comfyUIUploadLimiter: (req: any, res: any, next: any) => next(),
}));

import { prisma } from '../db/index.js';
import {
  validateFileType,
  validateFileSize,
  generateStorageKey,
  uploadToStorage,
  getPublicUrl,
} from '../lib/upload-service.js';
import sharp from 'sharp';

describe('comfyui routes', () => {
  const mockUser = {
    id: 'user-123',
    deviantartId: 'da-123',
    username: 'testuser',
  };

  const mockDeviation = {
    id: 'deviation-123',
    userId: 'user-123',
    status: 'review',
    title: 'Test Image',
    description: 'Test description',
    tags: ['art', 'digital'],
    isMature: false,
    matureLevel: null,
    isAiGenerated: true,
    uploadMode: 'single',
    createdAt: new Date(),
    updatedAt: new Date(),
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
  });

  async function callUploadRoute(req: any, res: any) {
    const routes = (comfyuiRouter as any).stack;
    const route = routes.find((r: any) => r.route?.path === '/upload' && r.route?.methods?.post);
    if (!route) throw new Error('Route not found');
    const handler = route.route.stack[route.route.stack.length - 1].handle;
    await handler(req, res);
  }

  describe('POST /upload', () => {
    it('should upload file with all metadata', async () => {
      const req = createMockRequest({
        user: mockUser,
        file: {
          originalname: 'test.jpg',
          mimetype: 'image/jpeg',
          size: 1024,
          buffer: Buffer.from('fake image data'),
        },
        body: {
          title: 'Test Image',
          description: 'Test description',
          tags: JSON.stringify(['art', 'digital']),
          isMature: 'false',
          matureLevel: 'moderate',
          isAiGenerated: 'true',
        },
      });
      const res = createMockResponse();

      (validateFileType as any).mockReturnValue(true);
      (validateFileSize as any).mockReturnValue(true);
      (generateStorageKey as any).mockReturnValue('deviations/user-123/test---abc123.jpg');
      (uploadToStorage as any).mockResolvedValue(undefined);
      (getPublicUrl as any).mockReturnValue(
        'https://cdn.example.com/deviations/user-123/test---abc123.jpg'
      );

      const mockSharpInstance = {
        metadata: vi.fn().mockResolvedValue({ width: 1920, height: 1080 }),
      };
      (sharp as any).mockReturnValue(mockSharpInstance);

      (prisma.deviation.create as any).mockResolvedValue(mockDeviation);
      (prisma.deviationFile.create as any).mockResolvedValue(mockDeviationFile);

      await callUploadRoute(req, res);

      expect(validateFileType).toHaveBeenCalledWith('image/jpeg');
      expect(validateFileSize).toHaveBeenCalledWith(1024);
      expect(generateStorageKey).toHaveBeenCalledWith('user-123', 'test.jpg');
      expect(uploadToStorage).toHaveBeenCalledWith(
        'deviations/user-123/test---abc123.jpg',
        expect.any(Buffer),
        'image/jpeg'
      );
      expect(sharp).toHaveBeenCalledWith(expect.any(Buffer));
      expect(prisma.deviation.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-123',
          status: 'review',
          title: 'Test Image',
          description: 'Test description',
          tags: ['art', 'digital'],
          isMature: false,
          matureLevel: 'moderate',
          isAiGenerated: true,
          uploadMode: 'single',
        },
      });
      expect(prisma.deviationFile.create).toHaveBeenCalledWith({
        data: {
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
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        deviationId: 'deviation-123',
        status: 'review',
        message: 'Upload successful. Deviation pending review.',
      });
    });

    it('should reject when no file provided', async () => {
      const req = createMockRequest({
        user: mockUser,
        file: undefined,
        body: {},
      });
      const res = createMockResponse();

      await expect(callUploadRoute(req, res)).rejects.toThrow('No file provided');
    });

    it('should reject invalid file type', async () => {
      const req = createMockRequest({
        user: mockUser,
        file: {
          originalname: 'document.pdf',
          mimetype: 'application/pdf',
          size: 1024,
          buffer: Buffer.from('fake pdf'),
        },
        body: {},
      });
      const res = createMockResponse();

      (validateFileType as any).mockReturnValue(false);

      await expect(callUploadRoute(req, res)).rejects.toThrow(
        'Invalid file type. Allowed: JPEG, PNG, GIF, WebP, MP4, WebM, MOV'
      );
    });

    it('should reject file exceeding size limit', async () => {
      const req = createMockRequest({
        user: mockUser,
        file: {
          originalname: 'large.jpg',
          mimetype: 'image/jpeg',
          size: 100 * 1024 * 1024,
          buffer: Buffer.from('large file'),
        },
        body: {},
      });
      const res = createMockResponse();

      (validateFileType as any).mockReturnValue(true);
      (validateFileSize as any).mockReturnValue(false);

      await expect(callUploadRoute(req, res)).rejects.toThrow('File size exceeds 50MB limit');
    });

    it('should reject invalid tags format', async () => {
      const req = createMockRequest({
        user: mockUser,
        file: {
          originalname: 'test.jpg',
          mimetype: 'image/jpeg',
          size: 1024,
          buffer: Buffer.from('image'),
        },
        body: {
          tags: 'not-json-array',
        },
      });
      const res = createMockResponse();

      (validateFileType as any).mockReturnValue(true);
      (validateFileSize as any).mockReturnValue(true);

      await expect(callUploadRoute(req, res)).rejects.toThrow(
        'Invalid tags format (must be JSON array)'
      );
    });

    it('should use filename as default title when not provided', async () => {
      const req = createMockRequest({
        user: mockUser,
        file: {
          originalname: 'my-artwork.jpg',
          mimetype: 'image/jpeg',
          size: 1024,
          buffer: Buffer.from('image'),
        },
        body: {},
      });
      const res = createMockResponse();

      (validateFileType as any).mockReturnValue(true);
      (validateFileSize as any).mockReturnValue(true);
      (generateStorageKey as any).mockReturnValue('deviations/user-123/my-artwork---abc123.jpg');
      (uploadToStorage as any).mockResolvedValue(undefined);
      (getPublicUrl as any).mockReturnValue(
        'https://cdn.example.com/deviations/user-123/my-artwork---abc123.jpg'
      );

      const mockSharpInstance = {
        metadata: vi.fn().mockResolvedValue({ width: 1920, height: 1080 }),
      };
      (sharp as any).mockReturnValue(mockSharpInstance);

      (prisma.deviation.create as any).mockResolvedValue({
        ...mockDeviation,
        title: 'my-artwork',
      });
      (prisma.deviationFile.create as any).mockResolvedValue(mockDeviationFile);

      await callUploadRoute(req, res);

      expect(prisma.deviation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: 'my-artwork',
        }),
      });
    });

    it('should default isAiGenerated to true when not provided', async () => {
      const req = createMockRequest({
        user: mockUser,
        file: {
          originalname: 'test.jpg',
          mimetype: 'image/jpeg',
          size: 1024,
          buffer: Buffer.from('image'),
        },
        body: {},
      });
      const res = createMockResponse();

      (validateFileType as any).mockReturnValue(true);
      (validateFileSize as any).mockReturnValue(true);
      (generateStorageKey as any).mockReturnValue('deviations/user-123/test---abc123.jpg');
      (uploadToStorage as any).mockResolvedValue(undefined);
      (getPublicUrl as any).mockReturnValue(
        'https://cdn.example.com/deviations/user-123/test---abc123.jpg'
      );

      const mockSharpInstance = {
        metadata: vi.fn().mockResolvedValue({ width: 1920, height: 1080 }),
      };
      (sharp as any).mockReturnValue(mockSharpInstance);

      (prisma.deviation.create as any).mockResolvedValue(mockDeviation);
      (prisma.deviationFile.create as any).mockResolvedValue(mockDeviationFile);

      await callUploadRoute(req, res);

      expect(prisma.deviation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          isAiGenerated: true,
        }),
      });
    });

    it('should set isAiGenerated to false when explicitly false', async () => {
      const req = createMockRequest({
        user: mockUser,
        file: {
          originalname: 'test.jpg',
          mimetype: 'image/jpeg',
          size: 1024,
          buffer: Buffer.from('image'),
        },
        body: {
          isAiGenerated: 'false',
        },
      });
      const res = createMockResponse();

      (validateFileType as any).mockReturnValue(true);
      (validateFileSize as any).mockReturnValue(true);
      (generateStorageKey as any).mockReturnValue('deviations/user-123/test---abc123.jpg');
      (uploadToStorage as any).mockResolvedValue(undefined);
      (getPublicUrl as any).mockReturnValue(
        'https://cdn.example.com/deviations/user-123/test---abc123.jpg'
      );

      const mockSharpInstance = {
        metadata: vi.fn().mockResolvedValue({ width: 1920, height: 1080 }),
      };
      (sharp as any).mockReturnValue(mockSharpInstance);

      (prisma.deviation.create as any).mockResolvedValue({
        ...mockDeviation,
        isAiGenerated: false,
      });
      (prisma.deviationFile.create as any).mockResolvedValue(mockDeviationFile);

      await callUploadRoute(req, res);

      expect(prisma.deviation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          isAiGenerated: false,
        }),
      });
    });

    it('should parse isMature as boolean', async () => {
      const req = createMockRequest({
        user: mockUser,
        file: {
          originalname: 'test.jpg',
          mimetype: 'image/jpeg',
          size: 1024,
          buffer: Buffer.from('image'),
        },
        body: {
          isMature: 'true',
        },
      });
      const res = createMockResponse();

      (validateFileType as any).mockReturnValue(true);
      (validateFileSize as any).mockReturnValue(true);
      (generateStorageKey as any).mockReturnValue('deviations/user-123/test---abc123.jpg');
      (uploadToStorage as any).mockResolvedValue(undefined);
      (getPublicUrl as any).mockReturnValue(
        'https://cdn.example.com/deviations/user-123/test---abc123.jpg'
      );

      const mockSharpInstance = {
        metadata: vi.fn().mockResolvedValue({ width: 1920, height: 1080 }),
      };
      (sharp as any).mockReturnValue(mockSharpInstance);

      (prisma.deviation.create as any).mockResolvedValue({
        ...mockDeviation,
        isMature: true,
      });
      (prisma.deviationFile.create as any).mockResolvedValue(mockDeviationFile);

      await callUploadRoute(req, res);

      expect(prisma.deviation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          isMature: true,
        }),
      });
    });

    it('should extract image metadata with sharp', async () => {
      const req = createMockRequest({
        user: mockUser,
        file: {
          originalname: 'test.jpg',
          mimetype: 'image/jpeg',
          size: 1024,
          buffer: Buffer.from('image'),
        },
        body: {},
      });
      const res = createMockResponse();

      (validateFileType as any).mockReturnValue(true);
      (validateFileSize as any).mockReturnValue(true);
      (generateStorageKey as any).mockReturnValue('deviations/user-123/test---abc123.jpg');
      (uploadToStorage as any).mockResolvedValue(undefined);
      (getPublicUrl as any).mockReturnValue(
        'https://cdn.example.com/deviations/user-123/test---abc123.jpg'
      );

      const mockSharpInstance = {
        metadata: vi.fn().mockResolvedValue({ width: 2560, height: 1440 }),
      };
      (sharp as any).mockReturnValue(mockSharpInstance);

      (prisma.deviation.create as any).mockResolvedValue(mockDeviation);
      (prisma.deviationFile.create as any).mockResolvedValue(mockDeviationFile);

      await callUploadRoute(req, res);

      expect(sharp).toHaveBeenCalledWith(expect.any(Buffer));
      expect(mockSharpInstance.metadata).toHaveBeenCalled();
      expect(prisma.deviationFile.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          width: 2560,
          height: 1440,
        }),
      });
    });

    it('should handle sharp metadata extraction failure gracefully', async () => {
      const req = createMockRequest({
        user: mockUser,
        file: {
          originalname: 'test.jpg',
          mimetype: 'image/jpeg',
          size: 1024,
          buffer: Buffer.from('image'),
        },
        body: {},
      });
      const res = createMockResponse();

      (validateFileType as any).mockReturnValue(true);
      (validateFileSize as any).mockReturnValue(true);
      (generateStorageKey as any).mockReturnValue('deviations/user-123/test---abc123.jpg');
      (uploadToStorage as any).mockResolvedValue(undefined);
      (getPublicUrl as any).mockReturnValue(
        'https://cdn.example.com/deviations/user-123/test---abc123.jpg'
      );

      const mockSharpInstance = {
        metadata: vi.fn().mockRejectedValue(new Error('Invalid image')),
      };
      (sharp as any).mockReturnValue(mockSharpInstance);

      (prisma.deviation.create as any).mockResolvedValue(mockDeviation);
      (prisma.deviationFile.create as any).mockResolvedValue(mockDeviationFile);

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await callUploadRoute(req, res);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to extract image metadata:',
        expect.any(Error)
      );
      expect(prisma.deviationFile.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          width: null,
          height: null,
        }),
      });

      consoleErrorSpy.mockRestore();
    });

    it('should skip metadata extraction for video files', async () => {
      const req = createMockRequest({
        user: mockUser,
        file: {
          originalname: 'test.mp4',
          mimetype: 'video/mp4',
          size: 1024,
          buffer: Buffer.from('video'),
        },
        body: {},
      });
      const res = createMockResponse();

      (validateFileType as any).mockReturnValue(true);
      (validateFileSize as any).mockReturnValue(true);
      (generateStorageKey as any).mockReturnValue('deviations/user-123/test---abc123.mp4');
      (uploadToStorage as any).mockResolvedValue(undefined);
      (getPublicUrl as any).mockReturnValue(
        'https://cdn.example.com/deviations/user-123/test---abc123.mp4'
      );

      (prisma.deviation.create as any).mockResolvedValue(mockDeviation);
      (prisma.deviationFile.create as any).mockResolvedValue({
        ...mockDeviationFile,
        mimeType: 'video/mp4',
        width: null,
        height: null,
      });

      await callUploadRoute(req, res);

      expect(sharp).not.toHaveBeenCalled();
      expect(prisma.deviationFile.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          mimeType: 'video/mp4',
          width: null,
          height: null,
          duration: null,
        }),
      });
    });

    it('should create deviation with review status', async () => {
      const req = createMockRequest({
        user: mockUser,
        file: {
          originalname: 'test.jpg',
          mimetype: 'image/jpeg',
          size: 1024,
          buffer: Buffer.from('image'),
        },
        body: {},
      });
      const res = createMockResponse();

      (validateFileType as any).mockReturnValue(true);
      (validateFileSize as any).mockReturnValue(true);
      (generateStorageKey as any).mockReturnValue('deviations/user-123/test---abc123.jpg');
      (uploadToStorage as any).mockResolvedValue(undefined);
      (getPublicUrl as any).mockReturnValue(
        'https://cdn.example.com/deviations/user-123/test---abc123.jpg'
      );

      const mockSharpInstance = {
        metadata: vi.fn().mockResolvedValue({ width: 1920, height: 1080 }),
      };
      (sharp as any).mockReturnValue(mockSharpInstance);

      (prisma.deviation.create as any).mockResolvedValue(mockDeviation);
      (prisma.deviationFile.create as any).mockResolvedValue(mockDeviationFile);

      await callUploadRoute(req, res);

      expect(prisma.deviation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: 'review',
          uploadMode: 'single',
        }),
      });
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        deviationId: 'deviation-123',
        status: 'review',
        message: 'Upload successful. Deviation pending review.',
      });
    });

    it('should accept empty tags array', async () => {
      const req = createMockRequest({
        user: mockUser,
        file: {
          originalname: 'test.jpg',
          mimetype: 'image/jpeg',
          size: 1024,
          buffer: Buffer.from('image'),
        },
        body: {
          tags: JSON.stringify([]),
        },
      });
      const res = createMockResponse();

      (validateFileType as any).mockReturnValue(true);
      (validateFileSize as any).mockReturnValue(true);
      (generateStorageKey as any).mockReturnValue('deviations/user-123/test---abc123.jpg');
      (uploadToStorage as any).mockResolvedValue(undefined);
      (getPublicUrl as any).mockReturnValue(
        'https://cdn.example.com/deviations/user-123/test---abc123.jpg'
      );

      const mockSharpInstance = {
        metadata: vi.fn().mockResolvedValue({ width: 1920, height: 1080 }),
      };
      (sharp as any).mockReturnValue(mockSharpInstance);

      (prisma.deviation.create as any).mockResolvedValue({
        ...mockDeviation,
        tags: [],
      });
      (prisma.deviationFile.create as any).mockResolvedValue(mockDeviationFile);

      await callUploadRoute(req, res);

      expect(prisma.deviation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tags: [],
        }),
      });
    });

    it('should validate matureLevel enum', async () => {
      const req = createMockRequest({
        user: mockUser,
        file: {
          originalname: 'test.jpg',
          mimetype: 'image/jpeg',
          size: 1024,
          buffer: Buffer.from('image'),
        },
        body: {
          matureLevel: 'invalid',
        },
      });
      const res = createMockResponse();

      (validateFileType as any).mockReturnValue(true);
      (validateFileSize as any).mockReturnValue(true);

      await expect(callUploadRoute(req, res)).rejects.toThrow();
    });

    it('should accept strict matureLevel', async () => {
      const req = createMockRequest({
        user: mockUser,
        file: {
          originalname: 'test.jpg',
          mimetype: 'image/jpeg',
          size: 1024,
          buffer: Buffer.from('image'),
        },
        body: {
          matureLevel: 'strict',
        },
      });
      const res = createMockResponse();

      (validateFileType as any).mockReturnValue(true);
      (validateFileSize as any).mockReturnValue(true);
      (generateStorageKey as any).mockReturnValue('deviations/user-123/test---abc123.jpg');
      (uploadToStorage as any).mockResolvedValue(undefined);
      (getPublicUrl as any).mockReturnValue(
        'https://cdn.example.com/deviations/user-123/test---abc123.jpg'
      );

      const mockSharpInstance = {
        metadata: vi.fn().mockResolvedValue({ width: 1920, height: 1080 }),
      };
      (sharp as any).mockReturnValue(mockSharpInstance);

      (prisma.deviation.create as any).mockResolvedValue({
        ...mockDeviation,
        matureLevel: 'strict',
      });
      (prisma.deviationFile.create as any).mockResolvedValue(mockDeviationFile);

      await callUploadRoute(req, res);

      expect(prisma.deviation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          matureLevel: 'strict',
        }),
      });
    });
  });
});
