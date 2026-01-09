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

// Mock the prisma module
vi.mock('../db/index.js', () => {
  return {
    prisma: {
      user: {
        findUnique: vi.fn(),
      },
    },
  };
});

import { authMiddleware } from './auth.js';
import { prisma } from '../db/index.js';

describe('authMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('session validation', () => {
    it('should return 401 when session has no userId', async () => {
      const req = createMockRequest({
        session: {} as any,
      });
      const res = createMockResponse();
      const next = createMockNext();

      await authMiddleware(req as any, res as any, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Please log in',
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('user lookup', () => {
    it('should look up user when userId is in session', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        deviantartUserId: 'da-123',
        displayName: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const req = createMockRequest({
        session: { userId: 'user-123' } as any,
      });
      const res = createMockResponse();
      const next = createMockNext();

      (prisma.user.findUnique as any).mockResolvedValue(mockUser);

      await authMiddleware(req as any, res as any, next);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-123' },
      });
    });

    it('should attach user to request and call next on success', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        deviantartUserId: 'da-123',
        displayName: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const req = createMockRequest({
        session: { userId: 'user-123' } as any,
      });
      const res = createMockResponse();
      const next = createMockNext();

      (prisma.user.findUnique as any).mockResolvedValue(mockUser);

      await authMiddleware(req as any, res as any, next);

      expect(req.user).toEqual(mockUser);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
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

      await authMiddleware(req as any, res as any, next);

      expect(destroySpy).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'User not found',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should destroy session when user not found', async () => {
      const destroySpy = vi.fn((callback) => callback());
      const req = createMockRequest({
        session: {
          userId: 'deleted-user',
          destroy: destroySpy,
        } as any,
      });
      const res = createMockResponse();
      const next = createMockNext();

      (prisma.user.findUnique as any).mockResolvedValue(null);

      await authMiddleware(req as any, res as any, next);

      expect(destroySpy).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  describe('error handling', () => {
    it('should return 500 on database error', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const req = createMockRequest({
        session: { userId: 'user-123' } as any,
      });
      const res = createMockResponse();
      const next = createMockNext();

      const dbError = new Error('Database connection failed');
      (prisma.user.findUnique as any).mockRejectedValue(dbError);

      await authMiddleware(req as any, res as any, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Internal Server Error',
      });
      expect(next).not.toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should log database errors', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const req = createMockRequest({
        session: { userId: 'user-123' } as any,
      });
      const res = createMockResponse();
      const next = createMockNext();

      const dbError = new Error('Connection timeout');
      (prisma.user.findUnique as any).mockRejectedValue(dbError);

      await authMiddleware(req as any, res as any, next);

      expect(consoleErrorSpy).toHaveBeenCalledWith('Auth middleware error:', dbError);

      consoleErrorSpy.mockRestore();
    });

    it('should handle unexpected errors gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const req = createMockRequest({
        session: { userId: 'user-123' } as any,
      });
      const res = createMockResponse();
      const next = createMockNext();

      (prisma.user.findUnique as any).mockRejectedValue('String error');

      await authMiddleware(req as any, res as any, next);

      expect(res.status).toHaveBeenCalledWith(500);

      consoleErrorSpy.mockRestore();
    });
  });

  describe('edge cases', () => {
    it('should handle empty userId string', async () => {
      const req = createMockRequest({
        session: { userId: '' } as any,
      });
      const res = createMockResponse();
      const next = createMockNext();

      await authMiddleware(req as any, res as any, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('should handle null userId', async () => {
      const req = createMockRequest({
        session: { userId: null } as any,
      });
      const res = createMockResponse();
      const next = createMockNext();

      await authMiddleware(req as any, res as any, next);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should handle different user IDs', async () => {
      const userIds = ['user-1', 'user-2', 'user-3'];

      for (const userId of userIds) {
        vi.clearAllMocks();

        const mockUser = {
          id: userId,
          email: `${userId}@example.com`,
          deviantartUserId: `da-${userId}`,
          displayName: `User ${userId}`,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const req = createMockRequest({
          session: { userId } as any,
        });
        const res = createMockResponse();
        const next = createMockNext();

        (prisma.user.findUnique as any).mockResolvedValue(mockUser);

        await authMiddleware(req as any, res as any, next);

        expect(prisma.user.findUnique).toHaveBeenCalledWith({
          where: { id: userId },
        });
        expect(req.user?.id).toBe(userId);
      }
    });
  });

  describe('request flow', () => {
    it('should not modify request when authentication fails', async () => {
      const req = createMockRequest({
        session: {} as any,
      });
      const res = createMockResponse();
      const next = createMockNext();

      await authMiddleware(req as any, res as any, next);

      expect(req.user).toBeUndefined();
    });

    it('should preserve existing request properties', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        deviantartUserId: 'da-123',
        displayName: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const req = createMockRequest({
        session: { userId: 'user-123' } as any,
        headers: { 'x-custom': 'value' },
        query: { test: '1' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      (prisma.user.findUnique as any).mockResolvedValue(mockUser);

      await authMiddleware(req as any, res as any, next);

      expect(req.headers).toEqual({ 'x-custom': 'value' });
      expect(req.query).toEqual({ test: '1' });
      expect(req.user).toEqual(mockUser);
    });
  });
});
