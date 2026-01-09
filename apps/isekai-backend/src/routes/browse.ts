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
import {
  generateCacheKey,
  getCachedBrowseResponse,
  setCachedBrowseResponse,
  isPerUserMode,
  type BrowseCacheParams,
} from '../lib/browse-cache.js';
import { getBrowseSource, type BrowseMode } from '../lib/browse-source.js';
import { RedisCache, CacheTTL } from '../lib/redis-cache.js';
import { CacheKeys } from '../lib/cache-keys.js';
import type { BrowseDeviation } from '../lib/metadata-enricher.js';

const router = Router();

const DEVIANTART_API_URL = 'https://www.deviantart.com/api/v1/oauth2';

// Browse mode to DeviantArt endpoint mapping
// All modes now use OAuth API with proper caching
const BROWSE_ENDPOINTS: Record<string, string> = {
  home: '/browse/home',
  daily: '/browse/dailydeviations',
  following: '/browse/deviantsyouwatch',
  tags: '/browse/tags',
  topic: '/browse/topic',
  'user-gallery': '/gallery/all', // User's all gallery
};

// Transform DeviantArt deviation to our format
function transformDeviation(deviation: any): BrowseDeviation {
  const tierAccess = deviation.tier_access || null;

  // Exclusive: Content requiring direct purchase/unlock
  const isExclusive = tierAccess === 'locked';

  // Premium: Content requiring premium subscription
  const isPremium = tierAccess === 'locked-subscribed' || !!deviation.premium_folder_data;

  // Debug: Log first few deviations to check if tier data is now present
  if (Math.random() < 0.1) {
    console.log('🔍 Tier Debug:', {
      title: deviation.title?.substring(0, 30),
      tier_access: deviation.tier_access,
      tier: deviation.tier,
      premium_folder_data: deviation.premium_folder_data,
      isExclusive,
      isPremium,
    });
  }

  return {
    deviationId: deviation.deviationid,
    title: deviation.title || 'Untitled',
    url: deviation.url,
    thumbUrl: deviation.thumbs?.[0]?.src || deviation.preview?.src || null,
    previewUrl:
      deviation.preview?.src || deviation.thumbs?.[deviation.thumbs?.length - 1]?.src || null,
    author: {
      username: deviation.author?.username || 'Unknown',
      avatarUrl: deviation.author?.usericon || '',
      userId: deviation.author?.userid || '',
    },
    stats: {
      favourites: deviation.stats?.favourites || 0,
      comments: deviation.stats?.comments || 0,
    },
    publishedTime: deviation.published_time
      ? new Date(deviation.published_time * 1000).toISOString()
      : new Date().toISOString(),
    isDownloadable: deviation.is_downloadable || false,
    isMature: deviation.is_mature || false,
    category: deviation.category_path || null,
    tierAccess,
    isExclusive,
    isPremium,
    printId: deviation.printid || null,
  };
}

// NOTE: Specific routes MUST come before the dynamic /:mode route

