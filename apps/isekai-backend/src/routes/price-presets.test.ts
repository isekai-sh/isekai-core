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
import { createMockRequest, createMockResponse } from '../test-helpers/express-mock.js';

// Mock Prisma
vi.mock('../db/index.js', () => ({
  prisma: {
    pricePreset: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    saleQueue: {
      count: vi.fn(),
    },
    automation: {
      count: vi.fn(),
    },
  },
}));

import { pricePresetsRouter } from './price-presets.js';
import { prisma } from '../db/index.js';

// Helper to call route handlers directly
async function callRoute(method: string, path: string, req: any, res: any) {
  const routes = (pricePresetsRouter as any).stack;
  const route = routes.find(
    (r: any) => r.route?.path === path && r.route?.methods?.[method.toLowerCase()]
  );

  if (!route) {
    throw new Error(`Route ${method} ${path} not found`);
  }

  const handler = route.route.stack[0].handle;
  await handler(req, res);
}

describe('price-presets routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET / - List price presets', () => {
    it('should return all presets for the authenticated user', async () => {
      const mockUser = { id: 'user-123' } as any;
      const mockPresets = [
        {
          id: 'preset-1',
          userId: 'user-123',
          name: 'Fixed Price',
          price: 500,
          minPrice: null,
          maxPrice: null,
          currency: 'USD',
          description: 'Standard price',
          isDefault: true,
          sortOrder: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'preset-2',
          userId: 'user-123',
          name: 'Price Range',
          price: 0,
          minPrice: 300,
          maxPrice: 800,
          currency: 'USD',
          description: 'Random price',
          isDefault: false,
          sortOrder: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const req = createMockRequest({ user: mockUser });
      const res = createMockResponse();

      (prisma.pricePreset.findMany as any).mockResolvedValue(mockPresets);

      await callRoute('GET', '/', req, res);

      expect(prisma.pricePreset.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      });

      expect(res.json).toHaveBeenCalledWith({ presets: mockPresets });
    });

    it('should return empty array when user has no presets', async () => {
      const mockUser = { id: 'user-123' } as any;
      const req = createMockRequest({ user: mockUser });
      const res = createMockResponse();

      (prisma.pricePreset.findMany as any).mockResolvedValue([]);

      await callRoute('GET', '/', req, res);

      expect(res.json).toHaveBeenCalledWith({ presets: [] });
    });

    it('should order by sortOrder ascending then createdAt descending', async () => {
      const mockUser = { id: 'user-123' } as any;
      const req = createMockRequest({ user: mockUser });
      const res = createMockResponse();

      (prisma.pricePreset.findMany as any).mockResolvedValue([]);

      await callRoute('GET', '/', req, res);

      const orderBy = (prisma.pricePreset.findMany as any).mock.calls[0][0].orderBy;
      expect(orderBy).toEqual([{ sortOrder: 'asc' }, { createdAt: 'desc' }]);
    });
  });

  describe('GET /:id - Get single preset', () => {
    it('should return preset when found', async () => {
      const mockUser = { id: 'user-123' } as any;
      const mockPreset = {
        id: 'preset-123',
        userId: 'user-123',
        name: 'Test Preset',
        price: 1000,
        minPrice: null,
        maxPrice: null,
        currency: 'USD',
        description: 'Test',
        isDefault: false,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const req = createMockRequest({
        user: mockUser,
        params: { id: 'preset-123' },
      });
      const res = createMockResponse();

      (prisma.pricePreset.findFirst as any).mockResolvedValue(mockPreset);

      await callRoute('GET', '/:id', req, res);

      expect(prisma.pricePreset.findFirst).toHaveBeenCalledWith({
        where: { id: 'preset-123', userId: 'user-123' },
      });

      expect(res.json).toHaveBeenCalledWith(mockPreset);
    });

    it('should throw 404 when preset not found', async () => {
      const mockUser = { id: 'user-123' } as any;
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'non-existent' },
      });
      const res = createMockResponse();

      (prisma.pricePreset.findFirst as any).mockResolvedValue(null);

      await expect(callRoute('GET', '/:id', req, res)).rejects.toThrow('Price preset not found');
    });
  });

  describe('POST / - Create price preset', () => {
    it('should create preset with fixed price', async () => {
      const mockUser = { id: 'user-123' } as any;
      const req = createMockRequest({
        user: mockUser,
        body: {
          name: 'Fixed Price',
          price: 500,
          currency: 'USD',
          description: 'Standard',
          isDefault: false,
          sortOrder: 0,
        },
      });
      const res = createMockResponse();

      const mockPreset = {
        id: 'preset-new',
        userId: 'user-123',
        name: 'Fixed Price',
        price: 500,
        minPrice: null,
        maxPrice: null,
        currency: 'USD',
        description: 'Standard',
        isDefault: false,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.pricePreset.create as any).mockResolvedValue(mockPreset);

      await callRoute('POST', '/', req, res);

      expect(prisma.pricePreset.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-123',
          name: 'Fixed Price',
          price: 500,
          minPrice: undefined,
          maxPrice: undefined,
          currency: 'USD',
          description: 'Standard',
          isDefault: false,
          sortOrder: 0,
        },
      });

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(mockPreset);
    });

    it('should create preset with price range', async () => {
      const mockUser = { id: 'user-123' } as any;
      const req = createMockRequest({
        user: mockUser,
        body: {
          name: 'Random Price',
          minPrice: 300,
          maxPrice: 800,
          currency: 'USD',
        },
      });
      const res = createMockResponse();

      (prisma.pricePreset.create as any).mockResolvedValue({
        id: 'preset-new',
        userId: 'user-123',
        name: 'Random Price',
        price: 0,
        minPrice: 300,
        maxPrice: 800,
        currency: 'USD',
        isDefault: false,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await callRoute('POST', '/', req, res);

      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('should reject when both fixed price and range are provided', async () => {
      const mockUser = { id: 'user-123' } as any;
      const req = createMockRequest({
        user: mockUser,
        body: {
          name: 'Invalid',
          price: 500,
          minPrice: 300,
          maxPrice: 800,
        },
      });
      const res = createMockResponse();

      await expect(callRoute('POST', '/', req, res)).rejects.toThrow();
    });

    it('should reject when neither fixed price nor range are provided', async () => {
      const mockUser = { id: 'user-123' } as any;
      const req = createMockRequest({
        user: mockUser,
        body: {
          name: 'Invalid',
          currency: 'USD',
        },
      });
      const res = createMockResponse();

      await expect(callRoute('POST', '/', req, res)).rejects.toThrow();
    });

    it('should reject when minPrice is greater than or equal to maxPrice', async () => {
      const mockUser = { id: 'user-123' } as any;
      const req = createMockRequest({
        user: mockUser,
        body: {
          name: 'Invalid Range',
          minPrice: 800,
          maxPrice: 300,
        },
      });
      const res = createMockResponse();

      await expect(callRoute('POST', '/', req, res)).rejects.toThrow();
    });

    it('should reject when minPrice equals maxPrice', async () => {
      const mockUser = { id: 'user-123' } as any;
      const req = createMockRequest({
        user: mockUser,
        body: {
          name: 'Invalid Range',
          minPrice: 500,
          maxPrice: 500,
        },
      });
      const res = createMockResponse();

      await expect(callRoute('POST', '/', req, res)).rejects.toThrow();
    });

    it('should unset other defaults when creating default preset', async () => {
      const mockUser = { id: 'user-123' } as any;
      const req = createMockRequest({
        user: mockUser,
        body: {
          name: 'New Default',
          price: 500,
          isDefault: true,
        },
      });
      const res = createMockResponse();

      (prisma.pricePreset.updateMany as any).mockResolvedValue({ count: 1 });
      (prisma.pricePreset.create as any).mockResolvedValue({
        id: 'preset-new',
        userId: 'user-123',
        name: 'New Default',
        price: 500,
        isDefault: true,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await callRoute('POST', '/', req, res);

      expect(prisma.pricePreset.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-123', isDefault: true },
        data: { isDefault: false },
      });
    });

    it('should not unset defaults when creating non-default preset', async () => {
      const mockUser = { id: 'user-123' } as any;
      const req = createMockRequest({
        user: mockUser,
        body: {
          name: 'Non-Default',
          price: 500,
          isDefault: false,
        },
      });
      const res = createMockResponse();

      (prisma.pricePreset.create as any).mockResolvedValue({
        id: 'preset-new',
        userId: 'user-123',
        name: 'Non-Default',
        price: 500,
        isDefault: false,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await callRoute('POST', '/', req, res);

      expect(prisma.pricePreset.updateMany).not.toHaveBeenCalled();
    });

    it('should validate price minimum of 100 cents', async () => {
      const mockUser = { id: 'user-123' } as any;
      const req = createMockRequest({
        user: mockUser,
        body: {
          name: 'Too Low',
          price: 99,
        },
      });
      const res = createMockResponse();

      await expect(callRoute('POST', '/', req, res)).rejects.toThrow();
    });

    it('should validate price maximum of 1000000 cents', async () => {
      const mockUser = { id: 'user-123' } as any;
      const req = createMockRequest({
        user: mockUser,
        body: {
          name: 'Too High',
          price: 1000001,
        },
      });
      const res = createMockResponse();

      await expect(callRoute('POST', '/', req, res)).rejects.toThrow();
    });

    it('should validate name is required', async () => {
      const mockUser = { id: 'user-123' } as any;
      const req = createMockRequest({
        user: mockUser,
        body: {
          price: 500,
        },
      });
      const res = createMockResponse();

      await expect(callRoute('POST', '/', req, res)).rejects.toThrow();
    });

    it('should validate name max length of 100', async () => {
      const mockUser = { id: 'user-123' } as any;
      const req = createMockRequest({
        user: mockUser,
        body: {
          name: 'a'.repeat(101),
          price: 500,
        },
      });
      const res = createMockResponse();

      await expect(callRoute('POST', '/', req, res)).rejects.toThrow();
    });

    it('should default currency to USD', async () => {
      const mockUser = { id: 'user-123' } as any;
      const req = createMockRequest({
        user: mockUser,
        body: {
          name: 'Test',
          price: 500,
        },
      });
      const res = createMockResponse();

      (prisma.pricePreset.create as any).mockResolvedValue({
        id: 'preset-new',
        userId: 'user-123',
        name: 'Test',
        price: 500,
        currency: 'USD',
        isDefault: false,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await callRoute('POST', '/', req, res);

      const createData = (prisma.pricePreset.create as any).mock.calls[0][0].data;
      expect(createData.currency).toBe('USD');
    });
  });

  describe('PATCH /:id - Update preset', () => {
    it('should update preset fields', async () => {
      const mockUser = { id: 'user-123' } as any;
      const existing = {
        id: 'preset-123',
        userId: 'user-123',
        name: 'Old Name',
        price: 500,
        minPrice: null,
        maxPrice: null,
        currency: 'USD',
        isDefault: false,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const req = createMockRequest({
        user: mockUser,
        params: { id: 'preset-123' },
        body: {
          name: 'New Name',
          price: 600,
        },
      });
      const res = createMockResponse();

      (prisma.pricePreset.findFirst as any).mockResolvedValue(existing);
      (prisma.pricePreset.update as any).mockResolvedValue({
        ...existing,
        name: 'New Name',
        price: 600,
      });

      await callRoute('PATCH', '/:id', req, res);

      expect(prisma.pricePreset.update).toHaveBeenCalledWith({
        where: { id: 'preset-123' },
        data: {
          name: 'New Name',
          price: 600,
        },
      });
    });

    it('should throw 404 when preset not found', async () => {
      const mockUser = { id: 'user-123' } as any;
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'non-existent' },
        body: { name: 'New Name' },
      });
      const res = createMockResponse();

      (prisma.pricePreset.findFirst as any).mockResolvedValue(null);

      await expect(callRoute('PATCH', '/:id', req, res)).rejects.toThrow('Price preset not found');
    });

    it('should unset other defaults when setting as default', async () => {
      const mockUser = { id: 'user-123' } as any;
      const existing = {
        id: 'preset-123',
        userId: 'user-123',
        name: 'Test',
        price: 500,
        isDefault: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const req = createMockRequest({
        user: mockUser,
        params: { id: 'preset-123' },
        body: { isDefault: true },
      });
      const res = createMockResponse();

      (prisma.pricePreset.findFirst as any).mockResolvedValue(existing);
      (prisma.pricePreset.updateMany as any).mockResolvedValue({ count: 1 });
      (prisma.pricePreset.update as any).mockResolvedValue({
        ...existing,
        isDefault: true,
      });

      await callRoute('PATCH', '/:id', req, res);

      expect(prisma.pricePreset.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-123', isDefault: true, id: { not: 'preset-123' } },
        data: { isDefault: false },
      });
    });

    it('should not unset defaults when not setting as default', async () => {
      const mockUser = { id: 'user-123' } as any;
      const existing = {
        id: 'preset-123',
        userId: 'user-123',
        name: 'Test',
        price: 500,
        isDefault: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const req = createMockRequest({
        user: mockUser,
        params: { id: 'preset-123' },
        body: { name: 'Updated' },
      });
      const res = createMockResponse();

      (prisma.pricePreset.findFirst as any).mockResolvedValue(existing);
      (prisma.pricePreset.update as any).mockResolvedValue({
        ...existing,
        name: 'Updated',
      });

      await callRoute('PATCH', '/:id', req, res);

      expect(prisma.pricePreset.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /:id - Delete preset', () => {
    it('should delete preset when not in use', async () => {
      const mockUser = { id: 'user-123' } as any;
      const existing = {
        id: 'preset-123',
        userId: 'user-123',
        name: 'Test',
        price: 500,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const req = createMockRequest({
        user: mockUser,
        params: { id: 'preset-123' },
      });
      const res = createMockResponse();

      (prisma.pricePreset.findFirst as any).mockResolvedValue(existing);
      (prisma.saleQueue.count as any).mockResolvedValue(0);
      (prisma.automation.count as any).mockResolvedValue(0);
      (prisma.pricePreset.delete as any).mockResolvedValue(existing);

      await callRoute('DELETE', '/:id', req, res);

      expect(prisma.pricePreset.delete).toHaveBeenCalledWith({
        where: { id: 'preset-123' },
      });

      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalled();
    });

    it('should throw 404 when preset not found', async () => {
      const mockUser = { id: 'user-123' } as any;
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'non-existent' },
      });
      const res = createMockResponse();

      (prisma.pricePreset.findFirst as any).mockResolvedValue(null);

      await expect(callRoute('DELETE', '/:id', req, res)).rejects.toThrow('Price preset not found');
    });

    it('should throw 400 when preset has pending sales', async () => {
      const mockUser = { id: 'user-123' } as any;
      const existing = {
        id: 'preset-123',
        userId: 'user-123',
        name: 'Test',
        price: 500,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const req = createMockRequest({
        user: mockUser,
        params: { id: 'preset-123' },
      });
      const res = createMockResponse();

      (prisma.pricePreset.findFirst as any).mockResolvedValue(existing);
      (prisma.saleQueue.count as any).mockResolvedValue(5);

      await expect(callRoute('DELETE', '/:id', req, res)).rejects.toThrow(
        'Cannot delete preset with 5 pending/processing sale(s)'
      );

      expect(prisma.pricePreset.delete).not.toHaveBeenCalled();
    });

    it('should check for pending and processing sale queue items', async () => {
      const mockUser = { id: 'user-123' } as any;
      const existing = {
        id: 'preset-123',
        userId: 'user-123',
        name: 'Test',
        price: 500,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const req = createMockRequest({
        user: mockUser,
        params: { id: 'preset-123' },
      });
      const res = createMockResponse();

      (prisma.pricePreset.findFirst as any).mockResolvedValue(existing);
      (prisma.saleQueue.count as any).mockResolvedValue(3);

      await expect(callRoute('DELETE', '/:id', req, res)).rejects.toThrow();

      expect(prisma.saleQueue.count).toHaveBeenCalledWith({
        where: {
          pricePresetId: 'preset-123',
          status: { in: ['pending', 'processing'] },
        },
      });
    });

    it('should throw 400 when preset used by automations with sale queue', async () => {
      const mockUser = { id: 'user-123' } as any;
      const existing = {
        id: 'preset-123',
        userId: 'user-123',
        name: 'Test',
        price: 500,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const req = createMockRequest({
        user: mockUser,
        params: { id: 'preset-123' },
      });
      const res = createMockResponse();

      (prisma.pricePreset.findFirst as any).mockResolvedValue(existing);
      (prisma.saleQueue.count as any).mockResolvedValue(0);
      (prisma.automation.count as any).mockResolvedValue(3);

      await expect(callRoute('DELETE', '/:id', req, res)).rejects.toThrow(
        'Cannot delete preset - used by 3 automation(s) with sale queue enabled'
      );

      expect(prisma.pricePreset.delete).not.toHaveBeenCalled();
    });

    it('should check automations with autoAddToSaleQueue enabled', async () => {
      const mockUser = { id: 'user-123' } as any;
      const existing = {
        id: 'preset-123',
        userId: 'user-123',
        name: 'Test',
        price: 500,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const req = createMockRequest({
        user: mockUser,
        params: { id: 'preset-123' },
      });
      const res = createMockResponse();

      (prisma.pricePreset.findFirst as any).mockResolvedValue(existing);
      (prisma.saleQueue.count as any).mockResolvedValue(0);
      (prisma.automation.count as any).mockResolvedValue(2);

      await expect(callRoute('DELETE', '/:id', req, res)).rejects.toThrow();

      expect(prisma.automation.count).toHaveBeenCalledWith({
        where: {
          saleQueuePresetId: 'preset-123',
          autoAddToSaleQueue: true,
        },
      });
    });
  });

  describe('ownership verification', () => {
    it('should verify ownership on all operations', async () => {
      const mockUser = { id: 'user-123' } as any;
      const operations = [
        { method: 'GET', path: '/:id' },
        { method: 'PATCH', path: '/:id' },
        { method: 'DELETE', path: '/:id' },
      ];

      for (const op of operations) {
        vi.clearAllMocks();

        const req = createMockRequest({
          user: mockUser,
          params: { id: 'preset-123' },
          body: { name: 'Test' },
        });
        const res = createMockResponse();

        (prisma.pricePreset.findFirst as any).mockResolvedValue(null);

        await expect(callRoute(op.method, op.path, req, res)).rejects.toThrow();

        const whereClause = (prisma.pricePreset.findFirst as any).mock.calls[0][0].where;
        expect(whereClause.userId).toBe('user-123');
      }
    });
  });
});
