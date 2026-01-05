# Prompt: Optimize Performance

**Purpose:** Guide for identifying and fixing performance bottlenecks in Isekai Core

---

## Step 1: Identify the Bottleneck

### Measure First

**Never optimize without measuring!**

```bash
# Backend API latency
curl -w "@curl-format.txt" http://localhost:4000/api/deviations

# curl-format.txt:
time_total: %{time_total}s
time_connect: %{time_connect}s
time_starttransfer: %{time_starttransfer}s
```

### Common Performance Issues

1. **Slow API Endpoint** (> 500ms response time)
2. **N+1 Query Problem** (multiple database queries)
3. **Large Payload** (> 1MB response)
4. **Slow Frontend Render** (> 100ms)
5. **Memory Leak** (increasing memory over time)

---

## Step 2: Profile the Issue

### Backend Profiling

**Add timing logs:**

```typescript
router.get("/deviations", asyncHandler(async (req, res) => {
  const start = Date.now();

  // Query 1
  const deviations = await prisma.deviation.findMany({ where: { userId } });
  console.log(`[PERF] Query deviations: ${Date.now() - start}ms`);

  // Query 2
  for (const deviation of deviations) {
    const files = await prisma.deviationFile.findMany({
      where: { deviationId: deviation.id },
    });
    console.log(`[PERF] Query files for ${deviation.id}: ${Date.now() - start}ms`);
  }

  res.json({ deviations });
}));
```

**Result:**
```
[PERF] Query deviations: 50ms
[PERF] Query files for dev1: 70ms  ← N+1 problem!
[PERF] Query files for dev2: 90ms
[PERF] Query files for dev3: 110ms
...
```

---

## Step 3: Fix N+1 Queries

### Before (N+1 Problem)

```typescript
// ❌ BAD: 1 query + N queries (slow)
const deviations = await prisma.deviation.findMany({
  where: { userId },
});

for (const deviation of deviations) {
  const files = await prisma.deviationFile.findMany({
    where: { deviationId: deviation.id },
  });
  deviation.files = files;
}
```

**Performance:** 1 + 100 = 101 queries (~2 seconds)

### After (Optimized)

```typescript
// ✅ GOOD: 1 query with include (fast)
const deviations = await prisma.deviation.findMany({
  where: { userId },
  include: { files: true },
});
```

**Performance:** 1 query (~20ms)

---

## Step 4: Add Database Indexes

### Identify Missing Indexes

**Slow query log:**

```sql
-- Query taking 5 seconds
SELECT * FROM deviations WHERE user_id = 'abc123' ORDER BY created_at DESC;
```

**Check indexes:**

```sql
\d deviations  -- PostgreSQL: List indexes

-- If userId not indexed:
CREATE INDEX idx_deviations_user_id ON deviations(user_id);
```

### Add Index to Prisma Schema

```prisma
model Deviation {
  // ... fields ...

  @@index([userId])
  @@index([userId, status])  // Composite index for filtered queries
  @@index([actualPublishAt])  // For sorting
}
```

**Apply:**

```bash
DATABASE_URL="..." pnpm --filter @isekai/shared prisma:push
```

---

## Step 5: Optimize Query Selects

### Before (Over-fetching)

```typescript
// ❌ BAD: Fetching all fields (large payload)
const deviations = await prisma.deviation.findMany({
  where: { userId },
  include: { files: true },
});
// Response: 5MB (includes descriptions, tags, etc.)
```

### After (Select Only Needed Fields)

```typescript
// ✅ GOOD: Select only needed fields (small payload)
const deviations = await prisma.deviation.findMany({
  where: { userId },
  select: {
    id: true,
    title: true,
    status: true,
    actualPublishAt: true,
    files: {
      select: {
        id: true,
        url: true,
      },
    },
  },
});
// Response: 500KB (80% reduction)
```

---

## Step 6: Add Caching

### Backend Caching (Redis)

