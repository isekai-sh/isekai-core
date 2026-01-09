# Browse System - DeviantArt Content Discovery

**Purpose:** Guide to browsing DeviantArt content with intelligent caching and rate limit protection
**Last Updated:** 2026-01-05 (v0.1.0-alpha.5)

---

## Overview

The **Browse System** allows users to discover artwork on DeviantArt through multiple modes (home feed, daily deviations, tags, topics, etc.). It implements Redis caching with request coalescing and stale cache fallback to handle rate limits gracefully.

**Key Features:**

- **6 browse modes:** home, daily, following, tags, topic, user-gallery
- **Redis caching:** Reduces API calls, handles rate limits
- **Request coalescing:** Prevents duplicate concurrent requests
- **Stale cache fallback:** Returns old data if rate limited
- **Tag autocomplete:** Instant tag suggestions
- **Topics discovery:** Browse trending topics and categories

**Related Files:**

- `/apps/isekai-backend/src/routes/browse.ts` - Browse routes
- `/apps/isekai-backend/src/lib/browse-cache.ts` - Cache logic
- `/apps/isekai-backend/src/lib/browse-source.ts` - Source configuration
- `/apps/isekai-backend/src/lib/redis-cache.ts` - Redis cache manager

---

## Browse Modes

### Mode Overview

| Mode           | Description                    | Endpoint                   | Per-User Cache     |
| -------------- | ------------------------------ | -------------------------- | ------------------ |
| `home`         | User's personalized feed       | `/browse/home`             | Yes                |
| `daily`        | Daily deviations (staff picks) | `/browse/dailydeviations`  | No                 |
| `following`    | Deviations from watched users  | `/browse/deviantsyouwatch` | Yes                |
| `tags`         | Browse by tag                  | `/browse/tags`             | No                 |
| `topic`        | Browse by topic/category       | `/browse/topic`            | No                 |
| `user-gallery` | User's all gallery             | `/gallery/all`             | Yes (per username) |

**Per-User Cache:** Some modes have personalized results, so cache is user-specific.

### Mode 1: Home Feed

**GET /api/browse/home**

**Description:** Personalized feed based on user's watch list and preferences.

**Query Params:**

```typescript
{
  offset: number = 0,
  limit: number = 24,        // Max 50
  mature_content: boolean = false
}
```

**Response:**

```json
{
  "deviations": [
    {
      "deviationId": "abc123",
      "title": "Artwork Title",
      "url": "https://www.deviantart.com/...",
      "thumbUrl": "https://images-wixmp-ed30a86b8c4ca887773594c2.wixmp.com/...",
      "previewUrl": "https://images-wixmp-ed30a86b8c4ca887773594c2.wixmp.com/...",
      "author": {
        "username": "artist",
        "avatarUrl": "https://a.deviantart.net/avatars/...",
        "userId": "user123"
      },
      "stats": {
        "favourites": 42,
        "comments": 5
      },
      "publishedTime": "2025-01-10T14:00:00Z",
      "isDownloadable": false,
      "isMature": false,
      "category": "digitalart/paintings",
      "tierAccess": null,
      "isExclusive": false,
      "isPremium": false,
      "printId": null
    }
  ],
  "hasMore": true,
  "nextOffset": 24,
  "estimatedTotal": 500
}
```

**Cache:** User-specific, TTL 5 minutes.

### Mode 2: Daily Deviations

**GET /api/browse/daily**

**Description:** Staff-picked daily featured deviations.

**Query Params:**

```typescript
{
  date: string = "YYYY-MM-DD",  // Optional, defaults to today
  offset: number = 0,
  limit: number = 24,
  mature_content: boolean = false
}
```

**Example:**

```bash
GET /api/browse/daily?date=2025-01-10&offset=0&limit=24
```

**Cache:** Global (shared across all users), TTL 1 hour.

**Why Long TTL?** Daily deviations rarely change after publication.

### Mode 3: Following (Watch List)

**GET /api/browse/following**

**Description:** Deviations from users you watch.

**Query Params:**

```typescript
{
  offset: number = 0,
  limit: number = 24,
  mature_content: boolean = false
}
```

**Cache:** User-specific, TTL 5 minutes.

### Mode 4: Tags

**GET /api/browse/tags**

**Description:** Browse deviations by tag name.

**Query Params:**

```typescript
{
  tag: string,                    // REQUIRED
  offset: number = 0,
  limit: number = 24,
  mature_content: boolean = false
}
```

