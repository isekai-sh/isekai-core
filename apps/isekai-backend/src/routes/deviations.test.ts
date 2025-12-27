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

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock rate limiters
vi.mock('express-rate-limit', () => ({
  default: vi.fn(() => (req: any, res: any, next: any) => next()),
  rateLimit: vi.fn(() => (req: any, res: any, next: any) => next()),
}));

vi.mock('rate-limit-redis', () => ({
  default: vi.fn(),
  RedisStore: vi.fn(),
}));

// Mock dependencies
vi.mock('../db/index.js', () => ({
  prisma: {
    $transaction: vi.fn(async (callback) => {
      // Mock transaction context with deviation.update that returns scheduled deviation
      const scheduledDev = {
        id: '00000000-0000-0000-0000-000000000001',
        userId: 'user-123',
        title: 'Test Deviation',
        description: null,
        tags: [],
        categoryPath: null,
        galleryIds: [],
        isMature: false,
        matureLevel: null,
        allowComments: true,
        allowFreeDownload: false,
        isAiGenerated: false,
        noAi: false,
        uploadMode: 'single' as const,
        status: 'scheduled' as const,
        scheduledAt: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours
        actualPublishAt: new Date(Date.now() + 3600100),
        publishedAt: null,
        jitterSeconds: 100,
        retryCount: 0,
        lastRetryAt: null,
        errorMessage: null,
        deviantartId: null,
        deviantartUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      return await callback({
        deviation: {
          update: vi.fn().mockResolvedValue(scheduledDev),
        },
      });
    }),
    deviation: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    deviationFile: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('../lib/deviantart.js', () => ({
  refreshTokenIfNeeded: vi.fn(),
}));

vi.mock('../queues/deviation-publisher.js', () => ({
  scheduleDeviation: vi.fn(),
  publishDeviationNow: vi.fn(),
  cancelScheduledDeviation: vi.fn(),
  deviationPublisherQueue: {
    getJob: vi.fn(),
  },
}));

// Mock S3
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(function(this: any) {
    this.send = vi.fn();
  }),
  DeleteObjectCommand: vi.fn(function(this: any, params: any) {
    Object.assign(this, params);
  }),
}));

import { deviationsRouter } from './deviations.js';
import { prisma } from '../db/index.js';
import { refreshTokenIfNeeded } from '../lib/deviantart.js';
import { scheduleDeviation, publishDeviationNow, cancelScheduledDeviation, deviationPublisherQueue } from '../queues/deviation-publisher.js';

const mockPrisma = vi.mocked(prisma);
const mockRefreshTokenIfNeeded = vi.mocked(refreshTokenIfNeeded);
const mockScheduleDeviation = vi.mocked(scheduleDeviation);
const mockPublishDeviationNow = vi.mocked(publishDeviationNow);
const mockCancelScheduledDeviation = vi.mocked(cancelScheduledDeviation);
const mockDeviationPublisherQueue = vi.mocked(deviationPublisherQueue);

describe('Deviations Routes', () => {
  const mockUser = {
    id: 'user-123',
    daUserId: 'da-user-123',
    daUsername: 'testuser',
  };

  const mockDeviation = {
    id: '00000000-0000-0000-0000-000000000001',
    userId: 'user-123',
    title: 'Test Deviation',
    description: null,
    tags: [],
    categoryPath: null,
    galleryIds: [],
    isMature: false,
    matureLevel: null,
    allowComments: true,
    allowFreeDownload: false,
    isAiGenerated: false,
    noAi: false,
    status: 'draft' as const,
    scheduledAt: null,
    publishedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRefreshTokenIfNeeded.mockResolvedValue('mock-access-token');

    // Suppress console messages during tests
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  async function callRoute(method: string, path: string, req: any, res: any) {
    const routes = (deviationsRouter as any).stack;
    const route = routes.find(
      (r: any) => {
        if (!r.route?.path) return false;
        if (!r.route.methods?.[method.toLowerCase()]) return false;

        // Exact match for non-param routes
        if (!r.route.path.includes(':')) {
          return r.route.path === path;
        }

        // Param match for routes like /:id
        const pathParts = path.split('/');
        const routeParts = r.route.path.split('/');
        if (pathParts.length !== routeParts.length) return false;

        return routeParts.every((part, i) =>
          part.startsWith(':') || part === pathParts[i]
        );
      }
    );
    if (!route) throw new Error(`Route not found: ${method} ${path}`);
    const handler = route.route.stack[route.route.stack.length - 1].handle;

    try {
      await handler(req, res);
    } catch (error: any) {
      // Simulate error middleware handling
      console.error('Test error handler caught:', error);
      if (error.statusCode) {
        res.status(error.statusCode);
        res.json({ error: error.message });
      } else if (error.name === 'ZodError') {
        res.status(400);
        res.json({ error: 'Invalid request data' });
      } else {
        res.status(500);
        res.json({ error: 'Internal server error', details: error.message });
      }
    }
  }

  describe('GET /', () => {
    it('should list deviations successfully', async () => {
      mockPrisma.deviation.findMany.mockResolvedValue([mockDeviation]);
      mockPrisma.deviation.count.mockResolvedValue(1);

      const req = {
        user: mockUser,
        query: {},
      };
      const res = {
        json: vi.fn(),
      };

      await callRoute('get', '/', req, res);

      expect(mockPrisma.deviation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: mockUser.id },
        })
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          deviations: expect.any(Array),
          total: 1,
        })
      );
    });

    it('should handle pagination', async () => {
      mockPrisma.deviation.findMany.mockResolvedValue([]);
      mockPrisma.deviation.count.mockResolvedValue(0);

      const req = {
        user: mockUser,
        query: {
          page: '2',
          limit: '10',
        },
      };
      const res = {
        json: vi.fn(),
      };

      await callRoute('get', '/', req, res);

      expect(mockPrisma.deviation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 10,
        })
      );
    });
  });

  describe('GET /:id', () => {
    it('should get single deviation successfully', async () => {
      const deviationWithFiles = {
        ...mockDeviation,
        files: [{ id: 'file-1', storageKey: 'test.jpg' }],
      };
      mockPrisma.deviation.findFirst.mockResolvedValue(deviationWithFiles);

      const req = {
        user: mockUser,
        params: { id: mockDeviation.id },
      };
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await callRoute('get', `/${mockDeviation.id}`, req, res);

      expect(mockPrisma.deviation.findFirst).toHaveBeenCalledWith({
        where: { id: mockDeviation.id, userId: mockUser.id },
        include: { files: true },
      });
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          id: mockDeviation.id,
        })
      );
    });

    it('should return 404 when deviation not found', async () => {
      mockPrisma.deviation.findFirst.mockResolvedValue(null);

      const req = {
        user: mockUser,
        params: { id: 'non-existent' },
      };
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await callRoute('get', '/non-existent', req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Deviation not found' });
    });
  });

  describe('POST /', () => {
    it('should create deviation successfully', async () => {
      mockPrisma.deviation.create.mockResolvedValue(mockDeviation);

      const req = {
        user: mockUser,
        body: {
          title: 'New Deviation',
        },
      };
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await callRoute('post', '/', req, res);

      expect(mockPrisma.deviation.create).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        id: expect.any(String),
      }));
    });

    it('should validate title (min 1, max 200 chars)', async () => {
      const req = {
        user: mockUser,
        body: {
          title: '', // Empty title
        },
      };
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await callRoute('post', '/', req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid request data',
        })
      );
    });
  });

  describe('PATCH /:id', () => {
    it('should update deviation successfully', async () => {
      mockPrisma.deviation.findFirst.mockResolvedValue(mockDeviation);
      mockPrisma.deviation.update.mockResolvedValue({
        ...mockDeviation,
        title: 'Updated Title',
      });

      const req = {
        user: mockUser,
        params: { id: mockDeviation.id },
        body: {
          title: 'Updated Title',
        },
      };
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await callRoute('patch', `/${mockDeviation.id}`, req, res);

      expect(mockPrisma.deviation.update).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Updated Title',
        })
      );
    });

    it('should return 404 when deviation not found', async () => {
      mockPrisma.deviation.findFirst.mockResolvedValue(null);

      const req = {
        user: mockUser,
        params: { id: 'non-existent' },
        body: { title: 'Updated' },
      };
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await callRoute('patch', '/non-existent', req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('DELETE /:id', () => {
    it('should delete deviation successfully', async () => {
      const deviationWithFiles = {
        ...mockDeviation,
        files: [{ id: 'file-1', storageKey: 'test.jpg' }],
      };
      mockPrisma.deviation.findFirst.mockResolvedValue(deviationWithFiles);
      mockPrisma.deviation.delete.mockResolvedValue(mockDeviation);

      const req = {
        user: mockUser,
        params: { id: mockDeviation.id },
      };
      const res = {
        send: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await callRoute('delete', `/${mockDeviation.id}`, req, res);

      expect(mockPrisma.deviation.delete).toHaveBeenCalledWith({
        where: { id: mockDeviation.id },
      });
      expect(res.status).toHaveBeenCalledWith(204);
    });

    it('should return 404 when deviation not found', async () => {
      mockPrisma.deviation.findFirst.mockResolvedValue(null);

      const req = {
        user: mockUser,
        params: { id: 'non-existent' },
      };
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await callRoute('delete', '/non-existent', req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('POST /:id/schedule', () => {
    it('should schedule deviation successfully', async () => {
      const scheduledDev = {
        ...mockDeviation,
        status: 'scheduled' as const,
        scheduledAt: new Date(),
      };
      const deviationWithFiles = {
        ...mockDeviation,
        files: [{ id: 'file-1', storageKey: 'test.jpg' }],
      };
      mockPrisma.deviation.findFirst.mockResolvedValue(deviationWithFiles);
      mockPrisma.deviation.update.mockResolvedValue(scheduledDev);
      mockScheduleDeviation.mockResolvedValue(undefined);

      const req = {
        user: mockUser,
        params: { id: mockDeviation.id },
        body: {
          scheduledAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours
        },
      };
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await callRoute('post', `/${mockDeviation.id}/schedule`, req, res);

      expect(mockScheduleDeviation).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'scheduled',
        })
      );
    });

    it('should validate scheduledAt is in the future', async () => {
      const deviationWithFiles = {
        ...mockDeviation,
        files: [{ id: 'file-1', storageKey: 'test.jpg' }],
      };
      mockPrisma.deviation.findFirst.mockResolvedValue(deviationWithFiles);

      const req = {
        user: mockUser,
        params: { id: mockDeviation.id },
        body: {
          scheduledAt: new Date(Date.now() - 3600000).toISOString(), // Past date
        },
      };
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await callRoute('post', `/${mockDeviation.id}/schedule`, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('future'),
        })
      );
    });
  });

  describe('POST /:id/publish-now', () => {
    it('should publish deviation immediately', async () => {
      const publishedDev = {
        ...mockDeviation,
        status: 'publishing' as const,
      };
      const deviationWithFiles = {
        ...mockDeviation,
        files: [{ id: 'file-1', storageKey: 'test.jpg' }],
      };
      mockPrisma.deviation.findFirst.mockResolvedValue(deviationWithFiles);
      mockPrisma.deviation.update.mockResolvedValue(publishedDev);
      mockPublishDeviationNow.mockResolvedValue(undefined);

      const req = {
        user: mockUser,
        params: { id: mockDeviation.id },
      };
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await callRoute('post', `/${mockDeviation.id}/publish-now`, req, res);

      expect(mockPublishDeviationNow).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'publishing',
        })
      );
    });
  });

  describe('POST /:id/cancel', () => {
    it('should cancel scheduled deviation', async () => {
      const scheduledDev = {
        ...mockDeviation,
        status: 'scheduled' as const,
        scheduledAt: new Date(),
        files: [{ id: 'file-1', storageKey: 'test.jpg' }],
      };
      const cancelledDev = {
        ...scheduledDev,
        status: 'draft' as const,
        scheduledAt: null,
      };
      mockPrisma.deviation.findFirst.mockResolvedValue(scheduledDev);
      mockPrisma.deviation.update.mockResolvedValue(cancelledDev);
      mockCancelScheduledDeviation.mockResolvedValue(undefined);

      const req = {
        user: mockUser,
        params: { id: mockDeviation.id },
      };
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await callRoute('post', `/${mockDeviation.id}/cancel`, req, res);

      expect(mockCancelScheduledDeviation).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'draft',
        })
      );
    });
  });

  describe('PATCH /:id/files/reorder', () => {
    it('should reorder files successfully', async () => {
      mockPrisma.deviation.findFirst.mockResolvedValue(mockDeviation);

      const req = {
        user: mockUser,
        params: { id: mockDeviation.id },
        body: {
          fileIds: ['file-1', 'file-2', 'file-3'],
        },
      };
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await callRoute('patch', `/${mockDeviation.id}/files/reorder`, req, res);

      expect(res.json).toHaveBeenCalledWith({ success: true });
    });
  });

  describe('POST /batch-delete', () => {
    it('should batch delete deviations successfully', async () => {
      const draftDeviation = {
        ...mockDeviation,
        files: [{ id: 'file-1', storageKey: 'test.jpg' }],
      };
      mockPrisma.deviation.findMany.mockResolvedValue([draftDeviation]);
      mockPrisma.deviation.deleteMany.mockResolvedValue({ count: 1 });

      const req = {
        user: mockUser,
        body: {
          deviationIds: [mockDeviation.id],
        },
      };
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await callRoute('post', '/batch-delete', req, res);

      expect(mockPrisma.deviation.deleteMany).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          deletedCount: 1,
        })
      );
    });
  });

  describe('POST /batch-reschedule', () => {
    it('should batch reschedule deviations successfully', async () => {
      const scheduledDev = {
        ...mockDeviation,
        status: 'scheduled' as const,
        scheduledAt: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours
        actualPublishAt: new Date(Date.now() + 3600100),
        files: [{ id: 'file-1', storageKey: 'test.jpg' }],
      };
      mockPrisma.deviation.findMany.mockResolvedValue([scheduledDev]);
      mockPrisma.deviation.update.mockResolvedValue(scheduledDev);
      mockCancelScheduledDeviation.mockResolvedValue(undefined);
      mockScheduleDeviation.mockResolvedValue(undefined);

      const req = {
        user: mockUser,
        body: {
          deviationIds: [mockDeviation.id],
          scheduledAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours
        },
      };
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await callRoute('post', '/batch-reschedule', req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          deviations: expect.arrayContaining([
            expect.objectContaining({
              status: 'scheduled',
            }),
          ]),
          summary: expect.objectContaining({
            total: 1,
            succeeded: 1,
            failed: 0,
          }),
        })
      );
    });
  });

  describe('POST /batch-cancel', () => {
    it('should batch cancel scheduled deviations', async () => {
      const scheduledDev = {
        ...mockDeviation,
        status: 'scheduled' as const,
        scheduledAt: new Date(),
        files: [{ id: 'file-1', storageKey: 'test.jpg' }],
      };
      const cancelledDev = {
        ...scheduledDev,
        status: 'draft' as const,
        scheduledAt: null,
      };
      mockPrisma.deviation.findMany.mockResolvedValue([scheduledDev]);
      mockPrisma.deviation.update.mockResolvedValue(cancelledDev);
      mockCancelScheduledDeviation.mockResolvedValue(undefined);

      const req = {
        user: mockUser,
        body: {
          deviationIds: [mockDeviation.id],
        },
      };
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await callRoute('post', '/batch-cancel', req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          deviations: expect.arrayContaining([
            expect.objectContaining({
              status: 'draft',
            }),
          ]),
        })
      );
    });
  });

  describe('POST /batch-schedule', () => {
    it('should batch schedule deviations', async () => {
      const draftWithFiles = {
        ...mockDeviation,
        files: [{ id: 'file-1', storageKey: 'test.jpg' }],
      };
      const futureTime = Date.now() + 2 * 60 * 60 * 1000; // 2 hours
      const scheduledDev = {
        ...mockDeviation,
        status: 'scheduled' as const,
        scheduledAt: new Date(futureTime),
        actualPublishAt: new Date(futureTime + 100),
      };
      mockPrisma.deviation.findMany.mockResolvedValue([draftWithFiles]);
      mockPrisma.deviation.update.mockResolvedValue(scheduledDev);
      mockScheduleDeviation.mockResolvedValue(undefined);

      const req = {
        user: mockUser,
        body: {
          deviationIds: [mockDeviation.id],
          scheduledAt: new Date(futureTime).toISOString(),
        },
      };
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await callRoute('post', '/batch-schedule', req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          deviations: expect.arrayContaining([
            expect.objectContaining({
              status: 'scheduled',
            }),
          ]),
          summary: expect.objectContaining({
            total: 1,
            succeeded: 1,
            failed: 0,
          }),
        })
      );
    });
  });

  describe('POST /batch-publish-now', () => {
    it('should batch publish deviations immediately', async () => {
      const draftWithFiles = {
        ...mockDeviation,
        files: [{ id: 'file-1', storageKey: 'test.jpg' }],
      };
      const publishingDev = {
        ...mockDeviation,
        status: 'publishing' as const,
      };
      mockPrisma.deviation.findMany.mockResolvedValue([draftWithFiles]);
      mockPrisma.deviation.update.mockResolvedValue(publishingDev);
      mockPublishDeviationNow.mockResolvedValue(undefined);

      const req = {
        user: mockUser,
        body: {
          deviationIds: [mockDeviation.id],
        },
      };
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await callRoute('post', '/batch-publish-now', req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          deviations: expect.arrayContaining([
            expect.objectContaining({
              status: 'publishing',
            }),
          ]),
          summary: expect.objectContaining({
            total: 1,
            succeeded: 1,
            failed: 0,
          }),
        })
      );
    });
  });
});
