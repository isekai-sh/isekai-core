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
import { saleQueueRouter } from './sale-queue.js';
import { createMockRequest, createMockResponse } from '../test-helpers/express-mock.js';

// Mock dependencies
vi.mock('../db/index.js', () => ({
  prisma: {
    saleQueue: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    pricePreset: {
      findFirst: vi.fn(),
    },
    deviation: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { prisma } from '../db/index.js';

describe('sale-queue routes', () => {
  const mockUser = {
    id: 'user-123',
    deviantartId: 'da-123',
    username: 'testuser',
  };

  const mockPricePreset = {
    id: '00000000-0000-0000-0000-000000000001',
    userId: 'user-123',
    name: 'Standard Print',
    price: 2500,
    minPrice: null,
    maxPrice: null,
    currency: 'points',
  };

  const mockDeviation = {
    id: '00000000-0000-0000-0000-000000000002',
    userId: 'user-123',
    title: 'Test Artwork',
    status: 'published',
    deviationUrl: 'https://deviantart.com/art/123',
    publishedAt: new Date(),
  };

  const mockQueueItem = {
    id: 'queue-123',
    userId: 'user-123',
    deviationId: '00000000-0000-0000-0000-000000000002',
    pricePresetId: '00000000-0000-0000-0000-000000000001',
    price: 2500,
    status: 'pending',
    attempts: 0,
    lockedAt: null,
    processingBy: null,
    lastAttemptAt: null,
    completedAt: null,
    errorMessage: null,
    errorDetails: null,
    screenshotKey: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function callRoute(method: string, path: string, req: any, res: any) {
    const routes = (saleQueueRouter as any).stack;
    const route = routes.find(
      (r: any) => r.route?.path === path && r.route?.methods?.[method.toLowerCase()]
    );
    if (!route) throw new Error(`Route not found: ${method} ${path}`);
    const handler = route.route.stack[route.route.stack.length - 1].handle;
    await handler(req, res);
  }

  describe('GET /', () => {
    it('should list queue items with default pagination', async () => {
      const req = createMockRequest({
        user: mockUser,
        query: {},
      });
      const res = createMockResponse();

      (prisma.saleQueue.findMany as any).mockResolvedValue([
        {
          ...mockQueueItem,
          deviation: mockDeviation,
          pricePreset: mockPricePreset,
        },
      ]);
      (prisma.saleQueue.count as any).mockResolvedValue(1);

      await callRoute('GET', '/', req, res);

      expect(prisma.saleQueue.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        include: expect.objectContaining({
          deviation: expect.any(Object),
          pricePreset: expect.any(Object),
        }),
        orderBy: { createdAt: 'asc' },
        take: 50,
        skip: 0,
      });
      expect(res.json).toHaveBeenCalledWith({
        items: expect.any(Array),
        total: 1,
        page: 1,
        limit: 50,
      });
    });

    it('should list with custom pagination', async () => {
      const req = createMockRequest({
        user: mockUser,
        query: { page: '2', limit: '20' },
      });
      const res = createMockResponse();

      (prisma.saleQueue.findMany as any).mockResolvedValue([]);
      (prisma.saleQueue.count as any).mockResolvedValue(0);

      await callRoute('GET', '/', req, res);

      expect(prisma.saleQueue.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 20,
          skip: 20,
        })
      );
      expect(res.json).toHaveBeenCalledWith({
        items: [],
        total: 0,
        page: 2,
        limit: 20,
      });
    });

    it('should filter by status', async () => {
      const req = createMockRequest({
        user: mockUser,
        query: { status: 'completed' },
      });
      const res = createMockResponse();

      (prisma.saleQueue.findMany as any).mockResolvedValue([]);
      (prisma.saleQueue.count as any).mockResolvedValue(0);

      await callRoute('GET', '/', req, res);

      expect(prisma.saleQueue.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-123', status: 'completed' },
        })
      );
    });

    it('should cap limit at 100', async () => {
      const req = createMockRequest({
        user: mockUser,
        query: { limit: '200' },
      });
      const res = createMockResponse();

      (prisma.saleQueue.findMany as any).mockResolvedValue([]);
      (prisma.saleQueue.count as any).mockResolvedValue(0);

      await callRoute('GET', '/', req, res);

      expect(prisma.saleQueue.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100,
        })
      );
    });
  });

  describe('POST /', () => {
    it('should add deviations to queue with fixed price', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: {
          deviationIds: ['00000000-0000-0000-0000-000000000002'],
          pricePresetId: '00000000-0000-0000-0000-000000000001',
        },
      });
      const res = createMockResponse();

      (prisma.pricePreset.findFirst as any).mockResolvedValue(mockPricePreset);
      (prisma.deviation.findMany as any).mockResolvedValue([mockDeviation]);
      (prisma.saleQueue.findMany as any).mockResolvedValue([]);
      (prisma.saleQueue.createMany as any).mockResolvedValue({ count: 1 });

      await callRoute('POST', '/', req, res);

      expect(prisma.pricePreset.findFirst).toHaveBeenCalledWith({
        where: { id: '00000000-0000-0000-0000-000000000001', userId: 'user-123' },
      });
      expect(prisma.deviation.findMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['00000000-0000-0000-0000-000000000002'] },
          userId: 'user-123',
          status: 'published',
          deviationUrl: { not: null },
        },
        select: { id: true },
      });
      expect(prisma.saleQueue.createMany).toHaveBeenCalledWith({
        data: [
          {
            userId: 'user-123',
            deviationId: '00000000-0000-0000-0000-000000000002',
            pricePresetId: '00000000-0000-0000-0000-000000000001',
            price: 2500,
          },
        ],
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        created: 1,
        skipped: 0,
        message: 'Added 1 deviation(s) to sale queue',
      });
    });

    it('should calculate random price from range', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: {
          deviationIds: ['00000000-0000-0000-0000-000000000002'],
          pricePresetId: '00000000-0000-0000-0000-000000000001',
        },
      });
      const res = createMockResponse();

      const rangePreset = {
        ...mockPricePreset,
        price: 2000,
        minPrice: 2000,
        maxPrice: 5000,
      };

      (prisma.pricePreset.findFirst as any).mockResolvedValue(rangePreset);
      (prisma.deviation.findMany as any).mockResolvedValue([mockDeviation]);
      (prisma.saleQueue.findMany as any).mockResolvedValue([]);
      (prisma.saleQueue.createMany as any).mockResolvedValue({ count: 1 });

      await callRoute('POST', '/', req, res);

      expect(prisma.saleQueue.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            price: expect.any(Number),
          }),
        ],
      });

      const callArgs = (prisma.saleQueue.createMany as any).mock.calls[0][0];
      const price = callArgs.data[0].price;
      expect(price).toBeGreaterThanOrEqual(2000);
      expect(price).toBeLessThanOrEqual(5000);
    });

    it('should return 404 when price preset not found', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: {
          deviationIds: ['00000000-0000-0000-0000-000000000002'],
          pricePresetId: '00000000-0000-0000-0000-999999999999',
        },
      });
      const res = createMockResponse();

      (prisma.pricePreset.findFirst as any).mockResolvedValue(null);

      await expect(callRoute('POST', '/', req, res)).rejects.toThrow('Price preset not found');
    });

    it('should reject when no valid published deviations found', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: {
          deviationIds: ['00000000-0000-0000-0000-000000000002'],
          pricePresetId: '00000000-0000-0000-0000-000000000001',
        },
      });
      const res = createMockResponse();

      (prisma.pricePreset.findFirst as any).mockResolvedValue(mockPricePreset);
      (prisma.deviation.findMany as any).mockResolvedValue([]);

      await expect(callRoute('POST', '/', req, res)).rejects.toThrow(
        'No valid published deviations found'
      );
    });

    it('should skip existing queue entries', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: {
          deviationIds: [
            '00000000-0000-0000-0000-000000000002',
            '00000000-0000-0000-0000-000000000003',
          ],
          pricePresetId: '00000000-0000-0000-0000-000000000001',
        },
      });
      const res = createMockResponse();

      (prisma.pricePreset.findFirst as any).mockResolvedValue(mockPricePreset);
      (prisma.deviation.findMany as any).mockResolvedValue([
        { id: '00000000-0000-0000-0000-000000000002' },
        { id: '00000000-0000-0000-0000-000000000003' },
      ]);
      (prisma.saleQueue.findMany as any).mockResolvedValue([
        { deviationId: '00000000-0000-0000-0000-000000000002' },
      ]);
      (prisma.saleQueue.createMany as any).mockResolvedValue({ count: 1 });

      await callRoute('POST', '/', req, res);

      expect(prisma.saleQueue.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            deviationId: '00000000-0000-0000-0000-000000000003',
          }),
        ],
      });
      expect(res.json).toHaveBeenCalledWith({
        created: 1,
        skipped: 1,
        message: 'Added 1 deviation(s) to sale queue',
      });
    });

    it('should return early when all deviations already in queue', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: {
          deviationIds: ['00000000-0000-0000-0000-000000000002'],
          pricePresetId: '00000000-0000-0000-0000-000000000001',
        },
      });
      const res = createMockResponse();

      (prisma.pricePreset.findFirst as any).mockResolvedValue(mockPricePreset);
      (prisma.deviation.findMany as any).mockResolvedValue([
        { id: '00000000-0000-0000-0000-000000000002' },
      ]);
      (prisma.saleQueue.findMany as any).mockResolvedValue([
        { deviationId: '00000000-0000-0000-0000-000000000002' },
      ]);

      await callRoute('POST', '/', req, res);

      expect(prisma.saleQueue.createMany).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        created: 0,
        skipped: 1,
        message: 'All deviations already in queue',
      });
    });

    it('should validate deviationIds array (min 1, max 50)', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: {
          deviationIds: [],
          pricePresetId: 'preset-123',
        },
      });
      const res = createMockResponse();

      await expect(callRoute('POST', '/', req, res)).rejects.toThrow();
    });
  });

  describe('PATCH /:id', () => {
    it('should update status successfully', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'queue-123' },
        body: { status: 'completed' },
      });
      const res = createMockResponse();

      (prisma.saleQueue.findFirst as any).mockResolvedValue(mockQueueItem);
      (prisma.saleQueue.update as any).mockResolvedValue({
        ...mockQueueItem,
        status: 'completed',
        completedAt: new Date(),
      });

      await callRoute('PATCH', '/:id', req, res);

      expect(prisma.saleQueue.update).toHaveBeenCalledWith({
        where: { id: 'queue-123' },
        data: expect.objectContaining({
          status: 'completed',
          completedAt: expect.any(Date),
        }),
      });
    });

    it('should set completedAt when status is completed', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'queue-123' },
        body: { status: 'completed' },
      });
      const res = createMockResponse();

      (prisma.saleQueue.findFirst as any).mockResolvedValue(mockQueueItem);
      (prisma.saleQueue.update as any).mockResolvedValue(mockQueueItem);

      await callRoute('PATCH', '/:id', req, res);

      const updateCall = (prisma.saleQueue.update as any).mock.calls[0][0];
      expect(updateCall.data.completedAt).toBeInstanceOf(Date);
    });

    it('should not set completedAt for other statuses', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'queue-123' },
        body: { status: 'processing' },
      });
      const res = createMockResponse();

      (prisma.saleQueue.findFirst as any).mockResolvedValue(mockQueueItem);
      (prisma.saleQueue.update as any).mockResolvedValue(mockQueueItem);

      await callRoute('PATCH', '/:id', req, res);

      const updateCall = (prisma.saleQueue.update as any).mock.calls[0][0];
      expect(updateCall.data.completedAt).toBeNull();
    });

    it('should return 404 when item not found', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'nonexistent' },
        body: { status: 'completed' },
      });
      const res = createMockResponse();

      (prisma.saleQueue.findFirst as any).mockResolvedValue(null);

      await expect(callRoute('PATCH', '/:id', req, res)).rejects.toThrow('Queue item not found');
    });
  });

  describe('DELETE /:id', () => {
    it('should delete item successfully', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'queue-123' },
      });
      const res = createMockResponse();

      (prisma.saleQueue.findFirst as any).mockResolvedValue(mockQueueItem);
      (prisma.saleQueue.delete as any).mockResolvedValue(mockQueueItem);

      await callRoute('DELETE', '/:id', req, res);

      expect(prisma.saleQueue.delete).toHaveBeenCalledWith({
        where: { id: 'queue-123' },
      });
      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalled();
    });

    it('should reject deleting processing item', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'queue-123' },
      });
      const res = createMockResponse();

      (prisma.saleQueue.findFirst as any).mockResolvedValue({
        ...mockQueueItem,
        status: 'processing',
      });

      await expect(callRoute('DELETE', '/:id', req, res)).rejects.toThrow(
        'Cannot delete item currently being processed'
      );
    });

    it('should return 404 when item not found', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'nonexistent' },
      });
      const res = createMockResponse();

      (prisma.saleQueue.findFirst as any).mockResolvedValue(null);

      await expect(callRoute('DELETE', '/:id', req, res)).rejects.toThrow('Queue item not found');
    });
  });

  describe('GET /next', () => {
    it('should fetch and lock next pending item', async () => {
      const req = createMockRequest({
        user: mockUser,
        query: { clientId: 'client-123' },
      });
      const res = createMockResponse();

      const lockedItem = {
        ...mockQueueItem,
        status: 'processing',
        processingBy: 'client-123',
        lockedAt: new Date(),
        attempts: 1,
        deviation: mockDeviation,
        pricePreset: mockPricePreset,
      };

      (prisma.$transaction as any).mockImplementation(async (callback: any) => {
        return callback({
          saleQueue: {
            findFirst: vi.fn().mockResolvedValue(mockQueueItem),
            update: vi.fn().mockResolvedValue(lockedItem),
          },
        });
      });

      await callRoute('GET', '/next', req, res);

      expect(res.json).toHaveBeenCalledWith({
        item: expect.objectContaining({
          status: 'processing',
          processingBy: 'client-123',
        }),
      });
    });

    it('should return null when queue is empty', async () => {
      const req = createMockRequest({
        user: mockUser,
        query: { clientId: 'client-123' },
      });
      const res = createMockResponse();

      (prisma.$transaction as any).mockImplementation(async (callback: any) => {
        return callback({
          saleQueue: {
            findFirst: vi.fn().mockResolvedValue(null),
          },
        });
      });

      await callRoute('GET', '/next', req, res);

      expect(res.json).toHaveBeenCalledWith({
        item: null,
        message: 'Queue empty',
      });
    });

    it('should require clientId', async () => {
      const req = createMockRequest({
        user: mockUser,
        query: {},
      });
      const res = createMockResponse();

      await expect(callRoute('GET', '/next', req, res)).rejects.toThrow(
        'clientId query parameter required'
      );
    });
  });

  describe('POST /:id/complete', () => {
    it('should mark item as completed', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'queue-123' },
      });
      const res = createMockResponse();

      (prisma.saleQueue.findFirst as any).mockResolvedValue(mockQueueItem);
      (prisma.saleQueue.update as any).mockResolvedValue({
        ...mockQueueItem,
        status: 'completed',
        completedAt: new Date(),
        processingBy: null,
        lockedAt: null,
      });

      await callRoute('POST', '/:id/complete', req, res);

      expect(prisma.saleQueue.update).toHaveBeenCalledWith({
        where: { id: 'queue-123' },
        data: {
          status: 'completed',
          completedAt: expect.any(Date),
          processingBy: null,
          lockedAt: null,
          errorMessage: null,
          errorDetails: null,
        },
      });
    });

    it('should return 404 when item not found', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'nonexistent' },
      });
      const res = createMockResponse();

      (prisma.saleQueue.findFirst as any).mockResolvedValue(null);

      await expect(callRoute('POST', '/:id/complete', req, res)).rejects.toThrow(
        'Queue item not found'
      );
    });
  });

  describe('POST /:id/fail', () => {
    it('should mark as pending for retry when attempts < 3', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'queue-123' },
        body: {
          errorMessage: 'Test error',
          errorDetails: { code: 500 },
        },
      });
      const res = createMockResponse();

      (prisma.saleQueue.findFirst as any).mockResolvedValue({
        ...mockQueueItem,
        attempts: 2,
      });
      (prisma.saleQueue.update as any).mockResolvedValue({
        ...mockQueueItem,
        status: 'pending',
        errorMessage: 'Test error',
      });

      await callRoute('POST', '/:id/fail', req, res);

      expect(prisma.saleQueue.update).toHaveBeenCalledWith({
        where: { id: 'queue-123' },
        data: {
          status: 'pending',
          errorMessage: 'Test error',
          errorDetails: { code: 500 },
          screenshotKey: undefined,
          processingBy: null,
          lockedAt: null,
        },
      });
      expect(res.json).toHaveBeenCalledWith({
        item: expect.any(Object),
        willRetry: true,
      });
    });

    it('should mark as failed after 3 attempts', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'queue-123' },
        body: {
          errorMessage: 'Final error',
        },
      });
      const res = createMockResponse();

      (prisma.saleQueue.findFirst as any).mockResolvedValue({
        ...mockQueueItem,
        attempts: 3,
      });
      (prisma.saleQueue.update as any).mockResolvedValue({
        ...mockQueueItem,
        status: 'failed',
        completedAt: new Date(),
      });

      await callRoute('POST', '/:id/fail', req, res);

      expect(prisma.saleQueue.update).toHaveBeenCalledWith({
        where: { id: 'queue-123' },
        data: {
          status: 'failed',
          errorMessage: 'Final error',
          errorDetails: undefined,
          screenshotKey: undefined,
          processingBy: null,
          lockedAt: null,
          completedAt: expect.any(Date),
        },
      });
      expect(res.json).toHaveBeenCalledWith({
        item: expect.any(Object),
        willRetry: false,
      });
    });

    it('should return 404 when item not found', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'nonexistent' },
        body: { errorMessage: 'Error' },
      });
      const res = createMockResponse();

      (prisma.saleQueue.findFirst as any).mockResolvedValue(null);

      await expect(callRoute('POST', '/:id/fail', req, res)).rejects.toThrow(
        'Queue item not found'
      );
    });
  });

  describe('POST /cleanup', () => {
    it('should unlock stale jobs', async () => {
      const req = createMockRequest({
        user: mockUser,
      });
      const res = createMockResponse();

      const staleItems = [
        { ...mockQueueItem, id: 'queue-1', status: 'processing' },
        { ...mockQueueItem, id: 'queue-2', status: 'processing' },
      ];

      (prisma.saleQueue.findMany as any).mockResolvedValue(staleItems);
      (prisma.saleQueue.updateMany as any).mockResolvedValue({ count: 2 });

      await callRoute('POST', '/cleanup', req, res);

      expect(prisma.saleQueue.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-123',
          status: 'processing',
        },
      });
      expect(prisma.saleQueue.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['queue-1', 'queue-2'] },
        },
        data: {
          status: 'pending',
          processingBy: null,
          lockedAt: null,
        },
      });
      expect(res.json).toHaveBeenCalledWith({
        cleaned: 2,
        message: 'Unlocked 2 stuck jobs',
      });
    });

    it('should handle no stale jobs', async () => {
      const req = createMockRequest({
        user: mockUser,
      });
      const res = createMockResponse();

      (prisma.saleQueue.findMany as any).mockResolvedValue([]);
      (prisma.saleQueue.updateMany as any).mockResolvedValue({ count: 0 });

      await callRoute('POST', '/cleanup', req, res);

      expect(res.json).toHaveBeenCalledWith({
        cleaned: 0,
        message: 'Unlocked 0 stuck jobs',
      });
    });
  });
});
