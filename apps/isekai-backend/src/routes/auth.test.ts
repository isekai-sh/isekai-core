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

// Mock dependencies
vi.mock('../db/index.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
    },
    instanceUser: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    instanceSettings: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('../middleware/auth.js', () => ({
  authMiddleware: vi.fn((req, res, next) => next()),
}));

vi.mock('../lib/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('../lib/env.js', () => ({
  env: {
    REFRESH_TOKEN_EXPIRY_DAYS: 60,
    FRONTEND_URL: 'http://localhost:5173',
    MAX_DA_ACCOUNTS: 0, // Unlimited for tests
    TEAM_INVITES_ENABLED: true,
  },
}));

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

// Mock process.env
const originalEnv = process.env;
beforeEach(() => {
  process.env = {
    ...originalEnv,
    DEVIANTART_CLIENT_ID: 'test-client-id',
    DEVIANTART_CLIENT_SECRET: 'test-client-secret',
    DEVIANTART_REDIRECT_URI: 'http://localhost:3000/api/auth/deviantart/callback',
    FRONTEND_URL: 'http://localhost:5173',
  };
});

import { authRouter } from './auth.js';
import { prisma } from '../db/index.js';

const mockPrisma = vi.mocked(prisma);

describe('Auth Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function callRoute(method: string, path: string, req: any, res: any) {
    const routes = (authRouter as any).stack;
    const route = routes.find(
      (r: any) => r.route?.path === path && r.route?.methods?.[method.toLowerCase()]
    );
    if (!route) throw new Error(`Route not found: ${method} ${path}`);
    const handler = route.route.stack[route.route.stack.length - 1].handle;
    await handler(req, res);
  }

  describe('GET /deviantart', () => {
    it('should redirect to DeviantArt OAuth URL', async () => {
      const req = {};
      const res = {
        redirect: vi.fn(),
      };

      await callRoute('get', '/deviantart', req, res);

      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining('https://www.deviantart.com/oauth2/authorize')
      );
      expect(res.redirect).toHaveBeenCalledWith(expect.stringContaining('response_type=code'));
      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining('client_id=test-client-id')
      );
      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining(
          'redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fapi%2Fauth%2Fdeviantart%2Fcallback'
        )
      );
      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining('scope=user+browse+stash+publish+note+message+gallery')
      );
    });
  });

  describe('GET /deviantart/callback', () => {
    it('should handle OAuth error from DeviantArt', async () => {
      const req = {
        query: { error: 'access_denied' },
      };
      const res = {
        redirect: vi.fn(),
      };

      await callRoute('get', '/deviantart/callback', req, res);

      expect(res.redirect).toHaveBeenCalledWith(
        'http://localhost:5173/callback?error=access_denied'
      );
    });

    it('should handle missing authorization code', async () => {
      const req = {
        query: {},
      };
      const res = {
        redirect: vi.fn(),
      };

      await callRoute('get', '/deviantart/callback', req, res);

      expect(res.redirect).toHaveBeenCalledWith(
        'http://localhost:5173/callback?error=missing_code'
      );
    });

    it('should handle non-string authorization code', async () => {
      const req = {
        query: { code: ['array', 'value'] },
      };
      const res = {
        redirect: vi.fn(),
      };

      await callRoute('get', '/deviantart/callback', req, res);

      expect(res.redirect).toHaveBeenCalledWith(
        'http://localhost:5173/callback?error=missing_code'
      );
    });

    it('should create new user on successful OAuth callback', async () => {
      const mockCode = 'test-auth-code';
      const mockTokenData = {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        expires_in: 3600,
      };
      const mockUserData = {
        userid: 'da-user-123',
        username: 'testuser',
        usericon: 'https://example.com/avatar.jpg',
      };
      const mockNewUser = {
        id: 'user-123',
        deviantartId: 'da-user-123',
        username: 'testuser',
        avatarUrl: 'https://example.com/avatar.jpg',
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue(mockTokenData),
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue(mockUserData),
        } as any);

      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(mockNewUser as any);
      mockPrisma.instanceUser.findUnique.mockResolvedValue(null);
      // count is called twice: once for team invites check, once for admin role assignment
      mockPrisma.instanceUser.count
        .mockResolvedValueOnce(0) // First call: for team invites check
        .mockResolvedValueOnce(0); // Second call: for admin role assignment
      // Mock instanceSettings for team invites check
      (mockPrisma as any).instanceSettings.findUnique.mockResolvedValue(null);
      mockPrisma.instanceUser.create.mockResolvedValue({
        id: 'instance-user-123',
        daUserId: 'da-user-123',
        daUsername: 'testuser',
        role: 'admin',
      } as any);

      const req = {
        query: { code: mockCode },
        session: {
          userId: undefined,
          instanceUserRole: undefined,
          save: vi.fn((cb: any) => cb(null)),
        },
      };
      const res = {
        redirect: vi.fn(),
      };

      await callRoute('get', '/deviantart/callback', req, res);

      // Verify token exchange
      expect(mockFetch).toHaveBeenCalledWith(
        'https://www.deviantart.com/oauth2/token',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        })
      );

      // Verify user info fetch
      expect(mockFetch).toHaveBeenCalledWith(
        'https://www.deviantart.com/api/v1/oauth2/user/whoami',
        expect.objectContaining({
          headers: { Authorization: 'Bearer test-access-token' },
        })
      );

      // Verify user creation
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { deviantartId: 'da-user-123' },
      });
      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          deviantartId: 'da-user-123',
          username: 'testuser',
          avatarUrl: 'https://example.com/avatar.jpg',
          accessToken: 'test-access-token',
          refreshToken: 'test-refresh-token',
        }),
      });

      // Verify session
      expect(req.session.userId).toBe('user-123');
      expect(req.session.save).toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith('http://localhost:5173/callback');
    });

    it('should update existing user on successful OAuth callback', async () => {
      const mockCode = 'test-auth-code';
      const mockTokenData = {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        expires_in: 3600,
      };
      const mockUserData = {
        userid: 'da-user-123',
        username: 'updateduser',
        usericon: 'https://example.com/new-avatar.jpg',
      };
      const mockExistingUser = {
        id: 'user-123',
        deviantartId: 'da-user-123',
        username: 'olduser',
        avatarUrl: 'https://example.com/old-avatar.jpg',
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue(mockTokenData),
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue(mockUserData),
        } as any);

      mockPrisma.user.findUnique.mockResolvedValue(mockExistingUser as any);
      mockPrisma.user.update.mockResolvedValue({
        ...mockExistingUser,
        username: 'updateduser',
      } as any);
      mockPrisma.instanceUser.findUnique.mockResolvedValue({
        id: 'instance-user-123',
        daUserId: 'da-user-123',
        daUsername: 'olduser',
        role: 'admin',
      } as any);
      mockPrisma.instanceUser.update.mockResolvedValue({
        id: 'instance-user-123',
        daUserId: 'da-user-123',
        daUsername: 'olduser',
        role: 'admin',
      } as any);

      const req = {
        query: { code: mockCode },
        session: {
          userId: undefined,
          instanceUserRole: undefined,
          save: vi.fn((cb: any) => cb(null)),
        },
      };
      const res = {
        redirect: vi.fn(),
      };

      await callRoute('get', '/deviantart/callback', req, res);

      // Verify user update
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: expect.objectContaining({
          username: 'updateduser',
          avatarUrl: 'https://example.com/new-avatar.jpg',
          accessToken: 'new-access-token',
          refreshToken: 'new-refresh-token',
          refreshTokenWarningEmailSent: false,
          refreshTokenExpiredEmailSent: false,
          lastRefreshTokenRefresh: null,
        }),
      });

      expect(req.session.userId).toBe('user-123');
      expect(req.session.instanceUserRole).toBe('admin');
      expect(res.redirect).toHaveBeenCalledWith('http://localhost:5173/callback');
    });

    it('should handle token exchange failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
      } as any);

      const req = {
        query: { code: 'test-code' },
        session: {},
      };
      const res = {
        redirect: vi.fn(),
      };

      await callRoute('get', '/deviantart/callback', req, res);

      expect(res.redirect).toHaveBeenCalledWith(
        'http://localhost:5173/callback?error=oauth_failed'
      );
    });

    it('should handle user info fetch failure', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({
            access_token: 'test-token',
            refresh_token: 'test-refresh',
            expires_in: 3600,
          }),
        } as any)
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          text: vi.fn().mockResolvedValue('Unauthorized'),
        } as any);

      const req = {
        query: { code: 'test-code' },
        session: {},
      };
      const res = {
        redirect: vi.fn(),
      };

      await callRoute('get', '/deviantart/callback', req, res);

      expect(res.redirect).toHaveBeenCalledWith(
        'http://localhost:5173/callback?error=oauth_failed'
      );
    });

    it('should handle rate limit error from DeviantArt', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({
            access_token: 'test-token',
            refresh_token: 'test-refresh',
            expires_in: 3600,
          }),
        } as any)
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          text: vi.fn().mockResolvedValue('Rate limit exceeded'),
        } as any);

      const req = {
        query: { code: 'test-code' },
        session: {},
      };
      const res = {
        redirect: vi.fn(),
      };

      await callRoute('get', '/deviantart/callback', req, res);

      expect(res.redirect).toHaveBeenCalledWith(
        'http://localhost:5173/callback?error=oauth_failed'
      );
    });

    it('should handle api_threshold error from DeviantArt', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({
            access_token: 'test-token',
            refresh_token: 'test-refresh',
            expires_in: 3600,
          }),
        } as any)
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: vi.fn().mockResolvedValue('api_threshold exceeded'),
        } as any);

      const req = {
        query: { code: 'test-code' },
        session: {},
      };
      const res = {
        redirect: vi.fn(),
      };

      await callRoute('get', '/deviantart/callback', req, res);

      expect(res.redirect).toHaveBeenCalledWith(
        'http://localhost:5173/callback?error=oauth_failed'
      );
    });

    it('should handle session save failure', async () => {
      const mockTokenData = {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        expires_in: 3600,
      };
      const mockUserData = {
        userid: 'da-user-123',
        username: 'testuser',
        usericon: 'https://example.com/avatar.jpg',
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue(mockTokenData),
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue(mockUserData),
        } as any);

      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 'user-123',
        deviantartId: 'da-user-123',
      } as any);
      mockPrisma.instanceUser.findUnique.mockResolvedValue(null);
      // count is called twice: once for team invites check, once for admin role assignment
      mockPrisma.instanceUser.count
        .mockResolvedValueOnce(0) // First call: for team invites check
        .mockResolvedValueOnce(0); // Second call: for admin role assignment
      // Mock instanceSettings for team invites check
      (mockPrisma as any).instanceSettings.findUnique.mockResolvedValue(null);
      mockPrisma.instanceUser.create.mockResolvedValue({
        id: 'instance-user-123',
        daUserId: 'da-user-123',
        role: 'admin',
      } as any);

      const sessionError = new Error('Session save failed');
      const req = {
        query: { code: 'test-code' },
        session: {
          userId: undefined,
          instanceUserRole: undefined,
          save: vi.fn((cb: any) => cb(sessionError)),
        },
      };
      const res = {
        redirect: vi.fn(),
      };

      await callRoute('get', '/deviantart/callback', req, res);

      expect(res.redirect).toHaveBeenCalledWith(
        'http://localhost:5173/callback?error=session_failed'
      );
    });
  });

  describe('GET /me', () => {
    it('should return current user info with token status', async () => {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days from now

      const mockUser = {
        id: 'user-123',
        deviantartId: 'da-user-123',
        username: 'testuser',
        avatarUrl: 'https://example.com/avatar.jpg',
        email: 'test@example.com',
        createdAt: new Date('2025-01-01'),
        refreshTokenExpiresAt: expiresAt,
      };

      mockPrisma.instanceUser.findUnique.mockResolvedValue({
        id: 'instance-user-123',
        daUserId: 'da-user-123',
        role: 'admin',
      } as any);

      const req = {
        user: mockUser,
      };
      const res = {
        json: vi.fn(),
      };

      await callRoute('get', '/me', req, res);

      expect(res.json).toHaveBeenCalledWith({
        id: 'user-123',
        deviantartId: 'da-user-123',
        username: 'testuser',
        avatarUrl: 'https://example.com/avatar.jpg',
        email: 'test@example.com',
        createdAt: '2025-01-01T00:00:00.000Z',
        instanceRole: 'admin',
        isAdmin: true,
        tokenStatus: {
          isValid: true,
          expiresAt: expiresAt.toISOString(),
          daysUntilExpiry: expect.any(Number),
          needsReauth: false,
        },
      });
    });

    it('should return expired token status', async () => {
      const now = new Date();
      const expiresAt = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000); // 1 day ago

      const mockUser = {
        id: 'user-123',
        deviantartId: 'da-user-123',
        username: 'testuser',
        avatarUrl: 'https://example.com/avatar.jpg',
        email: null,
        createdAt: new Date('2025-01-01'),
        refreshTokenExpiresAt: expiresAt,
      };

      mockPrisma.instanceUser.findUnique.mockResolvedValue({
        id: 'instance-user-123',
        daUserId: 'da-user-123',
        role: 'member',
      } as any);

      const req = {
        user: mockUser,
      };
      const res = {
        json: vi.fn(),
      };

      await callRoute('get', '/me', req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          instanceRole: 'member',
          isAdmin: false,
          tokenStatus: expect.objectContaining({
            isValid: false,
            daysUntilExpiry: 0,
            needsReauth: true,
          }),
        })
      );
    });
  });

  describe('GET /token-status', () => {
    it('should return valid token status', async () => {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days from now

      const mockUser = {
        refreshTokenExpiresAt: expiresAt,
      };

      const req = {
        user: mockUser,
      };
      const res = {
        json: vi.fn(),
      };

      await callRoute('get', '/token-status', req, res);

      expect(res.json).toHaveBeenCalledWith({
        isValid: true,
        isExpiringSoon: false,
        needsReauth: false,
        expiresAt: expiresAt.toISOString(),
        daysUntilExpiry: expect.any(Number),
      });
    });

    it('should return expiring soon token status', async () => {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000); // 10 days from now

      const mockUser = {
        refreshTokenExpiresAt: expiresAt,
      };

      const req = {
        user: mockUser,
      };
      const res = {
        json: vi.fn(),
      };

      await callRoute('get', '/token-status', req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          isValid: true,
          isExpiringSoon: true,
          needsReauth: false,
        })
      );
    });

    it('should return expired token status', async () => {
      const now = new Date();
      const expiresAt = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000); // 1 day ago

      const mockUser = {
        refreshTokenExpiresAt: expiresAt,
      };

      const req = {
        user: mockUser,
      };
      const res = {
        json: vi.fn(),
      };

      await callRoute('get', '/token-status', req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          isValid: false,
          isExpiringSoon: true, // negative days is still <= 14
          needsReauth: true,
          daysUntilExpiry: 0,
        })
      );
    });
  });

  describe('POST /reauth', () => {
    it('should return OAuth URL for re-authentication', async () => {
      const req = {};
      const res = {
        json: vi.fn(),
      };

      await callRoute('post', '/reauth', req, res);

      expect(res.json).toHaveBeenCalledWith({
        authUrl: expect.stringContaining('https://www.deviantart.com/oauth2/authorize'),
      });
      expect(res.json).toHaveBeenCalledWith({
        authUrl: expect.stringContaining('response_type=code'),
      });
      expect(res.json).toHaveBeenCalledWith({
        authUrl: expect.stringContaining('client_id=test-client-id'),
      });
    });
  });

  describe('POST /logout', () => {
    it('should destroy session and clear cookie', async () => {
      const req = {
        session: {
          destroy: vi.fn((cb: any) => cb(null)),
        },
      };
      const res = {
        clearCookie: vi.fn(),
        json: vi.fn(),
      };

      await callRoute('post', '/logout', req, res);

      expect(req.session.destroy).toHaveBeenCalled();
      expect(res.clearCookie).toHaveBeenCalledWith('connect.sid');
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it('should handle session destroy failure gracefully', async () => {
      const sessionError = new Error('Destroy failed');
      const req = {
        session: {
          destroy: vi.fn((cb: any) => cb(sessionError)),
        },
      };
      const res = {
        clearCookie: vi.fn(),
        json: vi.fn(),
      };

      await callRoute('post', '/logout', req, res);

      expect(req.session.destroy).toHaveBeenCalled();
      expect(res.clearCookie).toHaveBeenCalledWith('connect.sid');
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });
  });
});
