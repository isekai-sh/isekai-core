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
vi.mock('../lib/deviantart.js', () => ({
  refreshTokenIfNeeded: vi.fn(),
}));

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

import { galleriesRouter } from './galleries.js';
import { refreshTokenIfNeeded } from '../lib/deviantart.js';

const mockRefreshTokenIfNeeded = vi.mocked(refreshTokenIfNeeded);

describe('Galleries Routes', () => {
  const mockUser = {
    id: 'user-123',
    daUserId: 'da-user-123',
    daUsername: 'testuser',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRefreshTokenIfNeeded.mockResolvedValue('mock-access-token');

    // Suppress console messages during tests
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  async function callRoute(method: string, path: string, req: any, res: any) {
    const routes = (galleriesRouter as any).stack;
    const route = routes.find((r: any) => {
      if (!r.route?.path) return false;
      if (!r.route.methods?.[method.toLowerCase()]) return false;

      // Exact match for non-param routes
      if (!r.route.path.includes(':')) {
        return r.route.path === path;
      }

      // Param match for routes like /:folderId
      const pathParts = path.split('/');
      const routeParts = r.route.path.split('/');
      if (pathParts.length !== routeParts.length) return false;

      return routeParts.every((part, i) => part.startsWith(':') || part === pathParts[i]);
    });
    if (!route) throw new Error(`Route not found: ${method} ${path}`);
    const handler = route.route.stack[route.route.stack.length - 1].handle;
    await handler(req, res);
  }

  describe('GET /folders', () => {
    it('should fetch gallery folders successfully', async () => {
      const mockResponse = {
        results: [
          { folderid: 'folder-1', name: 'Folder 1' },
          { folderid: 'folder-2', name: 'Folder 2' },
        ],
        has_more: false,
        next_offset: 2,
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      } as any);

      const req = {
        user: mockUser,
        query: {},
      };
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await callRoute('get', '/folders', req, res);

      expect(mockRefreshTokenIfNeeded).toHaveBeenCalledWith(mockUser);
      expect(res.json).toHaveBeenCalledWith({
        galleries: mockResponse.results,
        hasMore: false,
        nextOffset: 2,
      });
    });

    it('should handle query parameters', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ results: [], has_more: false }),
      } as any);

      const req = {
        user: mockUser,
        query: {
          calculate_size: 'true',
          ext_preload: 'true',
          limit: '20',
          offset: '10',
        },
      };
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await callRoute('get', '/folders', req, res);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('calculate_size=true'),
        expect.any(Object)
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('ext_preload=true'),
        expect.any(Object)
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=20'),
        expect.any(Object)
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('offset=10'),
        expect.any(Object)
      );
    });

    it('should handle 401 error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: vi.fn().mockResolvedValue({ error: 'Unauthorized' }),
      } as any);

      const req = {
        user: mockUser,
        query: {},
      };
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await callRoute('get', '/folders', req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Authentication failed' });
    });

    it('should handle 429 rate limit error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        json: vi.fn().mockResolvedValue({ error: 'Rate limit' }),
      } as any);

      const req = {
        user: mockUser,
        query: {},
      };
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await callRoute('get', '/folders', req, res);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith({ error: 'Rate limit exceeded' });
    });

    it('should handle generic API error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: vi.fn().mockRejectedValue(new Error('Not JSON')),
        text: vi.fn().mockResolvedValue('Server error'),
      } as any);

      const req = {
        user: mockUser,
        query: {},
      };
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await callRoute('get', '/folders', req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Server error' });
    });
  });

  describe('GET /all', () => {
    it('should fetch all galleries successfully', async () => {
      const mockResponse = {
        results: [{ folderid: 'folder-1', name: 'Gallery 1' }],
        has_more: false,
        next_offset: 1,
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      } as any);

      const req = {
        user: mockUser,
        query: {},
      };
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await callRoute('get', '/all', req, res);

      expect(res.json).toHaveBeenCalledWith({
        galleries: mockResponse.results,
        hasMore: false,
        nextOffset: 1,
      });
    });

    it('should enforce limit boundaries (min 1, max 50)', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ results: [], has_more: false }),
      } as any);

      // Test max limit
      const req1 = {
        user: mockUser,
        query: { limit: '100' }, // Requesting 100, should be capped at 50
      };
      const res1 = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await callRoute('get', '/all', req1, res1);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=50'),
        expect.any(Object)
      );

      vi.clearAllMocks();
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ results: [], has_more: false }),
      } as any);

      // Test min limit
      const req2 = {
        user: mockUser,
        query: { limit: '0' }, // Requesting 0, should be set to 1
      };
      const res2 = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await callRoute('get', '/all', req2, res2);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=1'),
        expect.any(Object)
      );
    });

    it('should handle API error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        json: vi.fn().mockResolvedValue({ error: 'Forbidden' }),
      } as any);

      const req = {
        user: mockUser,
        query: {},
      };
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await callRoute('get', '/all', req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Forbidden' });
    });
  });

  describe('GET /:folderId', () => {
    it('should fetch specific folder successfully', async () => {
      const mockResponse = {
        results: [{ deviationid: 'dev-1', title: 'Artwork 1' }],
        has_more: false,
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      } as any);

      const req = {
        user: mockUser,
        params: { folderId: 'folder-123' },
        query: {},
      };
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await callRoute('get', '/folder-123', req, res);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/gallery/folder-123'),
        expect.any(Object)
      );
      expect(res.json).toHaveBeenCalledWith({
        results: mockResponse.results,
        hasMore: false,
        nextOffset: undefined,
      });
    });
  });

  describe('POST /folders/create', () => {
    it('should create folder successfully', async () => {
      const mockResponse = {
        folderid: 'new-folder-id',
        name: 'New Folder',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      } as any);

      const req = {
        user: mockUser,
        body: {
          folder: 'New Folder',
          description: 'Test description',
        },
      };
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await callRoute('post', '/folders/create', req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(mockResponse);
    });

    it('should validate folder name (min 1, max 50 chars)', async () => {
      const req = {
        user: mockUser,
        body: {
          folder: '', // Empty name
        },
      };
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await callRoute('post', '/folders/create', req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid request data',
        })
      );
    });

    it('should handle API error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        text: vi.fn().mockResolvedValue('Folder already exists'),
      } as any);

      const req = {
        user: mockUser,
        body: {
          folder: 'Duplicate',
        },
      };
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await callRoute('post', '/folders/create', req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Folder already exists' });
    });
  });

  describe('PATCH /folders/order', () => {
    it('should update folder order successfully', async () => {
      // First call: fetch current order
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          results: [{ folderid: 'folder-1' }, { folderid: 'folder-2' }, { folderid: 'folder-3' }],
          has_more: false,
        }),
      } as any);

      // Second call: update first folder position
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ success: true }),
      } as any);

      // Third call: update second folder position
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ success: true }),
      } as any);

      const req = {
        user: mockUser,
        body: {
          folderids: ['folder-2', 'folder-1', 'folder-3'], // Swapped first two
        },
      };
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await callRoute('patch', '/folders/order', req, res);

      expect(mockFetch).toHaveBeenCalledTimes(3); // Fetch current + 2 updates (both positions changed)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
        })
      );
    });

    it('should return early if no changes needed', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          results: [{ folderid: 'folder-1' }, { folderid: 'folder-2' }],
          has_more: false,
        }),
      } as any);

      const req = {
        user: mockUser,
        body: {
          folderids: ['folder-1', 'folder-2'], // Same order
        },
      };
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await callRoute('patch', '/folders/order', req, res);

      expect(mockFetch).toHaveBeenCalledTimes(1); // Only fetch current
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        updated: 0,
        message: 'No changes needed',
      });
    });

    it('should validate folderids array', async () => {
      const req = {
        user: mockUser,
        body: {
          folderids: [], // Empty array
        },
      };
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await callRoute('patch', '/folders/order', req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid request data',
        })
      );
    });
  });

  describe('PATCH /folders/:folderId', () => {
    it('should update folder successfully', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ success: true }),
      } as any);

      const req = {
        user: mockUser,
        params: { folderId: 'folder-123' },
        body: {
          name: 'Updated Name',
          description: 'Updated description',
        },
      };
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await callRoute('patch', '/folders/folder-123', req, res);

      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it('should validate update data', async () => {
      const req = {
        user: mockUser,
        params: { folderId: 'folder-123' },
        body: {
          foldername: '', // Empty name (min 1 char required)
        },
      };
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await callRoute('patch', '/folders/folder-123', req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid request data',
        })
      );
    });
  });

  describe('DELETE /folders/:folderId', () => {
    it('should delete folder successfully', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ success: true }),
      } as any);

      const req = {
        user: mockUser,
        params: { folderId: 'folder-123' },
      };
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await callRoute('delete', '/folders/folder-123', req, res);

      expect(res.json).toHaveBeenCalledWith({ success: true });
    });
  });

  describe('POST /folders/move', () => {
    it('should move folder successfully', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ success: true }),
      } as any);

      const req = {
        user: mockUser,
        body: {
          folderid: 'folder-123',
          parentid: 'parent-folder',
        },
      };
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await callRoute('post', '/folders/move', req, res);

      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it('should validate required fields', async () => {
      const req = {
        user: mockUser,
        body: {
          folderid: 'folder-123',
          // Missing targetid
        },
      };
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await callRoute('post', '/folders/move', req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('POST /folders/copy-deviations', () => {
    it('should copy deviations successfully', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ success: true }),
      } as any);

      const req = {
        user: mockUser,
        body: {
          deviationids: ['dev-1', 'dev-2'],
          target_folderid: 'target-folder',
        },
      };
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await callRoute('post', '/folders/copy-deviations', req, res);

      expect(res.json).toHaveBeenCalledWith({ success: true });
    });
  });

  describe('POST /folders/move-deviations', () => {
    it('should move deviations successfully', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ success: true }),
      } as any);

      const req = {
        user: mockUser,
        body: {
          deviationids: ['dev-1', 'dev-2'],
          target_folderid: 'target-folder',
        },
      };
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await callRoute('post', '/folders/move-deviations', req, res);

      expect(res.json).toHaveBeenCalledWith({ success: true });
    });
  });

  describe('DELETE /folders/:folderId/deviations', () => {
    it('should delete deviations from folder successfully', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ success: true }),
      } as any);

      const req = {
        user: mockUser,
        params: { folderId: 'folder-123' },
        body: {
          deviationids: ['dev-1', 'dev-2'],
        },
      };
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await callRoute('delete', '/folders/folder-123/deviations', req, res);

      expect(res.json).toHaveBeenCalledWith({ success: true });
    });
  });

  describe('PATCH /folders/:folderId/deviation-order', () => {
    it('should update deviation order successfully', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ success: true }),
      } as any);

      const req = {
        user: mockUser,
        params: { folderId: 'folder-123' },
        body: {
          deviationids: ['dev-1', 'dev-2', 'dev-3'],
        },
      };
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await callRoute('patch', '/folders/folder-123/deviation-order', req, res);

      expect(res.json).toHaveBeenCalledWith({ success: true });
    });
  });
});
