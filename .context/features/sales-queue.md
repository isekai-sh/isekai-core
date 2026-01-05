# Sales Queue - Exclusive Content Pricing

**Purpose:** Guide to the sales queue system for batch-processing exclusive content pricing on DeviantArt
**Last Updated:** 2026-01-05 (v0.1.0-alpha.5)

---

## Overview

The **Sales Queue** allows users to batch-process pricing for exclusive content on DeviantArt. Instead of manually setting prices one-by-one, users can queue deviations with price presets and process them in batches.

**Use Cases:**
- Set pricing for multiple exclusive artworks at once
- Apply variable pricing (random price within range)
- Track pricing progress with status tracking
- Store screenshot proof of pricing

**Workflow:**
```
Published Deviation
  ↓ (add to queue with price preset)
pending
  ↓ (browser automation picks up - future feature)
processing
  ↓ (price set on DeviantArt)
completed ✅
  OR
failed ❌
  OR
skipped (user manually skipped)
```

**Related Files:**
- `/apps/isekai-backend/src/routes/sale-queue.ts` - API routes
- `/apps/isekai-backend/src/routes/price-presets.ts` - Price preset management
- `/packages/shared/prisma/schema.prisma` - SaleQueue and PricePreset models

---

## Core Concepts

### Sale Queue Entry

**Fields:**
```typescript
{
  id: string,
  userId: string,
  deviationId: string,       // Must be published
  pricePresetId: string,     // Price template
  price: number,             // Final calculated price (cents)
  status: SaleQueueStatus,   // pending|processing|completed|failed|skipped
  attempts: number,          // Retry counter (max 3)
  errorMessage: string?,     // Human-readable error
  errorDetails: Json?,       // Full error context
  screenshotKey: string?,    // S3 key to proof screenshot
  processingBy: string?,     // Worker ID
  lockedAt: DateTime?,       // Lock acquisition time
  lastAttemptAt: DateTime?,  // Last processing attempt
  completedAt: DateTime?,    // Successful completion time
  createdAt: DateTime,       // Queue entry creation
  updatedAt: DateTime        // Last modification
}
```

### Price Preset

**Purpose:** Reusable pricing template for exclusive content.

**Fields:**
```typescript
{
  id: string,
  userId: string,
  name: string,              // "Standard Pricing", "Variable $30-100"
  price: number,             // Fallback/fixed price (cents)
  minPrice: number?,         // Random range minimum (cents)
  maxPrice: number?,         // Random range maximum (cents)
  currency: string,          // "USD" (only USD supported currently)
  isDefault: boolean,        // Auto-select for new queue items
  createdAt: DateTime,
  updatedAt: DateTime
}
```

**Pricing Logic:**

#### Fixed Price
```json
{
  "name": "Standard",
  "price": 5000,     // $50.00
  "minPrice": null,
  "maxPrice": null
}
```

**Result:** All deviations use $50.00.

#### Variable Price
```json
{
  "name": "Variable",
  "price": 5000,      // Fallback if calculation fails
  "minPrice": 3000,   // $30.00
  "maxPrice": 10000   // $100.00
}
```

**Calculation:**
```typescript
const range = maxPrice - minPrice;
const finalPrice = minPrice + Math.floor(Math.random() * (range + 1));
// Example: $3000 + Math.floor(Math.random() * 7001)
// Result: $30.00 to $100.00 (inclusive)
```

**Result:** Each deviation gets random price between $30.00 and $100.00.

---

## API Endpoints

### List Queue Items

**GET /api/sale-queue**

**Query Params:**
```typescript
{
  status?: "pending" | "processing" | "completed" | "failed" | "skipped",
  page?: number = 1,
  limit?: number = 50  // Max 100
}
```

**Response:**
```json
{
  "items": [
    {
      "id": "queue-uuid",
      "deviationId": "deviation-uuid",
      "pricePresetId": "preset-uuid",
      "price": 5000,
      "status": "pending",
      "attempts": 0,
      "errorMessage": null,
      "errorDetails": null,
      "screenshotKey": null,
      "processingBy": null,
      "lockedAt": null,
      "lastAttemptAt": null,
      "completedAt": null,
      "createdAt": "2025-01-10T14:00:00Z",
      "updatedAt": "2025-01-10T14:00:00Z",
      "deviation": {
        "id": "deviation-uuid",
        "title": "My Artwork",
        "deviationUrl": "https://www.deviantart.com/...",
        "publishedAt": "2025-01-09T10:00:00Z"
      },
      "pricePreset": {
        "id": "preset-uuid",
        "name": "Standard Pricing",
        "price": 5000,
        "minPrice": null,
        "maxPrice": null,
        "currency": "USD"
      }
    }
  ],
  "total": 10,
  "page": 1,
  "limit": 50
}
```

