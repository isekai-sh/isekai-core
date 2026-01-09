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
import { automationScheduleRulesRouter } from './automation-schedule-rules.js';
import { createMockRequest, createMockResponse } from '../test-helpers/express-mock.js';

// Mock dependencies
vi.mock('../db/index.js', () => ({
  prisma: {
    automation: {
      findFirst: vi.fn(),
    },
    automationScheduleRule: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
  },
}));

import { prisma } from '../db/index.js';

describe('automation-schedule-rules routes', () => {
  const mockUser = {
    id: 'user-123',
    deviantartId: 'da-123',
    username: 'testuser',
  };

  const mockAutomation = {
    id: 'automation-123',
    userId: 'user-123',
    enabled: true,
  };

  const mockFixedTimeRule = {
    id: 'rule-1',
    automationId: 'automation-123',
    type: 'fixed_time',
    timeOfDay: '14:30',
    daysOfWeek: ['monday', 'wednesday', 'friday'],
    priority: 0,
    enabled: true,
    intervalMinutes: null,
    deviationsPerInterval: null,
    dailyQuota: null,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  };

  const mockFixedIntervalRule = {
    id: 'rule-2',
    automationId: 'automation-123',
    type: 'fixed_interval',
    timeOfDay: null,
    daysOfWeek: null,
    intervalMinutes: 60,
    deviationsPerInterval: 5,
    priority: 1,
    enabled: true,
    dailyQuota: null,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  };

  const mockDailyQuotaRule = {
    id: 'rule-3',
    automationId: 'automation-123',
    type: 'daily_quota',
    timeOfDay: null,
    daysOfWeek: ['tuesday', 'thursday'],
    intervalMinutes: null,
    deviationsPerInterval: null,
    dailyQuota: 10,
    priority: 2,
    enabled: true,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function callRoute(method: string, path: string, req: any, res: any) {
    const routes = (automationScheduleRulesRouter as any).stack;
    const route = routes.find(
      (r: any) => r.route?.path === path && r.route?.methods?.[method.toLowerCase()]
    );
    if (!route) throw new Error(`Route not found: ${method} ${path}`);
    const handler = route.route.stack[route.route.stack.length - 1].handle;
    await handler(req, res);
  }

  describe('GET /', () => {
    it('should list schedule rules for automation', async () => {
      const req = createMockRequest({
        user: mockUser,
        query: { automationId: 'automation-123' },
      });
      const res = createMockResponse();

      (prisma.automation.findFirst as any).mockResolvedValue(mockAutomation);
      (prisma.automationScheduleRule.findMany as any).mockResolvedValue([
        mockFixedTimeRule,
        mockFixedIntervalRule,
      ]);

      await callRoute('GET', '/', req, res);

      expect(prisma.automation.findFirst).toHaveBeenCalledWith({
        where: { id: 'automation-123', userId: 'user-123' },
      });
      expect(prisma.automationScheduleRule.findMany).toHaveBeenCalledWith({
        where: { automationId: 'automation-123' },
        orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      });
      expect(res.json).toHaveBeenCalledWith({
        rules: [
          expect.objectContaining({
            id: 'rule-1',
            type: 'fixed_time',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          }),
          expect.objectContaining({
            id: 'rule-2',
            type: 'fixed_interval',
          }),
        ],
      });
    });

    it('should return 404 when automation not found', async () => {
      const req = createMockRequest({
        user: mockUser,
        query: { automationId: 'nonexistent' },
      });
      const res = createMockResponse();

      (prisma.automation.findFirst as any).mockResolvedValue(null);

      await expect(callRoute('GET', '/', req, res)).rejects.toThrow('Automation not found');
    });

    it('should return 404 when user does not own automation', async () => {
      const req = createMockRequest({
        user: mockUser,
        query: { automationId: 'automation-123' },
      });
      const res = createMockResponse();

      (prisma.automation.findFirst as any).mockResolvedValue(null);

      await expect(callRoute('GET', '/', req, res)).rejects.toThrow('Automation not found');
    });

    it('should reject when automationId is missing', async () => {
      const req = createMockRequest({
        user: mockUser,
        query: {},
      });
      const res = createMockResponse();

      await expect(callRoute('GET', '/', req, res)).rejects.toThrow();
    });
  });

  describe('POST / - fixed_time rule', () => {
    it('should create fixed_time rule with valid data', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: {
          automationId: 'automation-123',
          type: 'fixed_time',
          timeOfDay: '14:30',
          daysOfWeek: ['monday', 'wednesday', 'friday'],
          priority: 0,
          enabled: true,
        },
      });
      const res = createMockResponse();

      (prisma.automation.findFirst as any).mockResolvedValue(mockAutomation);
      (prisma.automationScheduleRule.create as any).mockResolvedValue(mockFixedTimeRule);

      await callRoute('POST', '/', req, res);

      expect(prisma.automationScheduleRule.create).toHaveBeenCalledWith({
        data: {
          automationId: 'automation-123',
          type: 'fixed_time',
          timeOfDay: '14:30',
          daysOfWeek: ['monday', 'wednesday', 'friday'],
          priority: 0,
          enabled: true,
        },
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        rule: expect.objectContaining({
          id: 'rule-1',
          type: 'fixed_time',
          timeOfDay: '14:30',
        }),
      });
    });

    it('should use default values for priority and enabled', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: {
          automationId: 'automation-123',
          type: 'fixed_time',
          timeOfDay: '09:00',
        },
      });
      const res = createMockResponse();

      (prisma.automation.findFirst as any).mockResolvedValue(mockAutomation);
      (prisma.automationScheduleRule.create as any).mockResolvedValue({
        ...mockFixedTimeRule,
        timeOfDay: '09:00',
        priority: 0,
        enabled: true,
      });

      await callRoute('POST', '/', req, res);

      expect(prisma.automationScheduleRule.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          priority: 0,
          enabled: true,
        }),
      });
    });

    it('should reject invalid time format', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: {
          automationId: 'automation-123',
          type: 'fixed_time',
          timeOfDay: '25:99',
        },
      });
      const res = createMockResponse();

      await expect(callRoute('POST', '/', req, res)).rejects.toThrow();
    });

    it('should reject invalid day of week', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: {
          automationId: 'automation-123',
          type: 'fixed_time',
          timeOfDay: '14:30',
          daysOfWeek: ['invalid'],
        },
      });
      const res = createMockResponse();

      await expect(callRoute('POST', '/', req, res)).rejects.toThrow();
    });

    it('should handle null daysOfWeek', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: {
          automationId: 'automation-123',
          type: 'fixed_time',
          timeOfDay: '14:30',
        },
      });
      const res = createMockResponse();

      (prisma.automation.findFirst as any).mockResolvedValue(mockAutomation);
      (prisma.automationScheduleRule.create as any).mockResolvedValue({
        ...mockFixedTimeRule,
        daysOfWeek: null,
      });

      await callRoute('POST', '/', req, res);

      expect(prisma.automationScheduleRule.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          daysOfWeek: null,
        }),
      });
    });
  });

  describe('POST / - fixed_interval rule', () => {
    it('should create fixed_interval rule with valid data', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: {
          automationId: 'automation-123',
          type: 'fixed_interval',
          intervalMinutes: 60,
          deviationsPerInterval: 5,
        },
      });
      const res = createMockResponse();

      (prisma.automation.findFirst as any).mockResolvedValue(mockAutomation);
      (prisma.automationScheduleRule.create as any).mockResolvedValue(mockFixedIntervalRule);

      await callRoute('POST', '/', req, res);

      expect(prisma.automationScheduleRule.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'fixed_interval',
          intervalMinutes: 60,
          deviationsPerInterval: 5,
        }),
      });
    });

    it('should reject intervalMinutes below minimum', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: {
          automationId: 'automation-123',
          type: 'fixed_interval',
          intervalMinutes: 4,
          deviationsPerInterval: 5,
        },
      });
      const res = createMockResponse();

      await expect(callRoute('POST', '/', req, res)).rejects.toThrow();
    });

    it('should reject intervalMinutes above maximum', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: {
          automationId: 'automation-123',
          type: 'fixed_interval',
          intervalMinutes: 10081,
          deviationsPerInterval: 5,
        },
      });
      const res = createMockResponse();

      await expect(callRoute('POST', '/', req, res)).rejects.toThrow();
    });

    it('should reject deviationsPerInterval below minimum', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: {
          automationId: 'automation-123',
          type: 'fixed_interval',
          intervalMinutes: 60,
          deviationsPerInterval: 0,
        },
      });
      const res = createMockResponse();

      await expect(callRoute('POST', '/', req, res)).rejects.toThrow();
    });

    it('should reject deviationsPerInterval above maximum', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: {
          automationId: 'automation-123',
          type: 'fixed_interval',
          intervalMinutes: 60,
          deviationsPerInterval: 101,
        },
      });
      const res = createMockResponse();

      await expect(callRoute('POST', '/', req, res)).rejects.toThrow();
    });
  });

  describe('POST / - daily_quota rule', () => {
    it('should create daily_quota rule with valid data', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: {
          automationId: 'automation-123',
          type: 'daily_quota',
          dailyQuota: 10,
          daysOfWeek: ['tuesday', 'thursday'],
        },
      });
      const res = createMockResponse();

      (prisma.automation.findFirst as any).mockResolvedValue(mockAutomation);
      (prisma.automationScheduleRule.create as any).mockResolvedValue(mockDailyQuotaRule);

      await callRoute('POST', '/', req, res);

      expect(prisma.automationScheduleRule.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'daily_quota',
          dailyQuota: 10,
        }),
      });
    });

    it('should reject dailyQuota below minimum', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: {
          automationId: 'automation-123',
          type: 'daily_quota',
          dailyQuota: 0,
        },
      });
      const res = createMockResponse();

      await expect(callRoute('POST', '/', req, res)).rejects.toThrow();
    });

    it('should reject dailyQuota above maximum', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: {
          automationId: 'automation-123',
          type: 'daily_quota',
          dailyQuota: 101,
        },
      });
      const res = createMockResponse();

      await expect(callRoute('POST', '/', req, res)).rejects.toThrow();
    });
  });

  describe('PATCH /:id', () => {
    it('should update fixed_time rule timeOfDay', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'rule-1' },
        body: { timeOfDay: '16:00' },
      });
      const res = createMockResponse();

      (prisma.automationScheduleRule.findUnique as any).mockResolvedValue({
        ...mockFixedTimeRule,
        automation: mockAutomation,
      });
      (prisma.automationScheduleRule.update as any).mockResolvedValue({
        ...mockFixedTimeRule,
        timeOfDay: '16:00',
      });

      await callRoute('PATCH', '/:id', req, res);

      expect(prisma.automationScheduleRule.update).toHaveBeenCalledWith({
        where: { id: 'rule-1' },
        data: { timeOfDay: '16:00' },
      });
    });

    it('should reject setting interval fields on fixed_time rule', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'rule-1' },
        body: { intervalMinutes: 30 },
      });
      const res = createMockResponse();

      (prisma.automationScheduleRule.findUnique as any).mockResolvedValue({
        ...mockFixedTimeRule,
        automation: mockAutomation,
      });

      await expect(callRoute('PATCH', '/:id', req, res)).rejects.toThrow(
        'Cannot set interval or quota fields on fixed_time rule'
      );
    });

    it('should reject setting quota on fixed_time rule', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'rule-1' },
        body: { dailyQuota: 10 },
      });
      const res = createMockResponse();

      (prisma.automationScheduleRule.findUnique as any).mockResolvedValue({
        ...mockFixedTimeRule,
        automation: mockAutomation,
      });

      await expect(callRoute('PATCH', '/:id', req, res)).rejects.toThrow(
        'Cannot set interval or quota fields on fixed_time rule'
      );
    });

    it('should update fixed_interval rule intervalMinutes', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'rule-2' },
        body: { intervalMinutes: 120 },
      });
      const res = createMockResponse();

      (prisma.automationScheduleRule.findUnique as any).mockResolvedValue({
        ...mockFixedIntervalRule,
        automation: mockAutomation,
      });
      (prisma.automationScheduleRule.update as any).mockResolvedValue({
        ...mockFixedIntervalRule,
        intervalMinutes: 120,
      });

      await callRoute('PATCH', '/:id', req, res);

      expect(prisma.automationScheduleRule.update).toHaveBeenCalledWith({
        where: { id: 'rule-2' },
        data: { intervalMinutes: 120 },
      });
    });

    it('should reject setting timeOfDay on fixed_interval rule', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'rule-2' },
        body: { timeOfDay: '14:00' },
      });
      const res = createMockResponse();

      (prisma.automationScheduleRule.findUnique as any).mockResolvedValue({
        ...mockFixedIntervalRule,
        automation: mockAutomation,
      });

      await expect(callRoute('PATCH', '/:id', req, res)).rejects.toThrow(
        'Cannot set timeOfDay or quota fields on fixed_interval rule'
      );
    });

    it('should update daily_quota rule dailyQuota', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'rule-3' },
        body: { dailyQuota: 20 },
      });
      const res = createMockResponse();

      (prisma.automationScheduleRule.findUnique as any).mockResolvedValue({
        ...mockDailyQuotaRule,
        automation: mockAutomation,
      });
      (prisma.automationScheduleRule.update as any).mockResolvedValue({
        ...mockDailyQuotaRule,
        dailyQuota: 20,
      });

      await callRoute('PATCH', '/:id', req, res);

      expect(prisma.automationScheduleRule.update).toHaveBeenCalledWith({
        where: { id: 'rule-3' },
        data: { dailyQuota: 20 },
      });
    });

    it('should reject setting time fields on daily_quota rule', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'rule-3' },
        body: { timeOfDay: '14:00' },
      });
      const res = createMockResponse();

      (prisma.automationScheduleRule.findUnique as any).mockResolvedValue({
        ...mockDailyQuotaRule,
        automation: mockAutomation,
      });

      await expect(callRoute('PATCH', '/:id', req, res)).rejects.toThrow(
        'Cannot set time or interval fields on daily_quota rule'
      );
    });

    it('should update common fields (priority, enabled, daysOfWeek)', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'rule-1' },
        body: {
          priority: 5,
          enabled: false,
          daysOfWeek: ['saturday', 'sunday'],
        },
      });
      const res = createMockResponse();

      (prisma.automationScheduleRule.findUnique as any).mockResolvedValue({
        ...mockFixedTimeRule,
        automation: mockAutomation,
      });
      (prisma.automationScheduleRule.update as any).mockResolvedValue({
        ...mockFixedTimeRule,
        priority: 5,
        enabled: false,
        daysOfWeek: ['saturday', 'sunday'],
      });

      await callRoute('PATCH', '/:id', req, res);

      expect(prisma.automationScheduleRule.update).toHaveBeenCalledWith({
        where: { id: 'rule-1' },
        data: {
          priority: 5,
          enabled: false,
          daysOfWeek: ['saturday', 'sunday'],
        },
      });
    });

    it('should return 404 when rule not found', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'nonexistent' },
        body: { priority: 1 },
      });
      const res = createMockResponse();

      (prisma.automationScheduleRule.findUnique as any).mockResolvedValue(null);

      await expect(callRoute('PATCH', '/:id', req, res)).rejects.toThrow('Schedule rule not found');
    });

    it('should return 404 when user does not own rule', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'rule-1' },
        body: { priority: 1 },
      });
      const res = createMockResponse();

      (prisma.automationScheduleRule.findUnique as any).mockResolvedValue({
        ...mockFixedTimeRule,
        automation: { ...mockAutomation, userId: 'different-user' },
      });

      await expect(callRoute('PATCH', '/:id', req, res)).rejects.toThrow('Schedule rule not found');
    });
  });

  describe('DELETE /:id', () => {
    it('should delete rule successfully', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'rule-1' },
      });
      const res = createMockResponse();

      (prisma.automationScheduleRule.findUnique as any).mockResolvedValue({
        ...mockFixedTimeRule,
        enabled: false,
        automation: mockAutomation,
      });
      (prisma.automationScheduleRule.delete as any).mockResolvedValue(mockFixedTimeRule);

      await callRoute('DELETE', '/:id', req, res);

      expect(prisma.automationScheduleRule.delete).toHaveBeenCalledWith({
        where: { id: 'rule-1' },
      });
      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalled();
    });

    it('should reject deleting last enabled rule when automation is enabled', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'rule-1' },
      });
      const res = createMockResponse();

      (prisma.automationScheduleRule.findUnique as any).mockResolvedValue({
        ...mockFixedTimeRule,
        enabled: true,
        automation: { ...mockAutomation, enabled: true },
      });
      (prisma.automationScheduleRule.count as any).mockResolvedValue(1);

      await expect(callRoute('DELETE', '/:id', req, res)).rejects.toThrow(
        'Cannot delete the last enabled rule while automation is enabled'
      );
    });

    it('should allow deleting last enabled rule when automation is disabled', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'rule-1' },
      });
      const res = createMockResponse();

      (prisma.automationScheduleRule.findUnique as any).mockResolvedValue({
        ...mockFixedTimeRule,
        enabled: true,
        automation: { ...mockAutomation, enabled: false },
      });
      (prisma.automationScheduleRule.delete as any).mockResolvedValue(mockFixedTimeRule);

      await callRoute('DELETE', '/:id', req, res);

      expect(prisma.automationScheduleRule.delete).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(204);
    });

    it('should allow deleting disabled rule even if it is the last one', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'rule-1' },
      });
      const res = createMockResponse();

      (prisma.automationScheduleRule.findUnique as any).mockResolvedValue({
        ...mockFixedTimeRule,
        enabled: false,
        automation: { ...mockAutomation, enabled: true },
      });
      (prisma.automationScheduleRule.delete as any).mockResolvedValue(mockFixedTimeRule);

      await callRoute('DELETE', '/:id', req, res);

      expect(prisma.automationScheduleRule.delete).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(204);
    });

    it('should allow deleting when multiple enabled rules exist', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'rule-1' },
      });
      const res = createMockResponse();

      (prisma.automationScheduleRule.findUnique as any).mockResolvedValue({
        ...mockFixedTimeRule,
        enabled: true,
        automation: { ...mockAutomation, enabled: true },
      });
      (prisma.automationScheduleRule.count as any).mockResolvedValue(3);
      (prisma.automationScheduleRule.delete as any).mockResolvedValue(mockFixedTimeRule);

      await callRoute('DELETE', '/:id', req, res);

      expect(prisma.automationScheduleRule.delete).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(204);
    });

    it('should return 404 when rule not found', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'nonexistent' },
      });
      const res = createMockResponse();

      (prisma.automationScheduleRule.findUnique as any).mockResolvedValue(null);

      await expect(callRoute('DELETE', '/:id', req, res)).rejects.toThrow(
        'Schedule rule not found'
      );
    });

    it('should return 404 when user does not own rule', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'rule-1' },
      });
      const res = createMockResponse();

      (prisma.automationScheduleRule.findUnique as any).mockResolvedValue({
        ...mockFixedTimeRule,
        automation: { ...mockAutomation, userId: 'different-user' },
      });

      await expect(callRoute('DELETE', '/:id', req, res)).rejects.toThrow(
        'Schedule rule not found'
      );
    });
  });
});