**Example:**

```bash
GET /api/browse/tags?tag=fantasy&offset=0&limit=24
```

**Cache:** Global, TTL 10 minutes.

**Tag Autocomplete:**

**GET /api/browse/tags/search**

```typescript
{
  tag_name: string; // Min 2 characters
}
```

**Response:**

```json
{
  "tags": ["fantasy", "fantasy art", "fantasy character", "fantasy landscape"]
}
```

**Cache:** Global, TTL 24 hours (tag lists are stable).

### Mode 5: Topics

**GET /api/browse/topic**

**Description:** Browse by DeviantArt topic (curated categories).

**Query Params:**

```typescript
{
  topic: string,                  // REQUIRED (canonical name)
  offset: number = 0,
  limit: number = 24,
  mature_content: boolean = false
}
```

**Example:**

```bash
GET /api/browse/topic?topic=digitalart&offset=0&limit=24
```

**Cache:** Global, TTL 10 minutes.

**List All Topics:**

**GET /api/browse/topics/list**

**Response:**

```json
{
  "topics": [
    {
      "name": "Digital Art",
      "canonicalName": "digitalart",
      "exampleDeviations": [
        /* 4 sample deviations */
      ]
    }
  ],
  "hasMore": false
}
```

**Cache:** Global, TTL 1 hour.

**Top Topics:**

**GET /api/browse/toptopics**

**Response:**

```json
{
  "topics": [
    {
      "name": "Fantasy",
      "canonicalName": "fantasy",
      "exampleDeviation": {
        /* single example */
      }
    }
  ]
}
```

**Cache:** Global, TTL 1 hour.

**Trending Tags:**

**GET /api/browse/trendingtags**

**Response:**

```json
{
  "tags": [
    { "name": "fantasy", "count": 100 },
    { "name": "scifi", "count": 99 }
  ]
}
```

**Note:** Uses `toptopics` endpoint internally, transforms to tag format.

**Cache:** Global, TTL 1 hour.

### Mode 6: User Gallery

**GET /api/browse/user-gallery**

**Description:** Browse a specific user's gallery.

**Query Params:**

```typescript
{
  username: string,               // REQUIRED
  offset: number = 0,
  limit: number = 24,
  mature_content: boolean = false
}
```

**Example:**

```bash
GET /api/browse/user-gallery?username=someartist&offset=0&limit=24
```

**Cache:** Per-username, TTL 5 minutes.

---

## Caching Strategy

### Cache Architecture

**Layers:**

1. **Redis Cache** - Primary cache (shared across all API instances)
2. **Request Coalescing** - Prevents duplicate concurrent requests
3. **Stale Cache Fallback** - Returns old data on rate limit (up to 2 hours old)

**Cache Key Format:**

```typescript
// Global modes (tags, daily, topic)
`browse:${mode}:${tag}:${topic}:${mature}:${offset}`
// Per-user modes (home, following, user-gallery)
`browse:${userId}:${mode}:${username}:${offset}`;
```

**Examples:**

```
browse:tags:fantasy::false:0
browse:daily:::false:0
browse:user-uuid:home::0
browse:user-gallery:someartist::0
```

### Cache TTLs

**TTL Configuration:**

```typescript
export const CacheTTL = {
  TAG_SEARCH: 24 * 60 * 60, // 24 hours (stable)
  TOPICS: 60 * 60, // 1 hour
  DEVIATION_METADATA: 15 * 60, // 15 minutes
  BROWSE_GLOBAL: 10 * 60, // 10 minutes (tags, daily, topic)
  BROWSE_PERSONALIZED: 5 * 60, // 5 minutes (home, following)
};
```

**Stale Cache Window:**

```typescript
// If cache is older than TTL but < 2 hours, still usable on rate limit
const STALE_CACHE_MAX_AGE = 2 * 60 * 60; // 2 hours
```

### Request Coalescing

**Problem:** Multiple concurrent requests for same data cause duplicate API calls.

**Solution:** Lock mechanism prevents concurrent fetches.

**Implementation:**