### Add to Queue

**POST /api/sale-queue**

**Body:**
```json
{
  "deviationIds": ["deviation-uuid-1", "deviation-uuid-2"],
  "pricePresetId": "preset-uuid"
}
```

**Validation:**
- Max 50 deviations per request (batch limit)
- Deviations must be published (`status: "published"`)
- Deviations must have `deviationUrl` (DeviantArt URL)
- Deviations must belong to requesting user
- Price preset must belong to requesting user

**Response:**
```json
{
  "created": 2,
  "skipped": 0,
  "message": "Added 2 deviation(s) to sale queue"
}
```

**De-Duplication:**
- Existing queue entries for same deviation are skipped
- Only new deviations are added

**Price Calculation:**
```typescript
let finalPrice: number;
if (preset.minPrice !== null && preset.maxPrice !== null) {
  // Variable pricing
  const range = preset.maxPrice - preset.minPrice;
  finalPrice = preset.minPrice + Math.floor(Math.random() * (range + 1));
} else {
  // Fixed pricing
  finalPrice = preset.price;
}

// Create queue entries
await prisma.saleQueue.createMany({
  data: deviationIds.map(deviationId => ({
    userId,
    deviationId,
    pricePresetId,
    price: finalPrice,  // Same price for all in batch
  }))
});
```

**Note:** All deviations in a single batch get the **same** random price (if variable pricing). To get different prices, add deviations one-by-one.

### Update Status

**PATCH /api/sale-queue/:id**

**Body:**
```json
{
  "status": "completed",
  "errorMessage": null,
  "errorDetails": null,
  "screenshotKey": "sale-queue/queue-uuid/proof.png"
}
```

**Use Cases:**
- Mark as completed after manual pricing
- Mark as skipped to skip processing
- Update error message after failed attempt

**Automatic Fields:**
```typescript
{
  completedAt: data.status === "completed" ? new Date() : null
}
```

### Delete from Queue

**DELETE /api/sale-queue/:id**

**Use Case:** Remove from queue before processing.

---

## Status Transitions

### Status Flow

```
pending
  ↓ (worker acquires lock)
processing
  ↓ (attempt to set price)
  ├─ Success → completed
  ├─ Permanent error → failed
  ├─ Transient error (attempts < 3) → pending (retry)
  └─ Max attempts (3) → failed
```

**Manual Transitions:**
```
pending → skipped (user skips)
failed → pending (user retries)
```

### Status Definitions

| Status | Description | Next Actions |
|--------|-------------|--------------|
| `pending` | Waiting for processing | Worker picks up |
| `processing` | Currently being processed | Wait for completion |
| `completed` | Price successfully set | View on DeviantArt |
| `failed` | Processing failed (max retries) | View error, fix, retry |
| `skipped` | User manually skipped | Re-queue if needed |

---

## Price Preset Management

### Create Preset

**POST /api/price-presets**

**Fixed Price Example:**
```json
{
  "name": "Standard $50",
  "price": 5000,
  "currency": "USD",
  "isDefault": false
}
```

**Variable Price Example:**
```json
{
  "name": "Variable $30-$100",
  "price": 5000,
  "minPrice": 3000,
  "maxPrice": 10000,
  "currency": "USD",
  "isDefault": true
}
```

**Validation:**
```typescript
const createPresetSchema = z.object({
  name: z.string().min(1).max(100),
  price: z.number().int().min(100).max(100000),  // $1.00 to $1000.00
  minPrice: z.number().int().min(100).max(100000).optional(),
  maxPrice: z.number().int().min(100).max(100000).optional(),
  currency: z.enum(["USD"]),  // Only USD supported
  isDefault: z.boolean().default(false),
});
```

**Range Validation:**
```typescript
if (minPrice && maxPrice && minPrice > maxPrice) {
  throw new AppError(400, "minPrice cannot be greater than maxPrice");
}
```

### Default Preset

