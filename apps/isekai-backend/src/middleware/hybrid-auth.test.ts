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
    user: {
      findUnique: vi.fn(),
    },
  },
}));

// Mock api-key-utils
vi.mock('../lib/api-key-utils.js', () => ({
  hashApiKey: vi.fn(),
  isValidApiKeyFormat: vi.fn(),
}));

import { hybridAuthMiddleware } from './hybrid-auth.js';
import { prisma } from '../db/index.js';
import { hashApiKey, isValidApiKeyFormat } from '../lib/api-key-utils.js';

describe('hybridAuthMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Restore default mock implementations after clearing
    (hashApiKey as any).mockImplementation((key: string) => `hashed_${key}`);
    (isValidApiKeyFormat as any).mockImplementation(
      (key: string) => key.startsWith('isk_') && key.length === 68
    );
  });

  describe('authentication method selection', () => {
    it('should use API key auth when Authorization header is present', async () => {
      const validKey = 'isk_' + 'a'.repeat(64);
      const req = createMockRequest({
        headers: { authorization: `Bearer ${validKey}` },
        session: { userId: 'session-user-123' } as any,
      });
      const res = createMockResponse();
      const next = createMockNext();

      const mockUser = {
        id: 'api-user-123',
        email: 'api@example.com',
        deviantartUserId: 'da-123',
        displayName: 'API User',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.apiKey.findFirst as any).mockResolvedValue({
        id: 'key-123',
        userId: 'api-user-123',
        keyHash: `hashed_${validKey}`,
        revokedAt: null,
        user: mockUser,
      });
      (prisma.apiKey.update as any).mockResolvedValue({});

      await hybridAuthMiddleware(req as any, res as any, next);

      // Should use API key auth, not session auth
      expect(prisma.apiKey.findFirst).toHaveBeenCalled();
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(req.user?.id).toBe('api-user-123');
    });

    it('should use session auth when Authorization header is missing', async () => {
      const req = createMockRequest({
        headers: {},
        session: { userId: 'session-user-123' } as any,
      });
      const res = createMockResponse();
      const next = createMockNext();

      const mockUser = {
        id: 'session-user-123',
        email: 'session@example.com',
        deviantartUserId: 'da-456',
        displayName: 'Session User',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.user.findUnique as any).mockResolvedValue(mockUser);

      await hybridAuthMiddleware(req as any, res as any, next);

      // Should use session auth, not API key auth
      expect(prisma.user.findUnique).toHaveBeenCalled();
      expect(prisma.apiKey.findFirst).not.toHaveBeenCalled();
      expect(req.user?.id).toBe('session-user-123');
    });

    it('should use session auth when Authorization header does not start with Bearer', async () => {
      const req = createMockRequest({
        headers: { authorization: 'Basic abc123' },
        session: { userId: 'session-user-123' } as any,
      });
      const res = createMockResponse();
      const next = createMockNext();

      const mockUser = {
        id: 'session-user-123',
        email: 'session@example.com',
        deviantartUserId: 'da-456',
        displayName: 'Session User',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.user.findUnique as any).mockResolvedValue(mockUser);

      await hybridAuthMiddleware(req as any, res as any, next);

      // Should fall back to session auth
      expect(prisma.user.findUnique).toHaveBeenCalled();
      expect(prisma.apiKey.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('API key authentication path', () => {
    it('should authenticate successfully with valid API key', async () => {
      const validKey = 'isk_' + 'a'.repeat(64);
      const req = createMockRequest({
        headers: { authorization: `Bearer ${validKey}` },
      });
      const res = createMockResponse();
      const next = createMockNext();

      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        deviantartUserId: 'da-123',
        displayName: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.apiKey.findFirst as any).mockResolvedValue({
        id: 'key-123',
        userId: 'user-123',
        keyHash: `hashed_${validKey}`,
        revokedAt: null,
        user: mockUser,
      });
      (prisma.apiKey.update as any).mockResolvedValue({});

      await hybridAuthMiddleware(req as any, res as any, next);

      expect(req.user).toEqual(mockUser);
      expect(req.apiKeyAuth).toEqual({
        apiKeyId: 'key-123',
        userId: 'user-123',
      });
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should return 401 for invalid API key format', async () => {
      const req = createMockRequest({
        headers: { authorization: 'Bearer invalid_key' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      (isValidApiKeyFormat as any).mockReturnValue(false);

      await hybridAuthMiddleware(req as any, res as any, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Invalid API key format',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 when API key not found', async () => {
      const validKey = 'isk_' + 'a'.repeat(64);
      const req = createMockRequest({
        headers: { authorization: `Bearer ${validKey}` },
      });
      const res = createMockResponse();
      const next = createMockNext();

      (prisma.apiKey.findFirst as any).mockResolvedValue(null);

      await hybridAuthMiddleware(req as any, res as any, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Invalid or revoked API key',
      });
    });

    it('should return 500 on API key database error', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const validKey = 'isk_' + 'a'.repeat(64);
      const req = createMockRequest({
        headers: { authorization: `Bearer ${validKey}` },
      });
      const res = createMockResponse();
      const next = createMockNext();

      const dbError = new Error('Database connection failed');
      (prisma.apiKey.findFirst as any).mockRejectedValue(dbError);

      await hybridAuthMiddleware(req as any, res as any, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Internal Server Error',
      });
      expect(consoleErrorSpy).toHaveBeenCalledWith('API key auth error:', dbError);

      consoleErrorSpy.mockRestore();
    });
  });

  describe('session authentication path', () => {
    it('should authenticate successfully with valid session', async () => {
      const req = createMockRequest({
        session: { userId: 'user-123' } as any,
      });
      const res = createMockResponse();
      const next = createMockNext();

      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        deviantartUserId: 'da-123',
        displayName: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.user.findUnique as any).mockResolvedValue(mockUser);

      await hybridAuthMiddleware(req as any, res as any, next);

      expect(req.user).toEqual(mockUser);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should return 401 when session has no userId', async () => {
      const req = createMockRequest({
        session: {} as any,
      });
      const res = createMockResponse();
      const next = createMockNext();

      await hybridAuthMiddleware(req as any, res as any, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Please log in or provide an API key',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 when user not found', async () => {
      const destroySpy = vi.fn((callback) => callback());
      const req = createMockRequest({
        session: {
          userId: 'non-existent-user',
          destroy: destroySpy,
        } as any,
      });
      const res = createMockResponse();
      const next = createMockNext();

      (prisma.user.findUnique as any).mockResolvedValue(null);

      await hybridAuthMiddleware(req as any, res as any, next);

      expect(destroySpy).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'User not found',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 500 on session database error', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const req = createMockRequest({
        session: { userId: 'user-123' } as any,
      });
      const res = createMockResponse();
      const next = createMockNext();

      const dbError = new Error('Database connection failed');
      (prisma.user.findUnique as any).mockRejectedValue(dbError);

      await hybridAuthMiddleware(req as any, res as any, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Internal Server Error',
      });
      expect(consoleErrorSpy).toHaveBeenCalledWith('Session auth error:', dbError);

      consoleErrorSpy.mockRestore();
    });
  });

  describe('edge cases', () => {
    it('should prioritize API key when both API key and session are present', async () => {
      const validKey = 'isk_' + 'a'.repeat(64);
      const req = createMockRequest({
        headers: { authorization: `Bearer ${validKey}` },
        session: { userId: 'session-user-123' } as any,
      });
      const res = createMockResponse();
      const next = createMockNext();

      const mockApiUser = {
        id: 'api-user-123',
        email: 'api@example.com',
        deviantartUserId: 'da-api',
        displayName: 'API User',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.apiKey.findFirst as any).mockResolvedValue({
        id: 'key-123',
        userId: 'api-user-123',
        keyHash: `hashed_${validKey}`,
        revokedAt: null,
        user: mockApiUser,
      });
      (prisma.apiKey.update as any).mockResolvedValue({});

      await hybridAuthMiddleware(req as any, res as any, next);

      // Should authenticate as API user, not session user
      expect(req.user?.id).toBe('api-user-123');
      expect(prisma.apiKey.findFirst).toHaveBeenCalled();
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('should return 401 when neither API key nor session is present', async () => {
      const req = createMockRequest({
        headers: {},
        session: {} as any,
      });
      const res = createMockResponse();
      const next = createMockNext();

      await hybridAuthMiddleware(req as any, res as any, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Please log in or provide an API key',
      });
    });

    it('should handle session destroy errors gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const destroyError = new Error('Session store error');
      const destroySpy = vi.fn((callback) => callback(destroyError));
      const req = createMockRequest({
        session: {
          userId: 'user-123',
          destroy: destroySpy,
        } as any,
      });
      const res = createMockResponse();
      const next = createMockNext();

      (prisma.user.findUnique as any).mockResolvedValue(null);

      await hybridAuthMiddleware(req as any, res as any, next);

      expect(destroySpy).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith('[Auth] Session destroy error:', destroyError);
      expect(res.status).toHaveBeenCalledWith(401);

      consoleErrorSpy.mockRestore();
    });

    it('should update lastUsedAt for API key auth', async () => {
      const validKey = 'isk_' + 'a'.repeat(64);
      const req = createMockRequest({
        headers: { authorization: `Bearer ${validKey}` },
      });
      const res = createMockResponse();
      const next = createMockNext();

      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        deviantartUserId: 'da-123',
        displayName: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.apiKey.findFirst as any).mockResolvedValue({
        id: 'key-123',
        userId: 'user-123',
        keyHash: `hashed_${validKey}`,
        revokedAt: null,
        user: mockUser,
      });
      (prisma.apiKey.update as any).mockResolvedValue({});

      await hybridAuthMiddleware(req as any, res as any, next);

      // Wait a bit for the async update
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(prisma.apiKey.update).toHaveBeenCalledWith({
        where: { id: 'key-123' },
        data: { lastUsedAt: expect.any(Date) },
      });
    });

    it('should continue if lastUsedAt update fails', async () => {
      const validKey = 'isk_' + 'a'.repeat(64);
      const req = createMockRequest({
        headers: { authorization: `Bearer ${validKey}` },
      });
      const res = createMockResponse();
      const next = createMockNext();

      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        deviantartUserId: 'da-123',
        displayName: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.apiKey.findFirst as any).mockResolvedValue({
        id: 'key-123',
        userId: 'user-123',
        keyHash: `hashed_${validKey}`,
        revokedAt: null,
        user: mockUser,
      });

      // Mock console.error to suppress output
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Make update fail
      (prisma.apiKey.update as any).mockRejectedValue(new Error('Database error'));

      await hybridAuthMiddleware(req as any, res as any, next);

      // Wait for the async update to fail
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should still succeed and call next() despite update failure
      expect(req.user).toEqual(mockUser);
      expect(next).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to update lastUsedAt:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });
});
