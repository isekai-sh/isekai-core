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
import { automationsRouter } from './automations.js';
import { createMockRequest, createMockResponse } from '../test-helpers/express-mock.js';

// Mock dependencies
vi.mock('../db/index.js', () => ({
  prisma: {
    automation: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    pricePreset: {
      findFirst: vi.fn(),
    },
    automationScheduleRule: {
      count: vi.fn(),
    },
    automationExecutionLog: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

import { prisma } from '../db/index.js';

describe('automations routes', () => {
  const mockUser = {
    id: 'user-123',
    deviantartId: 'da-123',
    username: 'testuser',
  };

  const mockAutomation = {
    id: 'automation-123',
    userId: 'user-123',
    name: 'Daily Upload',
    description: 'Uploads art daily',
    color: '#FF5733',
    icon: '🎨',
    enabled: false,
    isExecuting: false,
    draftSelectionMethod: 'fifo',
    stashOnlyByDefault: false,
    jitterMinSeconds: 0,
    jitterMaxSeconds: 300,
    sortOrder: 0,
    autoAddToSaleQueue: false,
    saleQueuePresetId: null,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  };

  const mockScheduleRule = {
    id: 'rule-123',
    automationId: 'automation-123',
    type: 'fixed_time',
    timeOfDay: '14:00',
    enabled: true,
    priority: 0,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function callRoute(method: string, path: string, req: any, res: any) {
    const routes = (automationsRouter as any).stack;
    const route = routes.find(
      (r: any) => r.route?.path === path && r.route?.methods?.[method.toLowerCase()]
    );
    if (!route) throw new Error(`Route not found: ${method} ${path}`);
    const handler = route.route.stack[route.route.stack.length - 1].handle;
    await handler(req, res);
  }

  describe('GET /', () => {
    it('should list all automations with related data', async () => {
      const req = createMockRequest({ user: mockUser });
      const res = createMockResponse();

      (prisma.automation.findMany as any).mockResolvedValue([
        {
          ...mockAutomation,
          scheduleRules: [mockScheduleRule],
          saleQueuePreset: null,
          _count: {
            scheduleRules: 1,
            defaultValues: 0,
          },
        },
      ]);

      await callRoute('GET', '/', req, res);

      expect(prisma.automation.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        include: {
          scheduleRules: {
            where: { enabled: true },
            orderBy: { priority: 'asc' },
          },
          saleQueuePreset: true,
          _count: {
            select: {
              scheduleRules: true,
              defaultValues: true,
            },
          },
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
      expect(res.json).toHaveBeenCalledWith({
        automations: [
          expect.objectContaining({
            id: 'automation-123',
            createdAt: '2024-01-01T00:00:00.000Z',
            scheduleRules: [
              expect.objectContaining({
                id: 'rule-123',
                createdAt: '2024-01-01T00:00:00.000Z',
              }),
            ],
          }),
        ],
      });
    });
  });

  describe('PATCH /reorder', () => {
    it('should reorder automations successfully', async () => {
      const automationIds = ['auto-1', 'auto-2', 'auto-3'];
      const req = createMockRequest({
        user: mockUser,
        body: { automationIds },
      });
      const res = createMockResponse();

      (prisma.automation.count as any).mockResolvedValue(3);
      (prisma.automation.update as any).mockResolvedValue(mockAutomation);

      await callRoute('PATCH', '/reorder', req, res);

      expect(prisma.automation.count).toHaveBeenCalledWith({
        where: { id: { in: automationIds }, userId: 'user-123' },
      });
      expect(prisma.automation.update).toHaveBeenCalledTimes(3);
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it('should reject when not all automations are owned', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: { automationIds: ['auto-1', 'auto-2'] },
      });
      const res = createMockResponse();

      (prisma.automation.count as any).mockResolvedValue(1);

      await expect(callRoute('PATCH', '/reorder', req, res)).rejects.toThrow(
        'Some automations not found or not owned by user'
      );
    });
  });

  describe('GET /:id', () => {
    it('should get single automation with full details', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'automation-123' },
      });
      const res = createMockResponse();

      (prisma.automation.findFirst as any).mockResolvedValue({
        ...mockAutomation,
        scheduleRules: [mockScheduleRule],
        defaultValues: [],
        saleQueuePreset: null,
        executionLogs: [],
      });

      await callRoute('GET', '/:id', req, res);

      expect(prisma.automation.findFirst).toHaveBeenCalledWith({
        where: { id: 'automation-123', userId: 'user-123' },
        include: {
          scheduleRules: {
            orderBy: { priority: 'asc' },
          },
          defaultValues: true,
          saleQueuePreset: true,
          executionLogs: {
            orderBy: { executedAt: 'desc' },
            take: 20,
          },
        },
      });
      expect(res.json).toHaveBeenCalledWith({
        automation: expect.objectContaining({
          id: 'automation-123',
          createdAt: '2024-01-01T00:00:00.000Z',
        }),
      });
    });

    it('should return 404 when automation not found', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'nonexistent' },
      });
      const res = createMockResponse();

      (prisma.automation.findFirst as any).mockResolvedValue(null);

      await expect(callRoute('GET', '/:id', req, res)).rejects.toThrow('Automation not found');
    });
  });

  describe('POST /', () => {
    it('should create automation with all fields', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: {
          name: 'New Automation',
          description: 'Test automation',
          color: '#FF5733',
          icon: '🎨',
          draftSelectionMethod: 'random',
          stashOnlyByDefault: true,
          jitterMinSeconds: 60,
          jitterMaxSeconds: 600,
          sortOrder: 5,
          autoAddToSaleQueue: false,
        },
      });
      const res = createMockResponse();

      (prisma.automation.create as any).mockResolvedValue({
        ...mockAutomation,
        name: 'New Automation',
        sortOrder: 5,
      });

      await callRoute('POST', '/', req, res);

      expect(prisma.automation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-123',
          name: 'New Automation',
          description: 'Test automation',
          color: '#FF5733',
          sortOrder: 5,
        }),
      });
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('should use defaults when optional fields omitted', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: {
          name: 'Simple Automation',
        },
      });
      const res = createMockResponse();

      (prisma.automation.findFirst as any).mockResolvedValue(null);
      (prisma.automation.create as any).mockResolvedValue(mockAutomation);

      await callRoute('POST', '/', req, res);

      expect(prisma.automation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          draftSelectionMethod: 'fifo',
          stashOnlyByDefault: false,
          jitterMinSeconds: 0,
          jitterMaxSeconds: 300,
          autoAddToSaleQueue: false,
        }),
      });
    });

    it('should auto-calculate sortOrder when not provided', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: { name: 'Test' },
      });
      const res = createMockResponse();

      (prisma.automation.findFirst as any).mockResolvedValue({ sortOrder: 5 });
      (prisma.automation.create as any).mockResolvedValue(mockAutomation);

      await callRoute('POST', '/', req, res);

      expect(prisma.automation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sortOrder: 6,
        }),
      });
    });

    it('should reject when jitterMin > jitterMax', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: {
          name: 'Test',
          jitterMinSeconds: 600,
          jitterMaxSeconds: 300,
        },
      });
      const res = createMockResponse();

      await expect(callRoute('POST', '/', req, res)).rejects.toThrow(
        'jitterMinSeconds cannot be greater than jitterMaxSeconds'
      );
    });

    it('should reject when autoAddToSaleQueue is true without preset', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: {
          name: 'Test',
          autoAddToSaleQueue: true,
        },
      });
      const res = createMockResponse();

      await expect(callRoute('POST', '/', req, res)).rejects.toThrow(
        'Must select price preset when sale queue is enabled'
      );
    });

    it('should validate sale queue preset exists', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: {
          name: 'Test',
          autoAddToSaleQueue: true,
          saleQueuePresetId: '00000000-0000-0000-0000-000000000001',
        },
      });
      const res = createMockResponse();

      (prisma.pricePreset.findFirst as any).mockResolvedValue(null);

      await expect(callRoute('POST', '/', req, res)).rejects.toThrow(
        'Price preset not found or not owned by user'
      );
    });

    it('should create with valid sale queue preset', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: {
          name: 'Test',
          autoAddToSaleQueue: true,
          saleQueuePresetId: '00000000-0000-0000-0000-000000000001',
        },
      });
      const res = createMockResponse();

      (prisma.pricePreset.findFirst as any).mockResolvedValue({
        id: '00000000-0000-0000-0000-000000000001',
      });
      (prisma.automation.findFirst as any).mockResolvedValue(null);
      (prisma.automation.create as any).mockResolvedValue({
        ...mockAutomation,
        autoAddToSaleQueue: true,
        saleQueuePresetId: '00000000-0000-0000-0000-000000000001',
      });

      await callRoute('POST', '/', req, res);

      expect(prisma.automation.create).toHaveBeenCalled();
    });
  });

  describe('PATCH /:id', () => {
    it('should update automation successfully', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'automation-123' },
        body: { name: 'Updated Name' },
      });
      const res = createMockResponse();

      (prisma.automation.findFirst as any).mockResolvedValue(mockAutomation);
      (prisma.automation.update as any).mockResolvedValue({
        ...mockAutomation,
        name: 'Updated Name',
      });

      await callRoute('PATCH', '/:id', req, res);

      expect(prisma.automation.update).toHaveBeenCalledWith({
        where: { id: 'automation-123' },
        data: { name: 'Updated Name' },
      });
    });

    it('should reject update while automation is executing', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'automation-123' },
        body: { name: 'Updated' },
      });
      const res = createMockResponse();

      (prisma.automation.findFirst as any).mockResolvedValue({
        ...mockAutomation,
        isExecuting: true,
      });

      await expect(callRoute('PATCH', '/:id', req, res)).rejects.toThrow(
        'Cannot update automation while it is executing'
      );
    });

    it('should reject enabling without active rules', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'automation-123' },
        body: { enabled: true },
      });
      const res = createMockResponse();

      (prisma.automation.findFirst as any).mockResolvedValue(mockAutomation);
      (prisma.automationScheduleRule.count as any).mockResolvedValue(0);

      await expect(callRoute('PATCH', '/:id', req, res)).rejects.toThrow(
        'Cannot enable automation without at least one active schedule rule'
      );
    });

    it('should allow enabling with active rules', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'automation-123' },
        body: { enabled: true },
      });
      const res = createMockResponse();

      (prisma.automation.findFirst as any).mockResolvedValue(mockAutomation);
      (prisma.automationScheduleRule.count as any).mockResolvedValue(1);
      (prisma.automation.update as any).mockResolvedValue({
        ...mockAutomation,
        enabled: true,
      });

      await callRoute('PATCH', '/:id', req, res);

      expect(prisma.automation.update).toHaveBeenCalled();
    });

    it('should validate jitter range on update', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'automation-123' },
        body: {
          jitterMinSeconds: 600,
          jitterMaxSeconds: 300,
        },
      });
      const res = createMockResponse();

      (prisma.automation.findFirst as any).mockResolvedValue(mockAutomation);

      await expect(callRoute('PATCH', '/:id', req, res)).rejects.toThrow(
        'jitterMinSeconds cannot be greater than jitterMaxSeconds'
      );
    });

    it('should require preset when enabling autoAddToSaleQueue', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'automation-123' },
        body: { autoAddToSaleQueue: true },
      });
      const res = createMockResponse();

      (prisma.automation.findFirst as any).mockResolvedValue(mockAutomation);

      await expect(callRoute('PATCH', '/:id', req, res)).rejects.toThrow(
        'Must select price preset when enabling sale queue'
      );
    });

    it('should return 404 when automation not found', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'nonexistent' },
        body: { name: 'Updated' },
      });
      const res = createMockResponse();

      (prisma.automation.findFirst as any).mockResolvedValue(null);

      await expect(callRoute('PATCH', '/:id', req, res)).rejects.toThrow(
        'Automation config not found'
      );
    });
  });

  describe('DELETE /:id', () => {
    it('should delete automation successfully', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'automation-123' },
      });
      const res = createMockResponse();

      (prisma.automation.findFirst as any).mockResolvedValue(mockAutomation);
      (prisma.automation.delete as any).mockResolvedValue(mockAutomation);

      await callRoute('DELETE', '/:id', req, res);

      expect(prisma.automation.delete).toHaveBeenCalledWith({
        where: { id: 'automation-123' },
      });
      expect(res.status).toHaveBeenCalledWith(204);
    });

    it('should reject deletion while executing', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'automation-123' },
      });
      const res = createMockResponse();

      (prisma.automation.findFirst as any).mockResolvedValue({
        ...mockAutomation,
        isExecuting: true,
      });

      await expect(callRoute('DELETE', '/:id', req, res)).rejects.toThrow(
        'Cannot delete automation while it is executing'
      );
    });

    it('should return 404 when automation not found', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'nonexistent' },
      });
      const res = createMockResponse();

      (prisma.automation.findFirst as any).mockResolvedValue(null);

      await expect(callRoute('DELETE', '/:id', req, res)).rejects.toThrow(
        'Automation config not found'
      );
    });
  });

  describe('POST /:id/toggle', () => {
    it('should toggle from disabled to enabled with rules', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'automation-123' },
      });
      const res = createMockResponse();

      (prisma.automation.findFirst as any).mockResolvedValue(mockAutomation);
      (prisma.automationScheduleRule.count as any).mockResolvedValue(1);
      (prisma.automation.update as any).mockResolvedValue({
        ...mockAutomation,
        enabled: true,
      });

      await callRoute('POST', '/:id/toggle', req, res);

      expect(prisma.automation.update).toHaveBeenCalledWith({
        where: { id: 'automation-123' },
        data: { enabled: true },
      });
    });

    it('should toggle from enabled to disabled', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'automation-123' },
      });
      const res = createMockResponse();

      (prisma.automation.findFirst as any).mockResolvedValue({
        ...mockAutomation,
        enabled: true,
      });
      (prisma.automation.update as any).mockResolvedValue({
        ...mockAutomation,
        enabled: false,
      });

      await callRoute('POST', '/:id/toggle', req, res);

      expect(prisma.automation.update).toHaveBeenCalledWith({
        where: { id: 'automation-123' },
        data: { enabled: false },
      });
    });

    it('should reject enabling without active rules', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'automation-123' },
      });
      const res = createMockResponse();

      (prisma.automation.findFirst as any).mockResolvedValue(mockAutomation);
      (prisma.automationScheduleRule.count as any).mockResolvedValue(0);

      await expect(callRoute('POST', '/:id/toggle', req, res)).rejects.toThrow(
        'Cannot enable automation without at least one active schedule rule'
      );
    });

    it('should return 404 when automation not found', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'nonexistent' },
      });
      const res = createMockResponse();

      (prisma.automation.findFirst as any).mockResolvedValue(null);

      await expect(callRoute('POST', '/:id/toggle', req, res)).rejects.toThrow(
        'Automation config not found'
      );
    });
  });

  describe('GET /:id/logs', () => {
    it('should get execution logs with pagination', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'automation-123' },
        query: { page: '1', limit: '20' },
      });
      const res = createMockResponse();

      const mockLog = {
        id: 'log-123',
        automationId: 'automation-123',
        executedAt: new Date('2024-01-01T10:00:00Z'),
        deviationId: 'dev-123',
        success: true,
      };

      (prisma.automation.findFirst as any).mockResolvedValue(mockAutomation);
      (prisma.automationExecutionLog.findMany as any).mockResolvedValue([mockLog]);
      (prisma.automationExecutionLog.count as any).mockResolvedValue(1);

      await callRoute('GET', '/:id/logs', req, res);

      expect(prisma.automationExecutionLog.findMany).toHaveBeenCalledWith({
        where: { automationId: 'automation-123' },
        orderBy: { executedAt: 'desc' },
        skip: 0,
        take: 20,
      });
      expect(res.json).toHaveBeenCalledWith({
        logs: [
          expect.objectContaining({
            executedAt: '2024-01-01T10:00:00.000Z',
          }),
        ],
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
        },
      });
    });

    it('should return 404 when automation not found', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'nonexistent' },
        query: {},
      });
      const res = createMockResponse();

      (prisma.automation.findFirst as any).mockResolvedValue(null);

      await expect(callRoute('GET', '/:id/logs', req, res)).rejects.toThrow(
        'Automation config not found'
      );
    });
  });

  describe('POST /:id/test', () => {
    it('should test automation successfully', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'automation-123' },
      });
      const res = createMockResponse();

      (prisma.automation.findFirst as any).mockResolvedValue({
        ...mockAutomation,
        scheduleRules: [mockScheduleRule],
        defaultValues: [],
      });

      await callRoute('POST', '/:id/test', req, res);

      expect(res.json).toHaveBeenCalledWith({
        message: 'Test triggered successfully',
        config: {
          enabled: false,
          draftSelectionMethod: 'fifo',
          stashOnlyByDefault: false,
          activeRules: 1,
          defaultValues: 0,
        },
      });
    });

    it('should reject test without active rules', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'automation-123' },
      });
      const res = createMockResponse();

      (prisma.automation.findFirst as any).mockResolvedValue({
        ...mockAutomation,
        scheduleRules: [],
        defaultValues: [],
      });

      await expect(callRoute('POST', '/:id/test', req, res)).rejects.toThrow(
        'Cannot test automation without at least one active schedule rule'
      );
    });

    it('should return 404 when automation not found', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'nonexistent' },
      });
      const res = createMockResponse();

      (prisma.automation.findFirst as any).mockResolvedValue(null);

      await expect(callRoute('POST', '/:id/test', req, res)).rejects.toThrow(
        'Automation config not found'
      );
    });
  });
});