// GET /browse/tags/search - Tag autocomplete
router.get('/tags/search', async (req, res) => {
  try {
    const user = req.user!;
    const accessToken = await refreshTokenIfNeeded(user);

    const tagName = req.query.tag_name as string;
    if (!tagName || tagName.length < 2) {
      return res.json({ tags: [] });
    }

    // Use cache with request coalescing
    const cacheKey = CacheKeys.tag.search(tagName);
    const result = await RedisCache.getOrFetch(
      cacheKey,
      async () => {
        const params = new URLSearchParams();
        params.set('tag_name', tagName);

        const response = await fetch(`${DEVIANTART_API_URL}/browse/tags/search?${params}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!response.ok) {
          console.error('DeviantArt tag search error:', await response.text());
          return { tags: [] };
        }

        const data = await response.json();
        const tags = (data.results || []).map((t: { tag_name: string }) => t.tag_name);
        return { tags };
      },
      CacheTTL.TAG_SEARCH,
      true // Allow stale cache on 429
    );

    res.json(result.data);
  } catch (error) {
    console.error('Tag search error:', error);
    res.json({ tags: [] });
  }
});

// GET /browse/morelikethis/:deviationId - Similar deviations
router.get('/morelikethis/:deviationId', async (req, res) => {
  try {
    const user = req.user!;
    const accessToken = await refreshTokenIfNeeded(user);
    const { deviationId } = req.params;

    // Use cache with request coalescing
    const cacheKey = CacheKeys.browse.morelikethis(deviationId);
    const result = await RedisCache.getOrFetch(
      cacheKey,
      async () => {
        const params = new URLSearchParams();
        params.set('seed', deviationId);
        params.set('expand', 'user.details');

        const response = await fetch(
          `${DEVIANTART_API_URL}/browse/morelikethis/preview?${params}`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          }
        );

        if (!response.ok) {
          const error: any = new Error('Failed to fetch similar deviations');
          error.status = response.status;
          throw error;
        }

        const data = await response.json();

        // The response has author info and more_from_artist/more_from_da arrays
        const deviations = [...(data.more_from_artist || []), ...(data.more_from_da || [])].map(
          transformDeviation
        );

        return {
          deviations,
          seed: data.seed ? transformDeviation(data.seed) : null,
          author: data.author
            ? {
                username: data.author.username,
                avatarUrl: data.author.usericon,
              }
            : null,
        };
      },
      CacheTTL.DEVIATION_METADATA,
      true // Allow stale cache on 429
    );

    res.json(result.data);
  } catch (error: any) {
    console.error('More like this error:', error);
    res.status(error.status || 500).json({ error: error.message || 'Internal server error' });
  }
});

// GET /browse/topics/list - Get all topics with sample deviations
router.get('/topics/list', async (req, res) => {
  try {
    const user = req.user!;
    const accessToken = await refreshTokenIfNeeded(user);

    // Use cache with request coalescing
    const cacheKey = CacheKeys.topic.list();
    const result = await RedisCache.getOrFetch(
      cacheKey,
      async () => {
        const response = await fetch(`${DEVIANTART_API_URL}/browse/topics?expand=user.details`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!response.ok) {
          const error: any = new Error('Failed to fetch topics');
          error.status = response.status;
          throw error;
        }

        const data = await response.json();

        const topics = (data.results || []).map((topic: any) => ({
          name: topic.name,
          canonicalName: topic.canonical_name,
          exampleDeviations: (topic.example_deviations || []).slice(0, 4).map(transformDeviation),
        }));

        return { topics, hasMore: data.has_more || false };
      },
      CacheTTL.TOPICS,
      true // Allow stale cache on 429
    );

    res.json(result.data);
  } catch (error: any) {
    console.error('Topics error:', error);
    res.status(error.status || 500).json({ error: error.message || 'Internal server error' });
  }
});

// GET /browse/toptopics - Get trending topics
router.get('/toptopics', async (req, res) => {
  try {
    const user = req.user!;
    const accessToken = await refreshTokenIfNeeded(user);

    // Use cache with request coalescing
    const cacheKey = CacheKeys.topic.top();
    const result = await RedisCache.getOrFetch(
      cacheKey,
      async () => {
        const response = await fetch(`${DEVIANTART_API_URL}/browse/toptopics`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!response.ok) {
          const error: any = new Error('Failed to fetch top topics');
          error.status = response.status;
          throw error;
        }

        const data = await response.json();

        const topics = (data.results || []).map((topic: any) => ({
          name: topic.name,
          canonicalName: topic.canonical_name,
          exampleDeviation: topic.example_deviations?.[0]
            ? transformDeviation(topic.example_deviations[0])
            : null,
        }));

        return { topics };
      },
      CacheTTL.TOPICS,
      true // Allow stale cache on 429
    );

    res.json(result.data);
  } catch (error: any) {
    console.error('Top topics error:', error);
    res.status(error.status || 500).json({ error: error.message || 'Internal server error' });
  }
});

// GET /browse/trendingtags - Get popular/trending tags (using toptopics as source)
router.get('/trendingtags', async (req, res) => {
  try {
    const user = req.user!;
    const accessToken = await refreshTokenIfNeeded(user);

    // Use cache with request coalescing
    const cacheKey = CacheKeys.topic.trendingTags();
    const result = await RedisCache.getOrFetch(
      cacheKey,
      async () => {
        // Use toptopics endpoint which gives trending topics (similar to tags)
        const response = await fetch(`${DEVIANTART_API_URL}/browse/toptopics`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!response.ok) {
          const error: any = new Error('Failed to fetch trending tags');
          error.status = response.status;
          throw error;
        }

        const data = await response.json();

        // Transform topics to tags format
        const tags = (data.results || []).map((topic: any, index: number) => ({
          name: topic.canonical_name || topic.name,
          count: 100 - index, // Fake count based on ranking (toptopics are already sorted by popularity)
        }));

        return { tags };
      },
      CacheTTL.TOPICS,
      true // Allow stale cache on 429
    );

    res.json(result.data);
  } catch (error: any) {
    console.error('Trending tags error:', error);
    res.status(error.status || 500).json({ error: error.message || 'Internal server error' });
  }
});

// GET /browse/deviation/:deviationId - Get full deviation details
router.get('/deviation/:deviationId', async (req, res) => {
  try {
    const user = req.user!;
    const accessToken = await refreshTokenIfNeeded(user);
    const { deviationId } = req.params;

    // Use cache with request coalescing
    // Note: Download URLs are time-limited signed URLs, so we cache download availability but not the URL itself
    const cacheKey = CacheKeys.browse.deviation(deviationId);
    const result = await RedisCache.getOrFetch(
      cacheKey,
      async () => {
        // Fetch deviation info with extended data
        const [deviationResponse, metadataResponse] = await Promise.all([
          fetch(`${DEVIANTART_API_URL}/deviation/${deviationId}?expand=user.details`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          }),
          fetch(
            `${DEVIANTART_API_URL}/deviation/metadata?deviationids[]=${deviationId}&ext_submission=true`,
            {
              headers: { Authorization: `Bearer ${accessToken}` },
            }
          ),
        ]);

        if (!deviationResponse.ok) {
          const error: any = new Error('Failed to fetch deviation');
          error.status = deviationResponse.status;
          throw error;
        }

        const deviation = await deviationResponse.json();

        // Try to get metadata (tags, description, etc.)
        let metadata: any = null;
        if (metadataResponse.ok) {
          const metadataData = await metadataResponse.json();
          metadata = metadataData.metadata?.[0];
        }

        // Check if downloadable (but don't cache the signed URL)
        const isDownloadable = deviation.is_downloadable || false;

        // Find the best quality image
        const fullImageUrl =
          deviation.content?.src ||
          deviation.preview?.src ||
          deviation.thumbs?.[deviation.thumbs.length - 1]?.src ||
          null;

        return {
          deviationId: deviation.deviationid,
          title: deviation.title || 'Untitled',
          url: deviation.url,
          thumbUrl: deviation.thumbs?.[0]?.src || deviation.preview?.src || null,
          previewUrl:
            deviation.preview?.src || deviation.thumbs?.[deviation.thumbs?.length - 1]?.src || null,
          fullImageUrl,
          author: {
            username: deviation.author?.username || 'Unknown',
            avatarUrl: deviation.author?.usericon || '',
            userId: deviation.author?.userid || '',
            isWatched: deviation.author?.is_watching || false,
          },
          description: metadata?.description || deviation.excerpt || null,
          tags: (metadata?.tags || []).map((t: any) => t.tag_name),
          category: deviation.category_path || metadata?.submission?.category_path || null,
          stats: {
            favourites: deviation.stats?.favourites || 0,
            comments: deviation.stats?.comments || 0,
            views: metadata?.stats?.views || 0,
            downloads: metadata?.stats?.downloads || 0,
          },
          publishedTime: deviation.published_time
            ? new Date(deviation.published_time * 1000).toISOString()
            : new Date().toISOString(),
          isDownloadable,
          isMature: deviation.is_mature || false,
          matureLevel: deviation.mature_level || null,
          // Don't cache download URL/filesize (they're time-limited signed URLs)
          downloadUrl: null,
          downloadFilesize: null,
        };
      },
      CacheTTL.DEVIATION_METADATA,
      true // Allow stale cache on 429
    );

    // Fetch fresh download URL if downloadable (not cached)
    let downloadInfo: { url: string; filesize: number } | null = null;
    if (result.data.isDownloadable) {
      try {
        const downloadResponse = await fetch(
          `${DEVIANTART_API_URL}/deviation/download/${deviationId}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (downloadResponse.ok) {
          const downloadData = await downloadResponse.json();
          downloadInfo = {
            url: downloadData.src,
            filesize: downloadData.filesize || 0,
          };
        }
      } catch (e) {
        // Download not available, ignore
      }
    }

    res.json({
      ...result.data,
      downloadUrl: downloadInfo?.url || null,
      downloadFilesize: downloadInfo?.filesize || null,
    });
  } catch (error: any) {
    console.error('Deviation detail error:', error);
    res.status(error.status || 500).json({ error: error.message || 'Internal server error' });
  }
});

// GET /browse/:mode - Main browse endpoint (MUST be last - catches all other modes)
router.get('/:mode', async (req, res) => {
  try {
    const user = req.user!;
    const accessToken = await refreshTokenIfNeeded(user);
    const { mode } = req.params as { mode: string };

    // Parse common params
    const offset = parseInt(req.query.offset as string) || 0;
    const limit = Math.min(parseInt(req.query.limit as string) || 24, 50);
    const tag = (req.query.tag as string) || '';
    const topic = (req.query.topic as string) || '';
    const username = (req.query.username as string) || '';
    const keywords = (req.query.keywords as string) || '';
    const date = req.query.date as string;
    const matureContent = req.query.mature_content === 'true';

    // Determine data source
    const sourceConfig = getBrowseSource(mode as BrowseMode, {
      offset,
      limit,
      tag,
      topic,
      username,
      keywords,
      date,
      mature_content: matureContent,
    });

    // Generate cache key
    const cacheParams: BrowseCacheParams = {
      mode,
      source: sourceConfig.source,
      tag,
      topic,
      username,
      keywords,
      mature: matureContent,
      offset,
    };
    const userId = isPerUserMode(mode) ? user.id : undefined;
    const cacheKey = generateCacheKey(cacheParams, userId);

    // Check cache first
    const cachedResponse = await getCachedBrowseResponse(cacheKey, userId, false);
    if (cachedResponse) {
      console.log('[Browse] Cache hit:', cacheKey);
      return res.json(cachedResponse);
    }

    // All modes now use API with proper caching
    return handleAPIBrowse(req, res, {
      mode,
      offset,
      limit,
      tag,
      topic,
      username,
      date,
      matureContent,
      accessToken,
      cacheKey,
      userId,
    });
  } catch (error) {
    console.error('[Browse] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Handle OAuth API-based browse with proper caching
 */
async function handleAPIBrowse(req: any, res: any, context: any) {
  const {
    mode,
    offset,
    limit,
    tag,
    topic,
    username,
    date,
    matureContent,
    accessToken,
    cacheKey,
    userId,
  } = context;

  const endpoint = BROWSE_ENDPOINTS[mode];
  if (!endpoint) {
    return res.status(400).json({ error: `Invalid browse mode: ${mode}` });
  }

  // Special handling for user-gallery mode
  let url: string;
  if (mode === 'user-gallery') {
    if (!username) {
      return res.status(400).json({ error: 'Username required for user-gallery mode' });
    }
    const params = new URLSearchParams();
    params.set('username', username);
    params.set('offset', String(offset));
    params.set('limit', String(limit));
    params.set('mode', 'newest'); // Sort by newest
    if (matureContent) {
      params.set('mature_content', 'true');
    }
    params.set('expand', 'user.details,deviation.tier,deviation.premium_folder_data');
    url = `${DEVIANTART_API_URL}${endpoint}?${params}`;
  } else {
    const params = new URLSearchParams();

    // Pagination
    params.set('offset', String(offset));
    params.set('limit', String(limit));

    // Tag (for tags mode)
    if (tag && mode === 'tags') {
      params.set('tag', tag);
    }

    // Date (for daily deviations - format: yyyy-mm-dd)
    if (date && mode === 'daily') {
      params.set('date', date);
    }

    // Topic name (for topic mode)
    if (topic && mode === 'topic') {
      params.set('topic', topic);
    }

    // Mature content filter
    if (matureContent) {
      params.set('mature_content', 'true');
    }

    // Expand user details and tier information
    params.set('expand', 'user.details,deviation.tier,deviation.premium_folder_data');

    url = `${DEVIANTART_API_URL}${endpoint}?${params}`;
  }

  console.log('[API] Fetching browse:', url);

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[API] DeviantArt API error for', endpoint, ':', errorText);

      // Check for rate limiting
      if (
        response.status === 429 ||
        errorText.includes('rate limit') ||
        errorText.includes('api_threshold')
      ) {
        // Try to return cached data on rate limit
        const cachedResponse = await getCachedBrowseResponse(cacheKey, userId, true);
        if (cachedResponse) {
          console.log('[API] Returning cached data due to rate limit for:', cacheKey);
          return res.json(cachedResponse);
        }

        return res.status(429).json({
          error: 'Rate limited by DeviantArt. Please try again later.',
          retryAfter: 300,
        });
      }

      return res.status(response.status).json({ error: 'Failed to fetch browse data' });
    }

    const data = await response.json();

    const deviations = (data.results || []).map(transformDeviation);
    const hasMore = data.has_more || false;
    const nextOffset = data.next_offset || offset + limit;

    const responseData = {
      deviations,
      hasMore,
      nextOffset,
      estimatedTotal: data.estimated_total,
    };

    // Cache the successful response
    setCachedBrowseResponse(cacheKey, responseData, userId).catch((err) => {
      console.error('[API] Failed to cache browse response:', err);
    });

    res.json(responseData);
  } catch (error) {
    console.error('[API] Browse error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export { router as browseRouter };