```typescript
import { redis } from "../redis";

router.get("/browse/:mode", asyncHandler(async (req, res) => {
  const { mode } = req.params;
  const cacheKey = `browse:${mode}:${req.query.offset || 0}`;

  // Check cache
  const cached = await redis.get(cacheKey);
  if (cached) {
    console.log("[CACHE] Hit");
    return res.json(JSON.parse(cached));
  }

  // Fetch from DeviantArt API
  const data = await deviantartApi.browse(mode, req.query);

  // Cache for 5 minutes
  await redis.setex(cacheKey, 5 * 60, JSON.stringify(data));

  res.json(data);
}));
```

### Frontend Caching (TanStack Query)

```typescript
// ✅ GOOD: Cache with stale time
const { data } = useQuery({
  queryKey: ["browse", mode],
  queryFn: () => browse.fetch(mode),
  staleTime: 5 * 60 * 1000, // 5 minutes
});
```

---

## Step 7: Implement Pagination

### Before (No Pagination)

```typescript
// ❌ BAD: Fetching all 10,000 deviations
const deviations = await prisma.deviation.findMany({
  where: { userId },
});
// Response: 50MB, 10 seconds
```

### After (Cursor-Based Pagination)

```typescript
// ✅ GOOD: Paginated (50 items per page)
const deviations = await prisma.deviation.findMany({
  where: { userId },
  take: 50,
  skip: req.query.offset ? parseInt(req.query.offset) : 0,
  orderBy: { createdAt: "desc" },
});

res.json({
  deviations,
  nextOffset: deviations.length === 50 ? (req.query.offset || 0) + 50 : null,
});
// Response: 2.5MB, 100ms
```

---

## Step 8: Optimize Frontend Rendering

### Use React.memo for Expensive Components

```tsx
// ✅ GOOD: Memoized component
export const DeviationCard = React.memo(({ deviation }: Props) => {
  // Expensive rendering logic
  return <Card>{/* ... */}</Card>;
});
```

### Virtualize Long Lists

```tsx
import { useVirtualizer } from "@tanstack/react-virtual";

function DeviationList({ deviations }: Props) {
  const parentRef = React.useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: deviations.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 200, // Estimated row height
  });

  return (
    <div ref={parentRef} style={{ height: "600px", overflow: "auto" }}>
      <div style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map((virtualRow) => (
          <div key={virtualRow.index} style={{ transform: `translateY(${virtualRow.start}px)` }}>
            <DeviationCard deviation={deviations[virtualRow.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## Step 9: Monitor Performance

### Add Metrics

```typescript
// Track API endpoint latency
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(`[METRICS] ${req.method} ${req.path}: ${duration}ms`);
  });
  next();
});
```

### Set Performance Budgets

**Target Metrics:**
- API response time: < 200ms (p95)
- Database query time: < 50ms
- Frontend page load: < 1 second
- Memory usage: < 512MB

---

## Checklist

- [ ] Bottleneck identified and measured
- [ ] N+1 queries fixed with `include` or `select`
- [ ] Database indexes added
- [ ] Caching implemented (where appropriate)
- [ ] Pagination added for large lists
- [ ] Frontend rendering optimized
- [ ] Performance metrics tracked
- [ ] Tests still pass
- [ ] Verified improvement with benchmarks

---

## Common Pitfalls

1. **Premature Optimization**
   - ❌ Optimize before measuring
   - ✅ Measure first, optimize bottlenecks

2. **Over-Caching**
   - ❌ Cache everything
   - ✅ Cache slow, frequently accessed data

3. **Missing Indexes**
   - ❌ Query without indexes
   - ✅ Add indexes for filtered/sorted columns

4. **Large Payloads**
   - ❌ Return all fields
   - ✅ Use `select` to return only needed fields

---

## Related Documentation

- `.context/database/schema.md`
- `.context/api/endpoints.md`
- `.context/testing.md`