**Only one preset can be default:**
```typescript
if (data.isDefault) {
  // Unset existing default
  await prisma.pricePreset.updateMany({
    where: { userId, isDefault: true },
    data: { isDefault: false }
  });
}
```

**Use Case:** Auto-select default preset when adding to queue from automation.

---

## Automation Integration

### Auto-Add to Sale Queue

**Automation Config:**
```json
{
  "autoAddToSaleQueue": true,
  "saleQueuePresetId": "preset-uuid"
}
```

**Behavior:**

When automation schedules a deviation with `autoAddToSaleQueue: true`:

```typescript
// 1. Force protection defaults
if (automation.autoAddToSaleQueue && automation.saleQueuePresetId) {
  // Override displayResolution to highest if it's 0 (original)
  const currentResolution = draft.displayResolution ?? 0;
  if (currentResolution === 0) {
    updates.displayResolution = 8; // Force 1920px
  }

  // Force watermark and disable free download
  updates.addWatermark = true;
  updates.allowFreeDownload = false;
}

// 2. After publishing, add to sale queue
if (automation.autoAddToSaleQueue && automation.saleQueuePresetId) {
  await prisma.saleQueue.create({
    data: {
      userId,
      deviationId,
      pricePresetId: automation.saleQueuePresetId,
      price: calculatePrice(preset),
    }
  });
}
```

**Protection Defaults Explained:**
- **displayResolution: 8** - 1920px with watermark support (prevents full-res free downloads)
- **addWatermark: true** - Adds watermark to preview (protects exclusive content)
- **allowFreeDownload: false** - Disables free download button (forces purchase)

**Why?** Exclusive content must have download protection to justify pricing.

---

## Processing Logic (Future Feature)

### Worker Pattern

**Note:** Sale queue processing is planned but not yet implemented. The queue is currently manual.

**Planned Implementation:**

```typescript
// Worker picks up next pending item
const queueItem = await prisma.$transaction(async (tx) => {
  const next = await tx.saleQueue.findFirst({
    where: {
      status: 'pending',
      OR: [
        { lockedAt: null },
        { lockedAt: { lt: new Date(Date.now() - 5 * 60 * 1000) } } // Stale lock (5 min)
      ]
    },
    orderBy: { createdAt: 'asc' }
  });

  if (!next) return null;

  // Acquire lock
  await tx.saleQueue.update({
    where: { id: next.id },
    data: {
      status: 'processing',
      processingBy: workerId,
      lockedAt: new Date(),
      lastAttemptAt: new Date(),
      attempts: { increment: 1 }
    }
  });

  return next;
});

if (!queueItem) return; // No work

// Process with browser automation
try {
  await setDeviationPrice(queueItem.deviationUrl, queueItem.price);

  // Take screenshot proof
  const screenshot = await takeScreenshot();
  const screenshotKey = await uploadScreenshot(screenshot, queueItem.id);

  // Mark completed
  await prisma.saleQueue.update({
    where: { id: queueItem.id },
    data: {
      status: 'completed',
      completedAt: new Date(),
      screenshotKey,
      processingBy: null,
      lockedAt: null
    }
  });
} catch (error) {
  // Handle failure
  const maxAttempts = 3;
  const shouldRetry = queueItem.attempts < maxAttempts && isTransientError(error);

  await prisma.saleQueue.update({
    where: { id: queueItem.id },
    data: {
      status: shouldRetry ? 'pending' : 'failed',
      errorMessage: error.message,
      errorDetails: { stack: error.stack, code: error.code },
      processingBy: null,
      lockedAt: null
    }
  });
}
```

**Why Not Implemented?**
- Requires browser automation (Puppeteer/Playwright)
- DeviantArt doesn't have API endpoint for setting prices
- Must interact with web UI programmatically (complex, fragile)

---

## Error Handling

### Retry Logic

**Max Attempts:** 3

**Transient Errors (Retryable):**
- Network timeout
- DeviantArt server error (5xx)
- Temporary UI changes

**Permanent Errors (Not Retryable):**
- Deviation not found (deleted from DeviantArt)
- Invalid price (out of allowed range)
- Authentication failure (requires re-login)

**Retry Backoff:**
```typescript
const backoffMs = Math.min(2000 * Math.pow(2, attempts), 60000);
// Attempt 1: 2s
// Attempt 2: 4s
// Attempt 3: 8s
```