```typescript
export async function getOrFetch<T>(
  cacheKey: string,
  fetchFn: () => Promise<T>,
  ttl: number,
  allowStale: boolean = false
): Promise<CacheResult<T>> {
  // 1. Check cache
  const cached = await RedisCache.get(cacheKey);
  if (cached && !cached.isStale) {
    return { data: cached.data, fromCache: true };
  }

  // 2. Acquire lock (only one request fetches)
  const lockKey = `lock:${cacheKey}`;
  const lockAcquired = await redis.set(lockKey, '1', 'EX', 30, 'NX');

  if (!lockAcquired) {
    // Another request is fetching, wait for it
    await waitForCacheOrTimeout(cacheKey, 5000);
    const cachedAfterWait = await RedisCache.get(cacheKey);
    if (cachedAfterWait) {
      return { data: cachedAfterWait.data, fromCache: true };
    }
  }

  try {
    // 3. Fetch from API
    const data = await fetchFn();

    // 4. Cache result
    await RedisCache.set(cacheKey, data, ttl);

    return { data, fromCache: false };
  } catch (error) {
    // 5. On rate limit, return stale cache if available
    if (allowStale && cached) {
      console.log(`Returning stale cache for ${cacheKey} due to error`);
      return { data: cached.data, fromCache: true, isStale: true };
    }
    throw error;
  } finally {
    // 6. Release lock
    await redis.del(lockKey);
  }
}
```

**Benefits:**

- Only 1 API call for 100 concurrent requests
- Stale cache prevents errors on rate limit
- Lock timeout (30s) prevents deadlocks

### Stale Cache Fallback

**Scenario:** DeviantArt returns 429 (rate limited).

**Behavior:**

```typescript
if (response.status === 429) {
  // Try to return cached data even if expired (up to 2 hours old)
  const cachedResponse = await getCachedBrowseResponse(cacheKey, userId, true); // allowStale=true
  if (cachedResponse) {
    console.log('[API] Returning cached data due to rate limit');
    return res.json(cachedResponse);
  }

  // No cache available
  return res.status(429).json({
    error: 'Rate limited by DeviantArt. Please try again later.',
    retryAfter: 300, // 5 minutes
  });
}
```

**Why 2 Hours?**

- Browse results don't change dramatically in 2 hours
- Better UX than showing error to user
- Prevents thundering herd on rate limit recovery

---

## Additional Features

### More Like This

**GET /api/browse/morelikethis/:deviationId**

**Description:** Find similar deviations to a seed deviation.

**Response:**

```json
{
  "deviations": [
    /* similar deviations */
  ],
  "seed": {
    /* the seed deviation */
  },
  "author": {
    "username": "artist",
    "avatarUrl": "..."
  }
}
```

**Cache:** TTL 15 minutes.

**Use Case:** "Discover more like this" feature.

### Deviation Details

**GET /api/browse/deviation/:deviationId**

**Description:** Get full deviation details with metadata.

**Fetches:**

- Basic deviation info
- Extended metadata (tags, description, stats)
- Download URL (if downloadable, not cached)

**Response:**

```json
{
  "deviationId": "abc123",
  "title": "Artwork Title",
  "url": "https://www.deviantart.com/...",
  "thumbUrl": "...",
  "previewUrl": "...",
  "fullImageUrl": "...",
  "author": {
    "username": "artist",
    "avatarUrl": "...",
    "userId": "...",
    "isWatched": false
  },
  "description": "HTML description",
  "tags": ["digital art", "fantasy"],
  "category": "digitalart/paintings",
  "stats": {
    "favourites": 100,
    "comments": 20,
    "views": 5000,
    "downloads": 50
  },
  "publishedTime": "2025-01-10T14:00:00Z",
  "isDownloadable": true,
  "isMature": false,
  "matureLevel": null,
  "downloadUrl": "https://signed-url...", // Fresh, not cached
  "downloadFilesize": 2048576
}
```

**Cache Strategy:**

- **Metadata cached:** 15 minutes
- **Download URL NOT cached:** Time-limited signed URL fetched fresh each request

**Why Not Cache Download URL?**

- DeviantArt download URLs are signed with expiration (typically 1 hour)
- Caching would serve expired URLs

---

## Performance Optimizations

### Expand Parameter

**All modes use expand:**

```typescript
params.set('expand', 'user.details,deviation.tier,deviation.premium_folder_data');
```

**Why?**

- Reduces API calls (1 request instead of N+1)
- Gets author details, tier info, premium status in single request

### Batch Limit

**Max limit: 50 deviations per request**

```typescript
const limit = Math.min(parseInt(req.query.limit as string) || 24, 50);
```

**Why 50?**

- DeviantArt API limit
- Balances payload size vs. number of requests

### Tier Detection

**Premium/Exclusive Detection:**

