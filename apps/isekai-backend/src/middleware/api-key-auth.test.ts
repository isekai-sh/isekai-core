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
import {
  createMockRequest,
  createMockResponse,
  createMockNext,
} from '../test-helpers/express-mock.js';

// Mock Prisma
vi.mock('../db/index.js', () => ({
  prisma: {
    apiKey: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Mock api-key-utils
vi.mock('../lib/api-key-utils.js', () => ({
  hashApiKey: vi.fn((key: string) => `hashed_${key}`),
  isValidApiKeyFormat: vi.fn((key: string) => key.startsWith('isk_') && key.length === 68),
}));

import { apiKeyAuthMiddleware } from './api-key-auth.js';
import { prisma } from '../db/index.js';
import { hashApiKey, isValidApiKeyFormat } from '../lib/api-key-utils.js';

describe('apiKeyAuthMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Restore default mock implementations after clearing
    (hashApiKey as any).mockImplementation((key: string) => `hashed_${key}`);
    (isValidApiKeyFormat as any).mockImplementation(
      (key: string) => key.startsWith('isk_') && key.length === 68
    );
  });

  describe('Authorization header validation', () => {
    it('should return 401 when Authorization header is missing', async () => {
      const req = createMockRequest({
        headers: {},
      });
      const res = createMockResponse();
      const next = createMockNext();

      await apiKeyAuthMiddleware(req as any, res as any, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'API key required. Use: Authorization: Bearer isk_...',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 when Authorization header does not start with Bearer', async () => {
      const req = createMockRequest({
        headers: { authorization: 'Basic abc123' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await apiKeyAuthMiddleware(req as any, res as any, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'API key required. Use: Authorization: Bearer isk_...',
      });
    });

    it('should extract API key after "Bearer " prefix', async () => {
      const validKey = 'isk_' + 'a'.repeat(64);
      const req = createMockRequest({
        headers: { authorization: `Bearer ${validKey}` },
      });
      const res = createMockResponse();
      const next = createMockNext();

      const mockApiKeyRecord = {
        id: 'key-123',
        userId: 'user-123',
        keyHash: `hashed_${validKey}`,
        revokedAt: null,
        lastUsedAt: new Date(),
        user: {
          id: 'user-123',
          email: 'test@example.com',
          deviantartUserId: 'da-123',
          displayName: 'Test User',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      (prisma.apiKey.findFirst as any).mockResolvedValue(mockApiKeyRecord);
      (prisma.apiKey.update as any).mockResolvedValue({});

      await apiKeyAuthMiddleware(req as any, res as any, next);

      expect(hashApiKey).toHaveBeenCalledWith(validKey);
    });
  });

  describe('API key format validation', () => {
    it('should return 401 for invalid API key format', async () => {
      const req = createMockRequest({
        headers: { authorization: 'Bearer invalid_key' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      (isValidApiKeyFormat as any).mockReturnValue(false);

      await apiKeyAuthMiddleware(req as any, res as any, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Invalid API key format',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should validate API key format before database lookup', async () => {
      const req = createMockRequest({
        headers: { authorization: 'Bearer invalid' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      (isValidApiKeyFormat as any).mockReturnValue(false);

      await apiKeyAuthMiddleware(req as any, res as any, next);

      expect(isValidApiKeyFormat).toHaveBeenCalled();
      expect(prisma.apiKey.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('API key lookup', () => {
    it('should hash the API key before lookup', async () => {
      const validKey = 'isk_' + 'a'.repeat(64);
      const req = createMockRequest({
        headers: { authorization: `Bearer ${validKey}` },
      });
      const res = createMockResponse();
      const next = createMockNext();

      const mockApiKeyRecord = {
        id: 'key-123',
        userId: 'user-123',
        keyHash: `hashed_${validKey}`,
        revokedAt: null,
        user: {
          id: 'user-123',
          email: 'test@example.com',
          deviantartUserId: 'da-123',
          displayName: 'Test User',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      (prisma.apiKey.findFirst as any).mockResolvedValue(mockApiKeyRecord);
      (prisma.apiKey.update as any).mockResolvedValue({});

      await apiKeyAuthMiddleware(req as any, res as any, next);

      expect(hashApiKey).toHaveBeenCalledWith(validKey);
      expect(prisma.apiKey.findFirst).toHaveBeenCalledWith({
        where: {
          keyHash: `hashed_${validKey}`,
          revokedAt: null,
        },
        include: {
          user: true,
        },
      });
    });

    it('should return 401 when API key not found', async () => {
      const validKey = 'isk_' + 'a'.repeat(64);
      const req = createMockRequest({
        headers: { authorization: `Bearer ${validKey}` },
      });
      const res = createMockResponse();
      const next = createMockNext();

      (prisma.apiKey.findFirst as any).mockResolvedValue(null);

      await apiKeyAuthMiddleware(req as any, res as any, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Invalid or revoked API key',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 when API key has no user', async () => {
      const validKey = 'isk_' + 'a'.repeat(64);
      const req = createMockRequest({
        headers: { authorization: `Bearer ${validKey}` },
      });
      const res = createMockResponse();
      const next = createMockNext();

      const mockApiKeyRecord = {
        id: 'key-123',
        userId: 'user-123',
        keyHash: `hashed_${validKey}`,
        revokedAt: null,
        user: null,
      };

      (prisma.apiKey.findFirst as any).mockResolvedValue(mockApiKeyRecord);

      await apiKeyAuthMiddleware(req as any, res as any, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Invalid or revoked API key',
      });
    });

    it('should only find non-revoked API keys', async () => {
      const validKey = 'isk_' + 'a'.repeat(64);
      const req = createMockRequest({
        headers: { authorization: `Bearer ${validKey}` },
      });
      const res = createMockResponse();
      const next = createMockNext();

      (prisma.apiKey.findFirst as any).mockResolvedValue(null);

      await apiKeyAuthMiddleware(req as any, res as any, next);

      expect(prisma.apiKey.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            revokedAt: null,
          }),
        })
      );
    });
  });

  describe('successful authentication', () => {
    it('should attach user to request on success', async () => {
      const validKey = 'isk_' + 'a'.repeat(64);
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        deviantartUserId: 'da-123',
        displayName: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const req = createMockRequest({
        headers: { authorization: `Bearer ${validKey}` },
      });
      const res = createMockResponse();
      const next = createMockNext();

      const mockApiKeyRecord = {
        id: 'key-123',
        userId: 'user-123',
        keyHash: `hashed_${validKey}`,
        revokedAt: null,
        user: mockUser,
      };

      (prisma.apiKey.findFirst as any).mockResolvedValue(mockApiKeyRecord);
      (prisma.apiKey.update as any).mockResolvedValue({});

      await apiKeyAuthMiddleware(req as any, res as any, next);

      expect(req.user).toEqual(mockUser);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should attach apiKeyAuth metadata to request', async () => {
      const validKey = 'isk_' + 'a'.repeat(64);
      const req = createMockRequest({
        headers: { authorization: `Bearer ${validKey}` },
      });
      const res = createMockResponse();
      const next = createMockNext();

      const mockApiKeyRecord = {
        id: 'key-123',
        userId: 'user-123',
        keyHash: `hashed_${validKey}`,
        revokedAt: null,
        user: {
          id: 'user-123',
          email: 'test@example.com',
          deviantartUserId: 'da-123',
          displayName: 'Test User',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      (prisma.apiKey.findFirst as any).mockResolvedValue(mockApiKeyRecord);
      (prisma.apiKey.update as any).mockResolvedValue({});

      await apiKeyAuthMiddleware(req as any, res as any, next);

      expect(req.apiKeyAuth).toEqual({
        apiKeyId: 'key-123',
        userId: 'user-123',
      });
    });

    it('should update lastUsedAt timestamp', async () => {
      const validKey = 'isk_' + 'a'.repeat(64);
      const req = createMockRequest({
        headers: { authorization: `Bearer ${validKey}` },
      });
      const res = createMockResponse();
      const next = createMockNext();

      const mockApiKeyRecord = {
        id: 'key-123',
        userId: 'user-123',
        keyHash: `hashed_${validKey}`,
        revokedAt: null,
        user: {
          id: 'user-123',
          email: 'test@example.com',
          deviantartUserId: 'da-123',
          displayName: 'Test User',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      (prisma.apiKey.findFirst as any).mockResolvedValue(mockApiKeyRecord);
      (prisma.apiKey.update as any).mockResolvedValue({});

      await apiKeyAuthMiddleware(req as any, res as any, next);

      // Wait a bit for the async update
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(prisma.apiKey.update).toHaveBeenCalledWith({
        where: { id: 'key-123' },
        data: { lastUsedAt: expect.any(Date) },
      });
    });

    it('should not block on lastUsedAt update', async () => {
      const validKey = 'isk_' + 'a'.repeat(64);
      const req = createMockRequest({
        headers: { authorization: `Bearer ${validKey}` },
      });
      const res = createMockResponse();
      const next = createMockNext();

      const mockApiKeyRecord = {
        id: 'key-123',
        userId: 'user-123',
        keyHash: `hashed_${validKey}`,
        revokedAt: null,
        user: {
          id: 'user-123',
          email: 'test@example.com',
          deviantartUserId: 'da-123',
          displayName: 'Test User',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      (prisma.apiKey.findFirst as any).mockResolvedValue(mockApiKeyRecord);
      // Make update slow
      (prisma.apiKey.update as any).mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );

      const startTime = Date.now();
      await apiKeyAuthMiddleware(req as any, res as any, next);
      const duration = Date.now() - startTime;

      // Should complete quickly, not wait for update
      expect(duration).toBeLessThan(50);
      expect(next).toHaveBeenCalled();
    });

    it('should handle lastUsedAt update errors gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const validKey = 'isk_' + 'a'.repeat(64);
      const req = createMockRequest({
        headers: { authorization: `Bearer ${validKey}` },
      });
      const res = createMockResponse();
      const next = createMockNext();

      const mockApiKeyRecord = {
        id: 'key-123',
        userId: 'user-123',
        keyHash: `hashed_${validKey}`,
        revokedAt: null,
        user: {
          id: 'user-123',
          email: 'test@example.com',
          deviantartUserId: 'da-123',
          displayName: 'Test User',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      (prisma.apiKey.findFirst as any).mockResolvedValue(mockApiKeyRecord);
      (prisma.apiKey.update as any).mockRejectedValue(new Error('Update failed'));

      await apiKeyAuthMiddleware(req as any, res as any, next);

      // Should still succeed
      expect(next).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('error handling', () => {
    it('should return 500 on database error', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const validKey = 'isk_' + 'a'.repeat(64);
      const req = createMockRequest({
        headers: { authorization: `Bearer ${validKey}` },
      });
      const res = createMockResponse();
      const next = createMockNext();

      const dbError = new Error('Database connection failed');
      (prisma.apiKey.findFirst as any).mockRejectedValue(dbError);

      await apiKeyAuthMiddleware(req as any, res as any, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Internal Server Error',
      });
      expect(next).not.toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should log database errors', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const validKey = 'isk_' + 'a'.repeat(64);
      const req = createMockRequest({
        headers: { authorization: `Bearer ${validKey}` },
      });
      const res = createMockResponse();
      const next = createMockNext();

      const dbError = new Error('Connection timeout');
      (prisma.apiKey.findFirst as any).mockRejectedValue(dbError);

      await apiKeyAuthMiddleware(req as any, res as any, next);

      expect(consoleErrorSpy).toHaveBeenCalledWith('API key auth error:', dbError);

      consoleErrorSpy.mockRestore();
    });
  });

  describe('edge cases', () => {
    it('should handle empty Bearer token', async () => {
      const req = createMockRequest({
        headers: { authorization: 'Bearer ' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      (isValidApiKeyFormat as any).mockReturnValue(false);

      await apiKeyAuthMiddleware(req as any, res as any, next);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should handle case-sensitive Bearer keyword', async () => {
      const validKey = 'isk_' + 'a'.repeat(64);
      const req = createMockRequest({
        headers: { authorization: `bearer ${validKey}` }, // lowercase
      });
      const res = createMockResponse();
      const next = createMockNext();

      await apiKeyAuthMiddleware(req as any, res as any, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'API key required. Use: Authorization: Bearer isk_...',
      });
    });

    it('should preserve existing request properties', async () => {
      const validKey = 'isk_' + 'a'.repeat(64);
      const req = createMockRequest({
        headers: { authorization: `Bearer ${validKey}`, 'x-custom': 'value' },
        query: { test: '1' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      const mockApiKeyRecord = {
        id: 'key-123',
        userId: 'user-123',
        keyHash: `hashed_${validKey}`,
        revokedAt: null,
        user: {
          id: 'user-123',
          email: 'test@example.com',
          deviantartUserId: 'da-123',
          displayName: 'Test User',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      (prisma.apiKey.findFirst as any).mockResolvedValue(mockApiKeyRecord);
      (prisma.apiKey.update as any).mockResolvedValue({});

      await apiKeyAuthMiddleware(req as any, res as any, next);

      expect(req.headers?.['x-custom']).toBe('value');
      expect(req.query).toEqual({ test: '1' });
      expect(req.user).toBeDefined();
      expect(req.apiKeyAuth).toBeDefined();
    });
  });
});
