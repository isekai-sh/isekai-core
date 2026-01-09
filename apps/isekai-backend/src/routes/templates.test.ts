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
    template: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import { templatesRouter } from './templates.js';
import { prisma } from '../db/index.js';

// Helper to call route handlers directly
async function callRoute(method: string, path: string, req: any, res: any) {
  const routes = (templatesRouter as any).stack;
  const route = routes.find(
    (r: any) => r.route?.path === path && r.route?.methods?.[method.toLowerCase()]
  );

  if (!route) {
    throw new Error(`Route ${method} ${path} not found`);
  }

  const handler = route.route.stack[0].handle;
  await handler(req, res);
}

describe('templates routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET / - List templates', () => {
    it('should return all templates for the authenticated user', async () => {
      const mockUser = { id: 'user-123' } as any;
      const mockTemplates = [
        {
          id: 'template-1',
          userId: 'user-123',
          type: 'tag',
          name: 'My Tags',
          content: { tags: ['digital art', 'fantasy'] },
          createdAt: new Date('2025-12-15'),
          updatedAt: new Date('2025-12-20'),
        },
        {
          id: 'template-2',
          userId: 'user-123',
          type: 'description',
          name: 'Standard Description',
          content: { text: 'Check out my artwork!' },
          createdAt: new Date('2025-12-10'),
          updatedAt: new Date('2025-12-18'),
        },
      ];

      const req = createMockRequest({ user: mockUser });
      const res = createMockResponse();

      (prisma.template.findMany as any).mockResolvedValue(mockTemplates);

      await callRoute('GET', '/', req, res);

      expect(prisma.template.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        orderBy: { createdAt: 'desc' },
      });

      const responseData = (res.json as any).mock.calls[0][0];
      expect(responseData.templates).toHaveLength(2);
      expect(responseData.templates[0].createdAt).toBe('2025-12-15T00:00:00.000Z');
    });

    it('should filter templates by type when provided', async () => {
      const mockUser = { id: 'user-123' } as any;
      const req = createMockRequest({
        user: mockUser,
        query: { type: 'tag' },
      });
      const res = createMockResponse();

      (prisma.template.findMany as any).mockResolvedValue([]);

      await callRoute('GET', '/', req, res);

      expect(prisma.template.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-123', type: 'tag' },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should not filter when type query is not a string', async () => {
      const mockUser = { id: 'user-123' } as any;
      const req = createMockRequest({
        user: mockUser,
        query: { type: ['tag', 'description'] },
      });
      const res = createMockResponse();

      (prisma.template.findMany as any).mockResolvedValue([]);

      await callRoute('GET', '/', req, res);

      expect(prisma.template.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should return empty array when user has no templates', async () => {
      const mockUser = { id: 'user-123' } as any;
      const req = createMockRequest({ user: mockUser });
      const res = createMockResponse();

      (prisma.template.findMany as any).mockResolvedValue([]);

      await callRoute('GET', '/', req, res);

      expect(res.json).toHaveBeenCalledWith({ templates: [] });
    });

    it('should format timestamps as ISO strings', async () => {
      const mockUser = { id: 'user-123' } as any;
      const createdAt = new Date('2025-12-15T10:30:00Z');
      const updatedAt = new Date('2025-12-20T15:45:00Z');

      const mockTemplates = [
        {
          id: 'template-1',
          userId: 'user-123',
          type: 'tag',
          name: 'Test',
          content: { tags: [] },
          createdAt,
          updatedAt,
        },
      ];

      const req = createMockRequest({ user: mockUser });
      const res = createMockResponse();

      (prisma.template.findMany as any).mockResolvedValue(mockTemplates);

      await callRoute('GET', '/', req, res);

      const responseData = (res.json as any).mock.calls[0][0];
      expect(responseData.templates[0].createdAt).toBe(createdAt.toISOString());
      expect(responseData.templates[0].updatedAt).toBe(updatedAt.toISOString());
    });
  });

  describe('GET /:id - Get single template', () => {
    it('should return template when found', async () => {
      const mockUser = { id: 'user-123' } as any;
      const mockTemplate = {
        id: 'template-123',
        userId: 'user-123',
        type: 'description',
        name: 'My Template',
        content: { text: 'Hello world' },
        createdAt: new Date('2025-12-15'),
        updatedAt: new Date('2025-12-20'),
      };

      const req = createMockRequest({
        user: mockUser,
        params: { id: 'template-123' },
      });
      const res = createMockResponse();

      (prisma.template.findFirst as any).mockResolvedValue(mockTemplate);

      await callRoute('GET', '/:id', req, res);

      expect(prisma.template.findFirst).toHaveBeenCalledWith({
        where: { id: 'template-123', userId: 'user-123' },
      });

      const responseData = (res.json as any).mock.calls[0][0];
      expect(responseData.id).toBe('template-123');
      expect(responseData.name).toBe('My Template');
    });

    it('should throw 404 when template not found', async () => {
      const mockUser = { id: 'user-123' } as any;
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'non-existent' },
      });
      const res = createMockResponse();

      (prisma.template.findFirst as any).mockResolvedValue(null);

      await expect(callRoute('GET', '/:id', req, res)).rejects.toThrow('Template not found');
    });

    it("should not allow accessing another user's template", async () => {
      const mockUser = { id: 'user-123' } as any;
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'template-456' },
      });
      const res = createMockResponse();

      (prisma.template.findFirst as any).mockResolvedValue(null);

      await expect(callRoute('GET', '/:id', req, res)).rejects.toThrow('Template not found');
    });
  });

  describe('POST / - Create template', () => {
    it('should create template with valid tag content', async () => {
      const mockUser = { id: 'user-123' } as any;
      const req = createMockRequest({
        user: mockUser,
        body: {
          type: 'tag',
          name: 'My Tags',
          content: { tags: ['art', 'digital'] },
        },
      });
      const res = createMockResponse();

      const mockTemplate = {
        id: 'template-new',
        userId: 'user-123',
        type: 'tag',
        name: 'My Tags',
        content: { tags: ['art', 'digital'] },
        createdAt: new Date('2025-12-21'),
        updatedAt: new Date('2025-12-21'),
      };

      (prisma.template.create as any).mockResolvedValue(mockTemplate);

      await callRoute('POST', '/', req, res);

      expect(prisma.template.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-123',
          type: 'tag',
          name: 'My Tags',
          content: { tags: ['art', 'digital'] },
        },
      });

      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('should create template with valid description content', async () => {
      const mockUser = { id: 'user-123' } as any;
      const req = createMockRequest({
        user: mockUser,
        body: {
          type: 'description',
          name: 'Standard Desc',
          content: { text: 'My artwork', variables: ['title', 'date'] },
        },
      });
      const res = createMockResponse();

      (prisma.template.create as any).mockResolvedValue({
        id: 'template-new',
        userId: 'user-123',
        type: 'description',
        name: 'Standard Desc',
        content: { text: 'My artwork', variables: ['title', 'date'] },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await callRoute('POST', '/', req, res);

      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('should create template with valid comment content', async () => {
      const mockUser = { id: 'user-123' } as any;
      const req = createMockRequest({
        user: mockUser,
        body: {
          type: 'comment',
          name: 'Auto Reply',
          content: { text: 'Thanks for the comment!', category: 'general' },
        },
      });
      const res = createMockResponse();

      (prisma.template.create as any).mockResolvedValue({
        id: 'template-new',
        userId: 'user-123',
        type: 'comment',
        name: 'Auto Reply',
        content: { text: 'Thanks for the comment!', category: 'general' },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await callRoute('POST', '/', req, res);

      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('should validate name is required', async () => {
      const mockUser = { id: 'user-123' } as any;
      const req = createMockRequest({
        user: mockUser,
        body: {
          type: 'tag',
          content: { tags: [] },
        },
      });
      const res = createMockResponse();

      await expect(callRoute('POST', '/', req, res)).rejects.toThrow();
    });

    it('should validate name does not exceed 100 characters', async () => {
      const mockUser = { id: 'user-123' } as any;
      const req = createMockRequest({
        user: mockUser,
        body: {
          type: 'tag',
          name: 'a'.repeat(101),
          content: { tags: [] },
        },
      });
      const res = createMockResponse();

      await expect(callRoute('POST', '/', req, res)).rejects.toThrow();
    });

    it('should validate type is one of allowed values', async () => {
      const mockUser = { id: 'user-123' } as any;
      const req = createMockRequest({
        user: mockUser,
        body: {
          type: 'invalid_type',
          name: 'Test',
          content: { tags: [] },
        },
      });
      const res = createMockResponse();

      await expect(callRoute('POST', '/', req, res)).rejects.toThrow();
    });
  });

  describe('PATCH /:id - Update template', () => {
    it('should update template name', async () => {
      const mockUser = { id: 'user-123' } as any;
      const existing = {
        id: 'template-123',
        userId: 'user-123',
        type: 'tag',
        name: 'Old Name',
        content: { tags: [] },
        createdAt: new Date('2025-12-15'),
        updatedAt: new Date('2025-12-15'),
      };

      const req = createMockRequest({
        user: mockUser,
        params: { id: 'template-123' },
        body: { name: 'New Name' },
      });
      const res = createMockResponse();

      (prisma.template.findFirst as any).mockResolvedValue(existing);
      (prisma.template.update as any).mockResolvedValue({
        ...existing,
        name: 'New Name',
        updatedAt: new Date('2025-12-21'),
      });

      await callRoute('PATCH', '/:id', req, res);

      expect(prisma.template.update).toHaveBeenCalledWith({
        where: { id: 'template-123' },
        data: {
          name: 'New Name',
          updatedAt: expect.any(Date),
        },
      });
    });

    it('should update template content', async () => {
      const mockUser = { id: 'user-123' } as any;
      const existing = {
        id: 'template-123',
        userId: 'user-123',
        type: 'tag',
        name: 'Tags',
        content: { tags: ['old'] },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const req = createMockRequest({
        user: mockUser,
        params: { id: 'template-123' },
        body: { content: { tags: ['new', 'updated'] } },
      });
      const res = createMockResponse();

      (prisma.template.findFirst as any).mockResolvedValue(existing);
      (prisma.template.update as any).mockResolvedValue({
        ...existing,
        content: { tags: ['new', 'updated'] },
        updatedAt: new Date(),
      });

      await callRoute('PATCH', '/:id', req, res);

      expect(prisma.template.update).toHaveBeenCalledWith({
        where: { id: 'template-123' },
        data: {
          content: { tags: ['new', 'updated'] },
          updatedAt: expect.any(Date),
        },
      });
    });

    it('should update both name and content', async () => {
      const mockUser = { id: 'user-123' } as any;
      const existing = {
        id: 'template-123',
        userId: 'user-123',
        type: 'description',
        name: 'Old',
        content: { text: 'old text' },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const req = createMockRequest({
        user: mockUser,
        params: { id: 'template-123' },
        body: {
          name: 'New',
          content: { text: 'new text' },
        },
      });
      const res = createMockResponse();

      (prisma.template.findFirst as any).mockResolvedValue(existing);
      (prisma.template.update as any).mockResolvedValue({
        ...existing,
        name: 'New',
        content: { text: 'new text' },
        updatedAt: new Date(),
      });

      await callRoute('PATCH', '/:id', req, res);

      expect(prisma.template.update).toHaveBeenCalledWith({
        where: { id: 'template-123' },
        data: {
          name: 'New',
          content: { text: 'new text' },
          updatedAt: expect.any(Date),
        },
      });
    });

    it('should throw 404 when template not found', async () => {
      const mockUser = { id: 'user-123' } as any;
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'non-existent' },
        body: { name: 'New Name' },
      });
      const res = createMockResponse();

      (prisma.template.findFirst as any).mockResolvedValue(null);

      await expect(callRoute('PATCH', '/:id', req, res)).rejects.toThrow('Template not found');
    });

    it('should update updatedAt timestamp', async () => {
      const mockUser = { id: 'user-123' } as any;
      const existing = {
        id: 'template-123',
        userId: 'user-123',
        type: 'tag',
        name: 'Test',
        content: { tags: [] },
        createdAt: new Date(),
        updatedAt: new Date('2025-12-15'),
      };

      const req = createMockRequest({
        user: mockUser,
        params: { id: 'template-123' },
        body: { name: 'Updated' },
      });
      const res = createMockResponse();

      (prisma.template.findFirst as any).mockResolvedValue(existing);
      (prisma.template.update as any).mockResolvedValue(existing);

      await callRoute('PATCH', '/:id', req, res);

      const updateCall = (prisma.template.update as any).mock.calls[0][0];
      expect(updateCall.data.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('DELETE /:id - Delete template', () => {
    it('should delete template when found', async () => {
      const mockUser = { id: 'user-123' } as any;
      const existing = {
        id: 'template-123',
        userId: 'user-123',
        type: 'tag',
        name: 'Test',
        content: { tags: [] },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const req = createMockRequest({
        user: mockUser,
        params: { id: 'template-123' },
      });
      const res = createMockResponse();

      (prisma.template.findFirst as any).mockResolvedValue(existing);
      (prisma.template.delete as any).mockResolvedValue(existing);

      await callRoute('DELETE', '/:id', req, res);

      expect(prisma.template.delete).toHaveBeenCalledWith({
        where: { id: 'template-123' },
      });

      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalled();
    });

    it('should throw 404 when template not found', async () => {
      const mockUser = { id: 'user-123' } as any;
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'non-existent' },
      });
      const res = createMockResponse();

      (prisma.template.findFirst as any).mockResolvedValue(null);

      await expect(callRoute('DELETE', '/:id', req, res)).rejects.toThrow('Template not found');
    });

    it("should not allow deleting another user's template", async () => {
      const mockUser = { id: 'user-123' } as any;
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'template-456' },
      });
      const res = createMockResponse();

      // Prisma query with userId filter returns null
      (prisma.template.findFirst as any).mockResolvedValue(null);

      await expect(callRoute('DELETE', '/:id', req, res)).rejects.toThrow('Template not found');
      expect(prisma.template.delete).not.toHaveBeenCalled();
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
          params: { id: 'template-123' },
          body: { name: 'Test' },
        });
        const res = createMockResponse();

        (prisma.template.findFirst as any).mockResolvedValue(null);

        await expect(callRoute(op.method, op.path, req, res)).rejects.toThrow();

        const whereClause = (prisma.template.findFirst as any).mock.calls[0][0].where;
        expect(whereClause.userId).toBe('user-123');
      }
    });
  });
});
