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
    apiKey: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Mock api-key-utils
vi.mock('../lib/api-key-utils.js', () => ({
  generateApiKey: vi.fn(),
}));

import { apiKeysRouter } from './api-keys.js';
import { prisma } from '../db/index.js';
import { generateApiKey } from '../lib/api-key-utils.js';

// Helper to call route handlers directly
async function callRoute(method: string, path: string, req: any, res: any) {
  const routes = (apiKeysRouter as any).stack;
  const route = routes.find((r: any) => {
    return r.route?.path === path && r.route?.methods?.[method.toLowerCase()];
  });

  if (!route) {
    throw new Error(`Route ${method} ${path} not found`);
  }

  const handler = route.route.stack[0].handle;
  await handler(req, res);
}

describe('api-keys route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET / - List API keys', () => {
    it('should return all API keys for the authenticated user', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        deviantartUserId: 'da-123',
        displayName: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockApiKeys = [
        {
          id: 'key-1',
          userId: 'user-123',
          name: 'My First Key',
          keyPrefix: 'isk_abc123',
          keyHash: 'hashed_value',
          lastUsedAt: new Date('2025-12-20'),
          createdAt: new Date('2025-12-15'),
          revokedAt: null,
        },
        {
          id: 'key-2',
          userId: 'user-123',
          name: 'My Second Key',
          keyPrefix: 'isk_def456',
          keyHash: 'hashed_value_2',
          lastUsedAt: null,
          createdAt: new Date('2025-12-18'),
          revokedAt: null,
        },
      ];

      const req = createMockRequest({
        user: mockUser,
      });
      const res = createMockResponse();

      (prisma.apiKey.findMany as any).mockResolvedValue(mockApiKeys);

      await callRoute('GET', '/', req, res);

      expect(prisma.apiKey.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        orderBy: { createdAt: 'desc' },
      });

      expect(res.json).toHaveBeenCalledWith({
        apiKeys: [
          {
            id: 'key-1',
            name: 'My First Key',
            keyPrefix: 'isk_abc123',
            lastUsedAt: '2025-12-20T00:00:00.000Z',
            createdAt: '2025-12-15T00:00:00.000Z',
            revokedAt: null,
            isActive: true,
          },
          {
            id: 'key-2',
            name: 'My Second Key',
            keyPrefix: 'isk_def456',
            lastUsedAt: null,
            createdAt: '2025-12-18T00:00:00.000Z',
            revokedAt: null,
            isActive: true,
          },
        ],
      });
    });

    it('should not expose keyHash in response', async () => {
      const mockUser = { id: 'user-123' } as any;
      const mockApiKeys = [
        {
          id: 'key-1',
          userId: 'user-123',
          name: 'Test Key',
          keyPrefix: 'isk_abc123',
          keyHash: 'super_secret_hash',
          lastUsedAt: null,
          createdAt: new Date(),
          revokedAt: null,
        },
      ];

      const req = createMockRequest({ user: mockUser });
      const res = createMockResponse();

      (prisma.apiKey.findMany as any).mockResolvedValue(mockApiKeys);

      await callRoute('GET', '/', req, res);

      const responseData = (res.json as any).mock.calls[0][0];
      expect(responseData.apiKeys[0]).not.toHaveProperty('keyHash');
    });

    it('should mark revoked keys as inactive', async () => {
      const mockUser = { id: 'user-123' } as any;
      const mockApiKeys = [
        {
          id: 'key-1',
          userId: 'user-123',
          name: 'Revoked Key',
          keyPrefix: 'isk_abc123',
          keyHash: 'hashed',
          lastUsedAt: new Date('2025-12-10'),
          createdAt: new Date('2025-12-01'),
          revokedAt: new Date('2025-12-15'),
        },
      ];

      const req = createMockRequest({ user: mockUser });
      const res = createMockResponse();

      (prisma.apiKey.findMany as any).mockResolvedValue(mockApiKeys);

      await callRoute('GET', '/', req, res);

      const responseData = (res.json as any).mock.calls[0][0];
      expect(responseData.apiKeys[0].isActive).toBe(false);
      expect(responseData.apiKeys[0].revokedAt).toBe('2025-12-15T00:00:00.000Z');
    });

    it('should return empty array when user has no API keys', async () => {
      const mockUser = { id: 'user-123' } as any;
      const req = createMockRequest({ user: mockUser });
      const res = createMockResponse();

      (prisma.apiKey.findMany as any).mockResolvedValue([]);

      await callRoute('GET', '/', req, res);

      expect(res.json).toHaveBeenCalledWith({ apiKeys: [] });
    });

    it('should format timestamps as ISO strings', async () => {
      const mockUser = { id: 'user-123' } as any;
      const createdAt = new Date('2025-12-15T10:30:00Z');
      const lastUsedAt = new Date('2025-12-20T15:45:00Z');

      const mockApiKeys = [
        {
          id: 'key-1',
          userId: 'user-123',
          name: 'Test Key',
          keyPrefix: 'isk_abc123',
          keyHash: 'hashed',
          lastUsedAt,
          createdAt,
          revokedAt: null,
        },
      ];

      const req = createMockRequest({ user: mockUser });
      const res = createMockResponse();

      (prisma.apiKey.findMany as any).mockResolvedValue(mockApiKeys);

      await callRoute('GET', '/', req, res);

      const responseData = (res.json as any).mock.calls[0][0];
      expect(responseData.apiKeys[0].createdAt).toBe(createdAt.toISOString());
      expect(responseData.apiKeys[0].lastUsedAt).toBe(lastUsedAt.toISOString());
    });
  });

  describe('POST / - Create API key', () => {
    it('should create a new API key with valid data', async () => {
      const mockUser = { id: 'user-123' } as any;
      const req = createMockRequest({
        user: mockUser,
        body: { name: 'My New Key' },
      });
      const res = createMockResponse();

      const generatedKey = {
        key: 'isk_' + 'a'.repeat(64),
        hash: 'hashed_value',
        prefix: 'isk_abc123',
      };

      (generateApiKey as any).mockReturnValue(generatedKey);
      (prisma.apiKey.create as any).mockResolvedValue({
        id: 'key-new',
        userId: 'user-123',
        name: 'My New Key',
        keyPrefix: 'isk_abc123',
        keyHash: 'hashed_value',
        createdAt: new Date('2025-12-21'),
        lastUsedAt: null,
        revokedAt: null,
      });

      await callRoute('POST', '/', req, res);

      expect(generateApiKey).toHaveBeenCalled();
      expect(prisma.apiKey.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-123',
          name: 'My New Key',
          keyHash: 'hashed_value',
          keyPrefix: 'isk_abc123',
        },
      });

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        id: 'key-new',
        name: 'My New Key',
        key: generatedKey.key,
        keyPrefix: 'isk_abc123',
        createdAt: '2025-12-21T00:00:00.000Z',
      });
    });

    it('should return the raw API key only on creation', async () => {
      const mockUser = { id: 'user-123' } as any;
      const req = createMockRequest({
        user: mockUser,
        body: { name: 'Test Key' },
      });
      const res = createMockResponse();

      const generatedKey = {
        key: 'isk_raw_key_only_shown_once',
        hash: 'hashed',
        prefix: 'isk_raw_ke',
      };

      (generateApiKey as any).mockReturnValue(generatedKey);
      (prisma.apiKey.create as any).mockResolvedValue({
        id: 'key-new',
        userId: 'user-123',
        name: 'Test Key',
        keyPrefix: generatedKey.prefix,
        keyHash: generatedKey.hash,
        createdAt: new Date(),
        lastUsedAt: null,
        revokedAt: null,
      });

      await callRoute('POST', '/', req, res);

      const responseData = (res.json as any).mock.calls[0][0];
      expect(responseData.key).toBe('isk_raw_key_only_shown_once');
    });

    it('should validate name is required', async () => {
      const mockUser = { id: 'user-123' } as any;
      const req = createMockRequest({
        user: mockUser,
        body: {},
      });
      const res = createMockResponse();

      await expect(callRoute('POST', '/', req, res)).rejects.toThrow();
    });

    it('should validate name is not empty string', async () => {
      const mockUser = { id: 'user-123' } as any;
      const req = createMockRequest({
        user: mockUser,
        body: { name: '' },
      });
      const res = createMockResponse();

      await expect(callRoute('POST', '/', req, res)).rejects.toThrow();
    });

    it('should validate name does not exceed 100 characters', async () => {
      const mockUser = { id: 'user-123' } as any;
      const req = createMockRequest({
        user: mockUser,
        body: { name: 'a'.repeat(101) },
      });
      const res = createMockResponse();

      await expect(callRoute('POST', '/', req, res)).rejects.toThrow();
    });

    it('should accept name with exactly 100 characters', async () => {
      const mockUser = { id: 'user-123' } as any;
      const longName = 'a'.repeat(100);
      const req = createMockRequest({
        user: mockUser,
        body: { name: longName },
      });
      const res = createMockResponse();

      (generateApiKey as any).mockReturnValue({
        key: 'isk_key',
        hash: 'hash',
        prefix: 'isk_key123',
      });
      (prisma.apiKey.create as any).mockResolvedValue({
        id: 'key-new',
        userId: 'user-123',
        name: longName,
        keyPrefix: 'isk_key123',
        keyHash: 'hash',
        createdAt: new Date(),
        lastUsedAt: null,
        revokedAt: null,
      });

      await callRoute('POST', '/', req, res);

      expect(res.status).toHaveBeenCalledWith(201);
    });
  });

  describe('DELETE /:id - Revoke API key', () => {
    it('should revoke an active API key', async () => {
      const mockUser = { id: 'user-123' } as any;
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'key-123' },
      });
      const res = createMockResponse();

      const mockApiKey = {
        id: 'key-123',
        userId: 'user-123',
        name: 'Test Key',
        keyPrefix: 'isk_abc123',
        keyHash: 'hashed',
        createdAt: new Date(),
        lastUsedAt: null,
        revokedAt: null,
      };

      (prisma.apiKey.findFirst as any).mockResolvedValue(mockApiKey);
      (prisma.apiKey.update as any).mockResolvedValue({
        ...mockApiKey,
        revokedAt: new Date(),
      });

      await callRoute('DELETE', '/:id', req, res);

      expect(prisma.apiKey.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'key-123',
          userId: 'user-123',
        },
      });

      expect(prisma.apiKey.update).toHaveBeenCalledWith({
        where: { id: 'key-123' },
        data: { revokedAt: expect.any(Date) },
      });

      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalled();
    });

    it('should throw 404 when API key not found', async () => {
      const mockUser = { id: 'user-123' } as any;
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'non-existent-key' },
      });
      const res = createMockResponse();

      (prisma.apiKey.findFirst as any).mockResolvedValue(null);

      await expect(callRoute('DELETE', '/:id', req, res)).rejects.toThrow('API key not found');
    });

    it("should throw 404 when trying to revoke another user's key", async () => {
      const mockUser = { id: 'user-123' } as any;
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'key-456' },
      });
      const res = createMockResponse();

      // Prisma query with userId filter returns null
      (prisma.apiKey.findFirst as any).mockResolvedValue(null);

      await expect(callRoute('DELETE', '/:id', req, res)).rejects.toThrow('API key not found');
    });

    it('should throw 400 when API key already revoked', async () => {
      const mockUser = { id: 'user-123' } as any;
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'key-123' },
      });
      const res = createMockResponse();

      const revokedKey = {
        id: 'key-123',
        userId: 'user-123',
        name: 'Already Revoked',
        keyPrefix: 'isk_abc123',
        keyHash: 'hashed',
        createdAt: new Date('2025-12-01'),
        lastUsedAt: new Date('2025-12-10'),
        revokedAt: new Date('2025-12-15'),
      };

      (prisma.apiKey.findFirst as any).mockResolvedValue(revokedKey);

      await expect(callRoute('DELETE', '/:id', req, res)).rejects.toThrow(
        'API key already revoked'
      );
    });

    it('should perform soft delete by setting revokedAt timestamp', async () => {
      const mockUser = { id: 'user-123' } as any;
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'key-123' },
      });
      const res = createMockResponse();

      const mockApiKey = {
        id: 'key-123',
        userId: 'user-123',
        name: 'Test Key',
        keyPrefix: 'isk_abc123',
        keyHash: 'hashed',
        createdAt: new Date(),
        lastUsedAt: null,
        revokedAt: null,
      };

      (prisma.apiKey.findFirst as any).mockResolvedValue(mockApiKey);
      (prisma.apiKey.update as any).mockResolvedValue({
        ...mockApiKey,
        revokedAt: new Date(),
      });

      await callRoute('DELETE', '/:id', req, res);

      // Verify it's an update, not a delete
      expect(prisma.apiKey.update).toHaveBeenCalledWith({
        where: { id: 'key-123' },
        data: { revokedAt: expect.any(Date) },
      });

      // Verify the timestamp is recent (within last second)
      const revokedAt = (prisma.apiKey.update as any).mock.calls[0][0].data.revokedAt;
      const timeDiff = Date.now() - revokedAt.getTime();
      expect(timeDiff).toBeLessThan(1000);
    });
  });

  describe('route security', () => {
    it('should only return keys belonging to authenticated user', async () => {
      const mockUser = { id: 'user-123' } as any;
      const req = createMockRequest({ user: mockUser });
      const res = createMockResponse();

      (prisma.apiKey.findMany as any).mockResolvedValue([]);

      await callRoute('GET', '/', req, res);

      const whereClause = (prisma.apiKey.findMany as any).mock.calls[0][0].where;
      expect(whereClause.userId).toBe('user-123');
    });

    it('should only allow revocation of keys owned by authenticated user', async () => {
      const mockUser = { id: 'user-123' } as any;
      const req = createMockRequest({
        user: mockUser,
        params: { id: 'key-456' },
      });
      const res = createMockResponse();

      (prisma.apiKey.findFirst as any).mockResolvedValue(null);

      await expect(callRoute('DELETE', '/:id', req, res)).rejects.toThrow();

      const whereClause = (prisma.apiKey.findFirst as any).mock.calls[0][0].where;
      expect(whereClause.userId).toBe('user-123');
    });
  });
});
