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
import { automationDefaultValuesRouter } from './automation-default-values.js';
import { createMockRequest, createMockResponse } from '../test-helpers/express-mock.js';

// Mock dependencies
vi.mock('../db/index.js', () => ({
  prisma: {
    automation: {
      findFirst: vi.fn(),
    },
    automationDefaultValue: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import { prisma } from '../db/index.js';

describe('automation-default-values routes', () => {
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

  const mockDefaultValue = {
    id: 'value-123',
    automationId: 'automation-123',
    fieldName: 'description',
    value: 'Default description',
    applyIfEmpty: true,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function callRoute(method: string, path: string, req: any, res: any) {
    const routes = (automationDefaultValuesRouter as any).stack;
    const route = routes.find(
      (r: any) => r.route?.path === path && r.route?.methods?.[method.toLowerCase()]
    );
    if (!route) throw new Error(`Route not found: ${method} ${path}`);
    const handler = route.route.stack[route.route.stack.length - 1].handle;
    await handler(req, res);
  }

  describe('GET /', () => {
    it('should list default values for automation', async () => {
      const req = createMockRequest({
        user: mockUser,
        query: { automationId: 'automation-123' },
      });
      const res = createMockResponse();

      (prisma.automation.findFirst as any).mockResolvedValue(mockAutomation);
      (prisma.automationDefaultValue.findMany as any).mockResolvedValue([mockDefaultValue]);

      await callRoute('GET', '/', req, res);

      expect(prisma.automation.findFirst).toHaveBeenCalledWith({
        where: { id: 'automation-123', userId: 'user-123' },
      });
      expect(prisma.automationDefaultValue.findMany).toHaveBeenCalledWith({
        where: { automationId: 'automation-123' },
        orderBy: { createdAt: 'asc' },
      });
      expect(res.json).toHaveBeenCalledWith({
        values: [
          expect.objectContaining({
            id: 'value-123',
            fieldName: 'description',
            createdAt: '2024-01-01T00:00:00.000Z',
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
  });

  describe('POST / - string fields', () => {
    it('should create description field with valid value', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: {
          automationId: 'automation-123',
          fieldName: 'description',
          value: 'My default description',
          applyIfEmpty: true,
        },
      });
      const res = createMockResponse();

      (prisma.automation.findFirst as any).mockResolvedValue(mockAutomation);
      (prisma.automationDefaultValue.findUnique as any).mockResolvedValue(null);
      (prisma.automationDefaultValue.create as any).mockResolvedValue(mockDefaultValue);

      await callRoute('POST', '/', req, res);

      expect(prisma.automationDefaultValue.create).toHaveBeenCalledWith({
        data: {
          automationId: 'automation-123',
          fieldName: 'description',
          value: 'My default description',
          applyIfEmpty: true,
        },
      });
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('should reject description exceeding 10,000 characters', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: {
          automationId: 'automation-123',
          fieldName: 'description',
          value: 'a'.repeat(10001),
        },
      });
      const res = createMockResponse();

      await expect(callRoute('POST', '/', req, res)).rejects.toThrow(
        'description cannot exceed 10,000 characters'
      );
    });

    it('should reject non-string description', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: {
          automationId: 'automation-123',
          fieldName: 'description',
          value: 123,
        },
      });
      const res = createMockResponse();

      await expect(callRoute('POST', '/', req, res)).rejects.toThrow(
        'description must be a string'
      );
    });
  });

  describe('POST / - tags field', () => {
    it('should create tags field with valid array', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: {
          automationId: 'automation-123',
          fieldName: 'tags',
          value: ['art', 'digital', 'fantasy'],
        },
      });
      const res = createMockResponse();

      (prisma.automation.findFirst as any).mockResolvedValue(mockAutomation);
      (prisma.automationDefaultValue.findUnique as any).mockResolvedValue(null);
      (prisma.automationDefaultValue.create as any).mockResolvedValue({
        ...mockDefaultValue,
        fieldName: 'tags',
        value: ['art', 'digital', 'fantasy'],
      });

      await callRoute('POST', '/', req, res);

      expect(prisma.automationDefaultValue.create).toHaveBeenCalled();
    });

    it('should reject tags if not an array', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: {
          automationId: 'automation-123',
          fieldName: 'tags',
          value: 'not-an-array',
        },
      });
      const res = createMockResponse();

      await expect(callRoute('POST', '/', req, res)).rejects.toThrow('tags must be an array');
    });

    it('should reject tags exceeding 50', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: {
          automationId: 'automation-123',
          fieldName: 'tags',
          value: Array(51).fill('tag'),
        },
      });
      const res = createMockResponse();

      await expect(callRoute('POST', '/', req, res)).rejects.toThrow('Cannot exceed 50 tags');
    });

    it('should reject tags with non-string elements', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: {
          automationId: 'automation-123',
          fieldName: 'tags',
          value: ['valid', 123, 'another'],
        },
      });
      const res = createMockResponse();

      await expect(callRoute('POST', '/', req, res)).rejects.toThrow('All tags must be strings');
    });

    it('should reject tags with empty strings', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: {
          automationId: 'automation-123',
          fieldName: 'tags',
          value: ['valid', '  ', 'another'],
        },
      });
      const res = createMockResponse();

      await expect(callRoute('POST', '/', req, res)).rejects.toThrow(
        'Tags cannot be empty strings'
      );
    });

    it('should reject tag exceeding 100 characters', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: {
          automationId: 'automation-123',
          fieldName: 'tags',
          value: ['a'.repeat(101)],
        },
      });
      const res = createMockResponse();

      await expect(callRoute('POST', '/', req, res)).rejects.toThrow(
        'Tags cannot exceed 100 characters'
      );
    });

    it('should reject duplicate tags', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: {
          automationId: 'automation-123',
          fieldName: 'tags',
          value: ['art', 'Art', 'ART'],
        },
      });
      const res = createMockResponse();

      await expect(callRoute('POST', '/', req, res)).rejects.toThrow('Duplicate tags detected');
    });
  });

  describe('POST / - galleryIds field', () => {
    it('should create galleryIds field with valid array', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: {
          automationId: 'automation-123',
          fieldName: 'galleryIds',
          value: ['gallery-1', 'gallery-2'],
        },
      });
      const res = createMockResponse();

      (prisma.automation.findFirst as any).mockResolvedValue(mockAutomation);
      (prisma.automationDefaultValue.findUnique as any).mockResolvedValue(null);
      (prisma.automationDefaultValue.create as any).mockResolvedValue({
        ...mockDefaultValue,
        fieldName: 'galleryIds',
        value: ['gallery-1', 'gallery-2'],
      });

      await callRoute('POST', '/', req, res);

      expect(prisma.automationDefaultValue.create).toHaveBeenCalled();
    });

    it('should reject galleryIds if not an array', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: {
          automationId: 'automation-123',
          fieldName: 'galleryIds',
          value: 'not-an-array',
        },
      });
      const res = createMockResponse();

      await expect(callRoute('POST', '/', req, res)).rejects.toThrow('galleryIds must be an array');
    });

    it('should reject galleryIds exceeding 10', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: {
          automationId: 'automation-123',
          fieldName: 'galleryIds',
          value: Array(11).fill('gallery-id'),
        },
      });
      const res = createMockResponse();

      await expect(callRoute('POST', '/', req, res)).rejects.toThrow('Cannot exceed 10 galleries');
    });

    it('should reject galleryIds with empty strings', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: {
          automationId: 'automation-123',
          fieldName: 'galleryIds',
          value: ['valid', '  '],
        },
      });
      const res = createMockResponse();

      await expect(callRoute('POST', '/', req, res)).rejects.toThrow(
        'Gallery IDs cannot be empty strings'
      );
    });

    it('should reject duplicate galleryIds', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: {
          automationId: 'automation-123',
          fieldName: 'galleryIds',
          value: ['gallery-1', 'gallery-1'],
        },
      });
      const res = createMockResponse();

      await expect(callRoute('POST', '/', req, res)).rejects.toThrow(
        'Duplicate gallery IDs detected'
      );
    });
  });

  describe('POST / - boolean fields', () => {
    it('should create isMature field with boolean value', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: {
          automationId: 'automation-123',
          fieldName: 'isMature',
          value: true,
        },
      });
      const res = createMockResponse();

      (prisma.automation.findFirst as any).mockResolvedValue(mockAutomation);
      (prisma.automationDefaultValue.findUnique as any).mockResolvedValue(null);
      (prisma.automationDefaultValue.create as any).mockResolvedValue({
        ...mockDefaultValue,
        fieldName: 'isMature',
        value: true,
      });

      await callRoute('POST', '/', req, res);

      expect(prisma.automationDefaultValue.create).toHaveBeenCalled();
    });

    it('should reject non-boolean value for boolean field', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: {
          automationId: 'automation-123',
          fieldName: 'allowComments',
          value: 'yes',
        },
      });
      const res = createMockResponse();

      await expect(callRoute('POST', '/', req, res)).rejects.toThrow(
        'allowComments must be a boolean'
      );
    });
  });

  describe('POST / - matureLevel field', () => {
    it('should create matureLevel with moderate', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: {
          automationId: 'automation-123',
          fieldName: 'matureLevel',
          value: 'moderate',
        },
      });
      const res = createMockResponse();

      (prisma.automation.findFirst as any).mockResolvedValue(mockAutomation);
      (prisma.automationDefaultValue.findUnique as any).mockResolvedValue(null);
      (prisma.automationDefaultValue.create as any).mockResolvedValue({
        ...mockDefaultValue,
        fieldName: 'matureLevel',
        value: 'moderate',
      });

      await callRoute('POST', '/', req, res);

      expect(prisma.automationDefaultValue.create).toHaveBeenCalled();
    });

    it('should create matureLevel with strict', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: {
          automationId: 'automation-123',
          fieldName: 'matureLevel',
          value: 'strict',
        },
      });
      const res = createMockResponse();

      (prisma.automation.findFirst as any).mockResolvedValue(mockAutomation);
      (prisma.automationDefaultValue.findUnique as any).mockResolvedValue(null);
      (prisma.automationDefaultValue.create as any).mockResolvedValue({
        ...mockDefaultValue,
        fieldName: 'matureLevel',
        value: 'strict',
      });

      await callRoute('POST', '/', req, res);

      expect(prisma.automationDefaultValue.create).toHaveBeenCalled();
    });

    it('should reject invalid matureLevel value', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: {
          automationId: 'automation-123',
          fieldName: 'matureLevel',
          value: 'invalid',
        },
      });
      const res = createMockResponse();

      await expect(callRoute('POST', '/', req, res)).rejects.toThrow(
        'matureLevel must be "moderate" or "strict"'
      );
    });
  });

  describe('POST / - displayResolution field', () => {
    it('should create displayResolution with valid integer', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: {
          automationId: 'automation-123',
          fieldName: 'displayResolution',
          value: 5,
        },
      });
      const res = createMockResponse();

      (prisma.automation.findFirst as any).mockResolvedValue(mockAutomation);
      (prisma.automationDefaultValue.findUnique as any).mockResolvedValue(null);
      (prisma.automationDefaultValue.create as any).mockResolvedValue({
        ...mockDefaultValue,
        fieldName: 'displayResolution',
        value: 5,
      });

      await callRoute('POST', '/', req, res);

      expect(prisma.automationDefaultValue.create).toHaveBeenCalled();
    });

    it('should reject non-number displayResolution', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: {
          automationId: 'automation-123',
          fieldName: 'displayResolution',
          value: '5',
        },
      });
      const res = createMockResponse();

      await expect(callRoute('POST', '/', req, res)).rejects.toThrow(
        'displayResolution must be a number'
      );
    });

    it('should reject non-integer displayResolution', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: {
          automationId: 'automation-123',
          fieldName: 'displayResolution',
          value: 5.5,
        },
      });
      const res = createMockResponse();

      await expect(callRoute('POST', '/', req, res)).rejects.toThrow(
        'displayResolution must be an integer'
      );
    });

    it('should reject displayResolution below 0', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: {
          automationId: 'automation-123',
          fieldName: 'displayResolution',
          value: -1,
        },
      });
      const res = createMockResponse();

      await expect(callRoute('POST', '/', req, res)).rejects.toThrow(
        'displayResolution must be between 0 and 8'
      );
    });

    it('should reject displayResolution above 8', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: {
          automationId: 'automation-123',
          fieldName: 'displayResolution',
          value: 9,
        },
      });
      const res = createMockResponse();

      await expect(callRoute('POST', '/', req, res)).rejects.toThrow(
        'displayResolution must be between 0 and 8'
      );
    });
  });

  describe('POST / - general validation', () => {
    it('should reject duplicate field name for automation', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: {
          automationId: 'automation-123',
          fieldName: 'description',
          value: 'New description',
        },
      });
      const res = createMockResponse();

      (prisma.automation.findFirst as any).mockResolvedValue(mockAutomation);
      (prisma.automationDefaultValue.findUnique as any).mockResolvedValue(mockDefaultValue);

      await expect(callRoute('POST', '/', req, res)).rejects.toThrow(
        'Default value for description already exists'
      );
    });

    it('should return 404 when automation not found', async () => {
      const req = createMockRequest({
        user: mockUser,
        body: {
          automationId: 'nonexistent',
          fieldName: 'description',
          value: 'Test',
        },
      });
      const res = createMockResponse();

      (prisma.automation.findFirst as any).mockResolvedValue(null);

      await expect(callRoute('POST', '/', req, res)).rejects.toThrow('Automation not found');
    });
  });

  describe('PATCH /:id', () => {
    it('should update value successfully', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'value-123' },
        body: { value: 'Updated description' },
      });
      const res = createMockResponse();

      (prisma.automationDefaultValue.findUnique as any).mockResolvedValue({
        ...mockDefaultValue,
        automation: mockAutomation,
      });
      (prisma.automationDefaultValue.update as any).mockResolvedValue({
        ...mockDefaultValue,
        value: 'Updated description',
      });

      await callRoute('PATCH', '/:id', req, res);

      expect(prisma.automationDefaultValue.update).toHaveBeenCalledWith({
        where: { id: 'value-123' },
        data: { value: 'Updated description' },
      });
    });

    it('should update applyIfEmpty successfully', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'value-123' },
        body: { applyIfEmpty: false },
      });
      const res = createMockResponse();

      (prisma.automationDefaultValue.findUnique as any).mockResolvedValue({
        ...mockDefaultValue,
        automation: mockAutomation,
      });
      (prisma.automationDefaultValue.update as any).mockResolvedValue({
        ...mockDefaultValue,
        applyIfEmpty: false,
      });

      await callRoute('PATCH', '/:id', req, res);

      expect(prisma.automationDefaultValue.update).toHaveBeenCalledWith({
        where: { id: 'value-123' },
        data: { applyIfEmpty: false },
      });
    });

    it('should validate new value', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'value-123' },
        body: { value: 123 },
      });
      const res = createMockResponse();

      (prisma.automationDefaultValue.findUnique as any).mockResolvedValue({
        ...mockDefaultValue,
        fieldName: 'description',
        automation: mockAutomation,
      });

      await expect(callRoute('PATCH', '/:id', req, res)).rejects.toThrow(
        'description must be a string'
      );
    });

    it('should return 404 when default value not found', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'nonexistent' },
        body: { value: 'Updated' },
      });
      const res = createMockResponse();

      (prisma.automationDefaultValue.findUnique as any).mockResolvedValue(null);

      await expect(callRoute('PATCH', '/:id', req, res)).rejects.toThrow('Default value not found');
    });

    it('should return 404 when user does not own default value', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'value-123' },
        body: { value: 'Updated' },
      });
      const res = createMockResponse();

      (prisma.automationDefaultValue.findUnique as any).mockResolvedValue({
        ...mockDefaultValue,
        automation: { ...mockAutomation, userId: 'different-user' },
      });

      await expect(callRoute('PATCH', '/:id', req, res)).rejects.toThrow('Default value not found');
    });
  });

  describe('DELETE /:id', () => {
    it('should delete default value successfully', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'value-123' },
      });
      const res = createMockResponse();

      (prisma.automationDefaultValue.findUnique as any).mockResolvedValue({
        ...mockDefaultValue,
        automation: mockAutomation,
      });
      (prisma.automationDefaultValue.delete as any).mockResolvedValue(mockDefaultValue);

      await callRoute('DELETE', '/:id', req, res);

      expect(prisma.automationDefaultValue.delete).toHaveBeenCalledWith({
        where: { id: 'value-123' },
      });
      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalled();
    });

    it('should return 404 when default value not found', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'nonexistent' },
      });
      const res = createMockResponse();

      (prisma.automationDefaultValue.findUnique as any).mockResolvedValue(null);

      await expect(callRoute('DELETE', '/:id', req, res)).rejects.toThrow(
        'Default value not found'
      );
    });

    it('should return 404 when user does not own default value', async () => {
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'value-123' },
      });
      const res = createMockResponse();

      (prisma.automationDefaultValue.findUnique as any).mockResolvedValue({
        ...mockDefaultValue,
        automation: { ...mockAutomation, userId: 'different-user' },
      });

      await expect(callRoute('DELETE', '/:id', req, res)).rejects.toThrow(
        'Default value not found'
      );
    });
  });
});
