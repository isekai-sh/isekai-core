# Prompt: Add Background Job

**Purpose:** Guide for adding a new cron job or queue worker to Isekai Core

---

## Prerequisites

- [ ] Publisher service running
- [ ] Redis connection available
- [ ] Job requirements defined

---

## Step 1: Choose Job Type

**Cron Job** - Runs on a schedule (e.g., every 5 minutes)

- Use for: Periodic cleanup, maintenance tasks
- Example: Lock cleanup, past-due recovery

**Queue Worker** - Processes jobs from queue

- Use for: User-triggered async tasks
- Example: Deviation publishing, token refresh

---

## Step 2: Create Cron Job

**Location:** `apps/isekai-publisher/src/jobs/my-job.ts`

```typescript
/*
 * Copyright (C) 2025 Isekai
 * AGPL-3.0 License
 */

import { prisma } from '../db';

export async function myJob() {
  console.log('[my-job] Starting...');

  try {
    // Perform job logic
    const result = await prisma.myModel.updateMany({
      where: {
        /* condition */
      },
      data: {
        /* updates */
      },
    });

    console.log(`[my-job] Processed ${result.count} items`);
  } catch (error) {
    console.error('[my-job] Error:', error);
  }
}

// Schedule job (every 10 minutes)
setInterval(myJob, 10 * 60 * 1000);

// Run immediately on startup
myJob();
```

---

## Step 3: Create Queue Worker

**Location:** `apps/isekai-publisher/src/queues/my-queue.ts`

```typescript
import { Queue, Worker } from 'bullmq';
import { redisConnection } from '../redis';

interface MyJobData {
  itemId: string;
  userId: string;
}

// Create queue (for enqueuing jobs)
export const myQueue = new Queue<MyJobData>('my-queue', {
  connection: redisConnection,
});

// Create worker (for processing jobs)
export const myWorker = new Worker<MyJobData>(
  'my-queue',
  async (job) => {
    console.log(`Processing job ${job.id}:`, job.data);

    const { itemId, userId } = job.data;

    // Process job
    await processItem(itemId, userId);

    return { success: true };
  },
  {
    connection: redisConnection,
    concurrency: 3, // Process 3 jobs concurrently
  }
);

// Error handling
myWorker.on('failed', (job, error) => {
  console.error(`Job ${job?.id} failed:`, error);
});

myWorker.on('completed', (job) => {
  console.log(`Job ${job.id} completed`);
});
```

---

## Step 4: Register Job in Publisher

**File:** `apps/isekai-publisher/src/index.ts`

```typescript
// For cron jobs
import './jobs/my-job';

// For queue workers
import { myWorker } from './queues/my-queue';

// Graceful shutdown
process.on('SIGTERM', async () => {
  await myWorker.close();
  process.exit(0);
});
```

---

## Step 5: Enqueue Jobs from API

**File:** `apps/isekai-backend/src/routes/my-endpoint.ts`

```typescript
import { myQueue } from '@isekai/shared/queues/my-queue';

router.post(
  '/process',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.session.user!.id;
    const { itemId } = req.body;

    // Enqueue job
    await myQueue.add('process-item', {
      itemId,
      userId,
    });

    res.json({ message: 'Job enqueued' });
  })
);
```

---

## Checklist

- [ ] Job logic implemented
- [ ] Error handling added
- [ ] Logging included
- [ ] Job registered in publisher index.ts
- [ ] Graceful shutdown added (queue workers)
- [ ] Documentation updated in .context/workers/background-jobs.md
- [ ] Tested locally

---

## Related Documentation

- `.context/workers/publisher.md`
- `.context/workers/background-jobs.md`
