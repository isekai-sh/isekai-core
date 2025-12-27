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
import { reviewRouter } from './review.js';
import { createMockRequest, createMockResponse } from '../test-helpers/express-mock.js';

// Mock dependencies
vi.mock('../db/index.js', () => ({
  prisma: {
    deviation: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock('../lib/upload-service.js', () => ({
  deleteFromR2: vi.fn(),
}));

import { prisma } from '../db/index.js';
import { deleteFromR2 } from '../lib/upload-service.js';

describe('review routes', () => {
  const mockUser = {
    id: 'user-123',
    deviantartId: 'da-123',
    username: 'testuser',
  };

  const mockDeviation = {
    id: 'deviation-123',
    userId: 'user-123',
    status: 'review',
    title: 'Test Deviation',
    description: 'Test description',
    tags: ['art'],
    isMature: false,
    matureLevel: null,
    isAiGenerated: false,
    uploadMode: 'single',
    scheduledAt: null,
    actualPublishAt: null,
    publishedAt: null,
    lastRetryAt: null,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  };

  const mockDeviationFile = {
    id: 'file-123',
    deviationId: 'deviation-123',
    originalFilename: 'test.jpg',
    r2Key: 'deviations/user-123/test---abc123.jpg',
    r2Url: 'https://cdn.example.com/deviations/user-123/test---abc123.jpg',
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
    const routes = (reviewRouter as any).stack;
    const route = routes.find((r: any) =>
      r.route?.path === path && r.route?.methods?.[method.toLowerCase()]
    );
    if (!route) throw new Error(`Route not found: ${method} ${path}`);
    const handler = route.route.stack[route.route.stack.length - 1].handle;
    await handler(req, res);
  }

  describe('GET /', () => {
    it('should list review deviations with default pagination', async () => {
      const req = createMockRequest({
        user: mockUser,
        query: {},
      });
      const res = createMockResponse();

      (prisma.deviation.findMany as any).mockResolvedValue([
        { ...mockDeviation, files: [mockDeviationFile] },
      ]);
      (prisma.deviation.count as any).mockResolvedValue(1);

      await callRoute('GET', '/', req, res);

      expect(prisma.deviation.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-123',
          status: 'review',
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
        skip: 0,
        include: { files: true },
      });
      expect(prisma.deviation.count).toHaveBeenCalledWith({
        where: {
          userId: 'user-123',
          status: 'review',
        },
      });
      expect(res.json).toHaveBeenCalledWith({
        deviations: [
          expect.objectContaining({
            id: 'deviation-123',
            files: [mockDeviationFile],
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          }),
        ],
        total: 1,
      });
    });

    it('should list with custom pagination', async () => {
      const req = createMockRequest({
        user: mockUser,
        query: { page: '2', limit: '10' },
      });
      const res = createMockResponse();

      (prisma.deviation.findMany as any).mockResolvedValue([]);
      (prisma.deviation.count as any).mockResolvedValue(15);

      await callRoute('GET', '/', req, res);

      expect(prisma.deviation.findMany).toHaveBeenCalledWith({
        where: expect.any(Object),
        orderBy: expect.any(Object),
        take: 10,
        skip: 10,
        include: expect.any(Object),
      });
      expect(res.json).toHaveBeenCalledWith({
        deviations: [],
        total: 15,
      });
    });

    it('should transform date fields to ISO strings', async () => {
      const req = createMockRequest({
        user: mockUser,
        query: {},
      });
      const res = createMockResponse();

      const deviationWithDates = {
        ...mockDeviation,
        files: [],
        scheduledAt: new Date('2024-01-15T10:00:00Z'),
        actualPublishAt: new Date('2024-01-15T11:00:00Z'),
        publishedAt: new Date('2024-01-15T12:00:00Z'),
        lastRetryAt: new Date('2024-01-15T13:00:00Z'),
      };

      (prisma.deviation.findMany as any).mockResolvedValue([deviationWithDates]);
      (prisma.deviation.count as any).mockResolvedValue(1);

      await callRoute('GET', '/', req, res);

      expect(res.json).toHaveBeenCalledWith({
        deviations: [
          expect.objectContaining({
            scheduledAt: '2024-01-15T10:00:00.000Z',
            actualPublishAt: '2024-01-15T11:00:00.000Z',
            publishedAt: '2024-01-15T12:00:00.000Z',
            lastRetryAt: '2024-01-15T13:00:00.000Z',
          }),
        ],
        total: 1,
      });
    });

    it('should handle null date fields', async () => {
      const req = createMockRequest({
        user: mockUser,
        query: {},
      });
      const res = createMockResponse();

      (prisma.deviation.findMany as any).mockResolvedValue([
        { ...mockDeviation, files: [] },
      ]);
      (prisma.deviation.count as any).mockResolvedValue(1);

      await callRoute('GET', '/', req, res);

      expect(res.json).toHaveBeenCalledWith({
        deviations: [
          expect.objectContaining({
            scheduledAt: null,
            actualPublishAt: null,
            publishedAt: null,
            lastRetryAt: null,
          }),
        ],
        total: 1,
      });
    });

    it('should handle empty files array', async () => {
      const req = createMockRequest({
        user: mockUser,
        query: {},
      });
      const res = createMockResponse();

      (prisma.deviation.findMany as any).mockResolvedValue([
        { ...mockDeviation, files: null },
      ]);
      (prisma.deviation.count as any).mockResolvedValue(1);

      await callRoute('GET', '/', req, res);

      expect(res.json).toHaveBeenCalledWith({
        deviations: [
          expect.objectContaining({
            files: [],
          }),
        ],
        total: 1,
      });
    });
  });

  describe('POST /:id/approve', () => {
    it('should approve deviation and move to draft', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'deviation-123' },
      });
      const res = createMockResponse();

      (prisma.deviation.findFirst as any).mockResolvedValue(mockDeviation);
      (prisma.deviation.update as any).mockResolvedValue({
        ...mockDeviation,
        status: 'draft',
      });

      await callRoute('POST', '/:id/approve', req, res);

      expect(prisma.deviation.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'deviation-123',
          userId: 'user-123',
          status: 'review',
        },
      });
      expect(prisma.deviation.update).toHaveBeenCalledWith({
        where: { id: 'deviation-123' },
        data: {
          status: 'draft',
          updatedAt: expect.any(Date),
        },
      });
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'deviation-123',
          status: 'draft',
        })
      );
    });

    it('should return 404 when deviation not found', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'nonexistent' },
      });
      const res = createMockResponse();

      (prisma.deviation.findFirst as any).mockResolvedValue(null);

      await expect(callRoute('POST', '/:id/approve', req, res)).rejects.toThrow(
        'Review deviation not found'
      );
    });

    it('should return 404 when user does not own deviation', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'deviation-123' },
      });
      const res = createMockResponse();

      (prisma.deviation.findFirst as any).mockResolvedValue(null);

      await expect(callRoute('POST', '/:id/approve', req, res)).rejects.toThrow(
        'Review deviation not found'
      );
    });

    it('should transform dates in response', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'deviation-123' },
      });
      const res = createMockResponse();

      (prisma.deviation.findFirst as any).mockResolvedValue(mockDeviation);
      (prisma.deviation.update as any).mockResolvedValue({
        ...mockDeviation,
        status: 'draft',
        scheduledAt: new Date('2024-01-15T10:00:00Z'),
      });

      await callRoute('POST', '/:id/approve', req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          scheduledAt: '2024-01-15T10:00:00.000Z',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        })
      );
    });
  });

  describe('POST /:id/reject', () => {
    it('should reject deviation and delete files from R2', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'deviation-123' },
      });
      const res = createMockResponse();

      (prisma.deviation.findFirst as any).mockResolvedValue({
        ...mockDeviation,
        files: [mockDeviationFile],
      });
      (deleteFromR2 as any).mockResolvedValue(undefined);
      (prisma.deviation.delete as any).mockResolvedValue(mockDeviation);

      await callRoute('POST', '/:id/reject', req, res);

      expect(prisma.deviation.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'deviation-123',
          userId: 'user-123',
          status: 'review',
        },
        include: { files: true },
      });
      expect(deleteFromR2).toHaveBeenCalledWith('deviations/user-123/test---abc123.jpg');
      expect(prisma.deviation.delete).toHaveBeenCalledWith({
        where: { id: 'deviation-123' },
      });
      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalled();
    });

    it('should handle deviation without files', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'deviation-123' },
      });
      const res = createMockResponse();

      (prisma.deviation.findFirst as any).mockResolvedValue({
        ...mockDeviation,
        files: [],
      });
      (prisma.deviation.delete as any).mockResolvedValue(mockDeviation);

      await callRoute('POST', '/:id/reject', req, res);

      expect(deleteFromR2).not.toHaveBeenCalled();
      expect(prisma.deviation.delete).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(204);
    });

    it('should return 404 when deviation not found', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'nonexistent' },
      });
      const res = createMockResponse();

      (prisma.deviation.findFirst as any).mockResolvedValue(null);

      await expect(callRoute('POST', '/:id/reject', req, res)).rejects.toThrow(
        'Review deviation not found'
      );
    });

    it('should use Promise.allSettled for parallel R2 deletion', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'deviation-123' },
      });
      const res = createMockResponse();

      const files = [
        mockDeviationFile,
        { ...mockDeviationFile, id: 'file-2', r2Key: 'deviations/user-123/test2.jpg' },
      ];

      (prisma.deviation.findFirst as any).mockResolvedValue({
        ...mockDeviation,
        files,
      });
      (deleteFromR2 as any)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('R2 error'));
      (prisma.deviation.delete as any).mockResolvedValue(mockDeviation);

      await callRoute('POST', '/:id/reject', req, res);

      expect(deleteFromR2).toHaveBeenCalledTimes(2);
      expect(prisma.deviation.delete).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(204);
    });
  });

  describe('POST /batch-approve', () => {
    it('should batch approve multiple deviations', async () => {
      const deviationIds = ['deviation-1', 'deviation-2', 'deviation-3'];
      const req = createMockRequest({
        user: mockUser,
        body: { deviationIds },
      });
      const res = createMockResponse();

      const reviewDeviations = deviationIds.map((id) => ({
        ...mockDeviation,
        id,
      }));

      (prisma.deviation.findMany as any).mockResolvedValue(reviewDeviations);
      (prisma.deviation.updateMany as any).mockResolvedValue({ count: 3 });

      await callRoute('POST', '/batch-approve', req, res);

      expect(prisma.deviation.findMany).toHaveBeenCalledWith({
        where: {
          id: { in: deviationIds },
          userId: 'user-123',
          status: 'review',
        },
      });
      expect(prisma.deviation.updateMany).toHaveBeenCalledWith({
        where: { id: { in: deviationIds } },
        data: {
          status: 'draft',
          updatedAt: expect.any(Date),
        },
      });
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        approvedCount: 3,
      });
    });

    it('should reject when deviationIds is not an array', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: { deviationIds: 'not-an-array' },
      });
      const res = createMockResponse();

      await expect(callRoute('POST', '/batch-approve', req, res)).rejects.toThrow(
        'deviationIds array is required'
      );
    });

    it('should reject when deviationIds is empty', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: { deviationIds: [] },
      });
      const res = createMockResponse();

      await expect(callRoute('POST', '/batch-approve', req, res)).rejects.toThrow(
        'deviationIds array is required'
      );
    });

    it('should reject when not all deviations are found or owned', async () => {
      const deviationIds = ['deviation-1', 'deviation-2', 'deviation-3'];
      const req = createMockRequest({
        user: mockUser,
        body: { deviationIds },
      });
      const res = createMockResponse();

      (prisma.deviation.findMany as any).mockResolvedValue([
        { ...mockDeviation, id: 'deviation-1' },
        { ...mockDeviation, id: 'deviation-2' },
      ]);

      await expect(callRoute('POST', '/batch-approve', req, res)).rejects.toThrow(
        'Can only approve review deviations you own'
      );
    });
  });

  describe('POST /batch-reject', () => {
    it('should batch reject multiple deviations with files', async () => {
      const deviationIds = ['deviation-1', 'deviation-2'];
      const req = createMockRequest({
        user: mockUser,
        body: { deviationIds },
      });
      const res = createMockResponse();

      const reviewDeviations = [
        {
          ...mockDeviation,
          id: 'deviation-1',
          files: [mockDeviationFile],
        },
        {
          ...mockDeviation,
          id: 'deviation-2',
          files: [{ ...mockDeviationFile, id: 'file-2', r2Key: 'key2.jpg' }],
        },
      ];

      (prisma.deviation.findMany as any).mockResolvedValue(reviewDeviations);
      (deleteFromR2 as any).mockResolvedValue(undefined);
      (prisma.deviation.deleteMany as any).mockResolvedValue({ count: 2 });

      await callRoute('POST', '/batch-reject', req, res);

      expect(prisma.deviation.findMany).toHaveBeenCalledWith({
        where: {
          id: { in: deviationIds },
          userId: 'user-123',
          status: 'review',
        },
        include: { files: true },
      });
      expect(deleteFromR2).toHaveBeenCalledTimes(2);
      expect(prisma.deviation.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: deviationIds } },
      });
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        rejectedCount: 2,
      });
    });

    it('should reject when deviationIds is not an array', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: { deviationIds: 'not-an-array' },
      });
      const res = createMockResponse();

      await expect(callRoute('POST', '/batch-reject', req, res)).rejects.toThrow(
        'deviationIds array is required'
      );
    });

    it('should reject when deviationIds is empty', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: { deviationIds: [] },
      });
      const res = createMockResponse();

      await expect(callRoute('POST', '/batch-reject', req, res)).rejects.toThrow(
        'deviationIds array is required'
      );
    });

    it('should reject when not all deviations are found or owned', async () => {
      const deviationIds = ['deviation-1', 'deviation-2'];
      const req = createMockRequest({
        user: mockUser,
        body: { deviationIds },
      });
      const res = createMockResponse();

      (prisma.deviation.findMany as any).mockResolvedValue([
        { ...mockDeviation, id: 'deviation-1', files: [] },
      ]);

      await expect(callRoute('POST', '/batch-reject', req, res)).rejects.toThrow(
        'Can only reject review deviations you own'
      );
    });

    it('should use Promise.allSettled for parallel R2 deletion', async () => {
      const deviationIds = ['deviation-1'];
      const req = createMockRequest({
        user: mockUser,
        body: { deviationIds },
      });
      const res = createMockResponse();

      const reviewDeviations = [
        {
          ...mockDeviation,
          id: 'deviation-1',
          files: [
            mockDeviationFile,
            { ...mockDeviationFile, id: 'file-2' },
          ],
        },
      ];

      (prisma.deviation.findMany as any).mockResolvedValue(reviewDeviations);
      (deleteFromR2 as any)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('R2 error'));
      (prisma.deviation.deleteMany as any).mockResolvedValue({ count: 1 });

      await callRoute('POST', '/batch-reject', req, res);

      expect(deleteFromR2).toHaveBeenCalledTimes(2);
      expect(prisma.deviation.deleteMany).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        rejectedCount: 1,
      });
    });
  });
});