### Error Details

**Stored in `errorDetails` JSON:**
```json
{
  "stack": "Error: Failed to set price\n    at ...",
  "code": "PRICE_SET_FAILED",
  "context": {
    "deviationUrl": "https://www.deviantart.com/...",
    "attemptedPrice": 5000,
    "browserError": "Element not found: input#price"
  }
}
```

---

## Screenshot Proof

**Purpose:** Store proof that price was set correctly (for auditing/disputes).

**Storage:**
```typescript
const screenshotKey = `sale-queue/${queueItemId}/proof.png`;
await storage.upload(screenshot, screenshotKey);

await prisma.saleQueue.update({
  where: { id: queueItemId },
  data: { screenshotKey }
});
```

**Retrieval:**
```typescript
const presignedUrl = await storage.getPresignedUrl(screenshotKey, 'getObject', 3600);
// User can download screenshot for 1 hour
```

**Use Cases:**
- Verify pricing was applied
- Resolve disputes ("price not set correctly")
- Debugging failed attempts

---

## Troubleshooting

### "Cannot add deviation to queue"

**Cause:** Deviation not published or missing `deviationUrl`.

**Check:**
```typescript
const deviation = await prisma.deviation.findUnique({
  where: { id: deviationId },
  select: { status: true, deviationUrl: true }
});

if (deviation.status !== 'published') {
  throw new AppError(400, "Deviation must be published");
}

if (!deviation.deviationUrl) {
  throw new AppError(400, "Deviation must have DeviantArt URL");
}
```

### "Same price for all deviations in batch"

**Expected Behavior:** When using variable pricing, all deviations in a single batch get the same random price.

**Reason:**
```typescript
// Price calculated ONCE per batch
const finalPrice = preset.minPrice + Math.floor(Math.random() * (range + 1));

// Applied to ALL deviations
await prisma.saleQueue.createMany({
  data: deviationIds.map(deviationId => ({
    price: finalPrice,  // Same for all
    /* ... */
  }))
});
```

**Solution:** Add deviations one-by-one for different prices:
```bash
# Each request gets different random price
POST /api/sale-queue {"deviationIds": ["dev-1"], "pricePresetId": "preset-uuid"}
POST /api/sale-queue {"deviationIds": ["dev-2"], "pricePresetId": "preset-uuid"}
POST /api/sale-queue {"deviationIds": ["dev-3"], "pricePresetId": "preset-uuid"}
```

### "Queue item stuck in processing"

**Cause:** Worker crashed or stale lock.

**Solution:** Lock cleanup (manual):
```typescript
// Find stale locks (>5 minutes old)
const staleItems = await prisma.saleQueue.findMany({
  where: {
    status: 'processing',
    lockedAt: { lt: new Date(Date.now() - 5 * 60 * 1000) }
  }
});

// Reset to pending
await prisma.saleQueue.updateMany({
  where: { id: { in: staleItems.map(i => i.id) } },
  data: {
    status: 'pending',
    processingBy: null,
    lockedAt: null
  }
});
```

---

## Performance Considerations

### Batch Limits

**Max 50 deviations per batch:**
```typescript
const addToQueueSchema = z.object({
  deviationIds: z.array(z.string().uuid()).min(1).max(50),
  /* ... */
});
```

**Why 50?**
- Prevents large single-transaction payload
- Balances UX (batch efficiency) vs. safety (rollback on error)

### Query Optimization

**Index on status + createdAt:**
```sql
CREATE INDEX idx_sale_queue_status_created ON sale_queue(status, created_at);
```

**Why?** Worker frequently queries:
```sql
SELECT * FROM sale_queue WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1;
```

---

## Related Documentation

- `.context/database/models.md` - SaleQueue and PricePreset models
- `.context/features/automation.md` - Auto-add to sale queue integration
- `.context/api/endpoints.md` - Sale queue API routes
- `.context/glossary.md` - Status definitions

---

## Future Enhancements

**Planned Features:**
- **Browser automation:** Auto-process queue with Puppeteer
- **Bulk operations:** Process all pending items
- **Priority queue:** High-priority items processed first
- **Scheduling:** Process queue at specific times

**Not Planned:**
- Multi-currency support (DeviantArt uses USD only)
- Discounts/sales (DeviantArt doesn't support time-limited pricing)
