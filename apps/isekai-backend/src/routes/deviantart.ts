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

import { Router } from 'express';
import { refreshTokenIfNeeded } from '../lib/deviantart.js';
import { RedisCache, CacheTTL } from '../lib/redis-cache.js';
import { CacheKeys } from '../lib/cache-keys.js';

const router = Router();

const DEVIANTART_API_URL = 'https://www.deviantart.com/api/v1/oauth2';

router.get('/galleries', async (req, res) => {
  const user = req.user!;

  try {
    const accessToken = await refreshTokenIfNeeded(user);

    // Use cache with request coalescing - per-user galleries (12min TTL)
    const cacheKey = CacheKeys.gallery.folders(user.id);
    const result = await RedisCache.getOrFetch(
      cacheKey,
      async () => {
        return await fetchAllGalleries(accessToken);
      },
      CacheTTL.GALLERY_STRUCTURE,
      true // Allow stale cache on 429
    );

    res.json(result.data);
  } catch (error: any) {
    console.error('Error fetching galleries:', error);

    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      return res.status(504).json({ error: 'Request timeout' });
    }

    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper function to fetch all galleries with pagination
async function fetchAllGalleries(accessToken: string) {
  // Fetch all galleries with pagination
  let allResults: any[] = [];
  let offset = 0;
  let hasMore = true;
  const limit = 24; // DeviantArt API max limit for folder listing

  while (hasMore) {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
      mature_content: 'true',
    });

    const url = `${DEVIANTART_API_URL}/gallery/folders?${params}`;
    console.log(`Fetching galleries from /gallery/folders: offset=${offset}`);

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      let errorMessage = 'Failed to fetch galleries';
      try {
        const errorData = await response.json();
        errorMessage = errorData.error_description || errorData.error || errorMessage;
      } catch {
        errorMessage = (await response.text()) || errorMessage;
      }

      console.error('DeviantArt API error:', {
        status: response.status,
        message: errorMessage,
      });

      const error: any = new Error(errorMessage);
      error.status = response.status;
      throw error;
    }

    const data = await response.json();

    if (!data || !Array.isArray(data.results)) {
      console.error('Invalid response structure:', data);
      throw new Error('Invalid response from DeviantArt');
    }

    console.log(`Fetched ${data.results.length} items, has_more: ${data.has_more}`);

    allResults = allResults.concat(data.results);
    hasMore = data.has_more === true && data.next_offset !== null;

    if (hasMore) {
      offset = data.next_offset;
    }

    // Safety limit to prevent infinite loops
    if (offset > 50000) {
      console.warn('Reached safety limit, stopping pagination');
      break;
    }
  }

  console.log(`Total items fetched: ${allResults.length}`);

  // Transform to expected format
  // The response structure from /gallery/all will be deviations
  // Map them to gallery format for frontend compatibility
  const galleries = allResults.map((item: any) => ({
    folderId: item.deviationid || item.id,
    name: item.title || 'Untitled',
    parentId: null,
  }));

  return { galleries };
}

// Fetch category tree
router.get('/categories', async (req, res) => {
  try {
    const user = req.user!;
    const accessToken = await refreshTokenIfNeeded(user);

    // Use cache with request coalescing - categories are very stable (6-hour TTL)
    const cacheKey = CacheKeys.category.tree();
    const result = await RedisCache.getOrFetch(
      cacheKey,
      async () => {
        const response = await fetch(`${DEVIANTART_API_URL}/browse/categorytree`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!response.ok) {
          const error: any = new Error('Failed to fetch categories');
          error.status = response.status;
          throw error;
        }

        const data = await response.json();
        const categories =
          data.categories?.map((cat: { catpath: string; title: string }) => ({
            path: cat.catpath,
            name: cat.title,
          })) || [];

        return { categories };
      },
      CacheTTL.CATEGORY_TREE,
      true // Allow stale cache on 429
    );

    res.json(result.data);
  } catch (error: any) {
    console.error('Category tree error:', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to fetch categories' });
  }
});

// Fetch user profile
router.get('/user', async (req, res) => {
  try {
    const user = req.user!;
    const accessToken = await refreshTokenIfNeeded(user);

    // Use cache with request coalescing - per-user profile (20min TTL)
    const cacheKey = CacheKeys.user.profile(user.id);
    const result = await RedisCache.getOrFetch(
      cacheKey,
      async () => {
        const response = await fetch(`${DEVIANTART_API_URL}/user/whoami`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!response.ok) {
          const error: any = new Error('Failed to fetch user');
          error.status = response.status;
          throw error;
        }

        const data = await response.json();
        return {
          userId: data.userid,
          username: data.username,
          avatarUrl: data.usericon,
          type: data.type,
        };
      },
      CacheTTL.USER_PROFILE,
      true // Allow stale cache on 429
    );

    res.json(result.data);
  } catch (error: any) {
    console.error('User profile error:', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to fetch user' });
  }
});

export { router as deviantartRouter };