```typescript
function transformDeviation(deviation: any): BrowseDeviation {
  const tierAccess = deviation.tier_access || null;

  // Exclusive: Requires purchase
  const isExclusive = tierAccess === 'locked';

  // Premium: Requires subscription
  const isPremium = tierAccess === 'locked-subscribed' || !!deviation.premium_folder_data;

  return {
    /* ... */
    tierAccess,
    isExclusive,
    isPremium,
  };
}
```

**Use Case:** Display badge/icon for exclusive/premium content.

---

## Error Handling

### Rate Limit Handling

**429 Response:**

```typescript
if (response.status === 429) {
  // 1. Try stale cache
  const cached = await getCachedBrowseResponse(cacheKey, userId, true);
  if (cached) {
    return res.json(cached); // Return old data
  }

  // 2. No cache, return error
  return res.status(429).json({
    error: 'Rate limited by DeviantArt. Please try again later.',
    retryAfter: 300, // 5 minutes
  });
}
```

**Client Behavior:**

- Disable browse for 5 minutes
- Show cached data if available
- Notify user of rate limit

### Network Errors

**Transient Errors:**

```typescript
try {
  const response = await fetch(url, { headers });
  // ...
} catch (error) {
  console.error('[API] Browse error:', error);

  // Try stale cache
  const cached = await getCachedBrowseResponse(cacheKey, userId, true);
  if (cached) {
    return res.json(cached);
  }

  res.status(500).json({ error: 'Internal server error' });
}
```

**Fallback:** Always try to return cached data on errors.

---

## Troubleshooting

### "Browse mode returns empty results"

**Cause:** Invalid parameters (e.g., missing required `tag` for tags mode).

**Check:**

```bash
# Tags mode requires tag param
GET /api/browse/tags?tag=fantasy

# Topic mode requires topic param
GET /api/browse/topic?topic=digitalart

# User-gallery requires username param
GET /api/browse/user-gallery?username=someartist
```

### "Stale cache never used"

**Cause:** `allowStale` parameter not set to `true`.

**Check:**

```typescript
// Correct - allows stale cache on rate limit
const result = await RedisCache.getOrFetch(
  cacheKey,
  fetchFn,
  CacheTTL.BROWSE_GLOBAL,
  true // allowStale
);

// Incorrect - never uses stale cache
const result = await RedisCache.getOrFetch(
  cacheKey,
  fetchFn,
  CacheTTL.BROWSE_GLOBAL
  // Missing allowStale parameter
);
```

### "Download URL expired"

**Cause:** Cached deviation metadata includes expired download URL.

**Solution:** Download URLs are intentionally NOT cached:

```typescript
// Fetch fresh download URL if downloadable (not cached)
if (result.data.isDownloadable) {
  const downloadResponse = await fetch(`${DEVIANTART_API_URL}/deviation/download/${deviationId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  // ...
}
```

### "Request coalescing not working"

**Cause:** Redis lock key collision or lock timeout.

**Debug:**

```bash
# Check Redis for active locks
redis-cli KEYS "lock:browse:*"

# Check lock TTL (should be 30s)
redis-cli TTL "lock:browse:tags:fantasy::false:0"
```

**Fix:** If locks are stuck (TTL=-1), manually delete:

```bash
redis-cli DEL "lock:browse:tags:fantasy::false:0"
```

---

## Cache Invalidation

**Manual Invalidation:**

```typescript
// Delete specific cache entry
await redis.del(cacheKey);

// Clear all browse cache
await redis.del(await redis.keys('browse:*'));

// Clear all browse cache for specific user
await redis.del(await redis.keys(`browse:${userId}:*`));
```

**Automatic Expiration:**

- All cache entries have TTL, auto-expire
- No manual invalidation needed in normal operation

**When to Invalidate:**

- User changes watch list (invalidate `home` and `following` modes)
- User blocks/unblocks content (invalidate personal caches)

---

## Related Documentation

- `.context/architecture/patterns.md` - Cache patterns
- `.context/api/endpoints.md` - Browse API routes
- `.context/glossary.md` - Browse terminology
- `.context/errors.md` - Error codes (429, 500)

---

## Future Enhancements

**Planned Features:**

- **Search:** Keyword search across all deviations
- **Filters:** Category, date range, sort order
- **Saved searches:** Save browse configurations
- **Infinite scroll:** Auto-load next offset

**Not Planned:**

- Client-side caching (use server cache only)
- Offline mode (requires DeviantArt API)
