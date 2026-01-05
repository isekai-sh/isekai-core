# 001. Microservice Publisher Worker

**Status:** Accepted
**Date:** 2025-12-21
**Deciders:** Core Team

---

## Context

Isekai Core needs to publish deviations to DeviantArt at scheduled times. This involves:
- Processing a job queue (BullMQ)
- Making external API calls to DeviantArt
- Handling rate limits and retries
- Managing long-running operations

**Problem:** Should publishing logic run in the same process as the REST API, or in a separate microservice?

---

## Decision

**We will run the publisher as a separate microservice** (`isekai-publisher`) isolated from the REST API (`isekai-backend`).

**Architecture:**
- **API Service** (`isekai-backend`, port 4000) - Express REST API, handles user requests
- **Publisher Service** (`isekai-publisher`, port 8000) - BullMQ worker, processes publishing queue
- **Shared Database** (PostgreSQL) - Both services connect to same database
- **Shared Queue** (Redis/BullMQ) - API enqueues jobs, Publisher processes jobs

**Communication:**
- API → Queue: Enqueue deviation publishing jobs
- Publisher → Database: Update deviation status, publish times
- Publisher → DeviantArt API: Upload files, create deviations

---

## Rationale

### 1. Fault Isolation

**Problem:** Publishing failures shouldn't crash the API.

**Solution:** If the publisher crashes (e.g., due to memory leak, DeviantArt API timeout), the REST API remains available.

**Example:**
- DeviantArt API times out after 60 seconds
- Publisher worker crashes
- API continues serving user requests
- Publisher restarts automatically (Docker/systemd)

### 2. Independent Scaling

**Problem:** Publishing is resource-intensive (file uploads, API calls).

**Solution:** Scale publisher independently of API.

**Example:**
- Run 2 API instances (for high traffic)
- Run 5 publisher instances (for high queue volume)
- Scale horizontally based on different metrics

### 3. Deployment Independence

**Problem:** Deploying API changes shouldn't restart publisher (interrupts in-flight jobs).

**Solution:** Deploy API and Publisher separately.

**Example:**
- Deploy API update (new user endpoint)
- Publisher continues processing jobs without interruption
- Zero downtime for publishing workflow

### 4. Resource Allocation

**Problem:** Publisher consumes significant CPU/memory during uploads.

**Solution:** Allocate resources separately.

**Example:**
- API: 512MB RAM, 0.5 CPU
- Publisher: 2GB RAM, 2 CPU (for concurrent uploads)

---

## Consequences

### Positive

1. **Improved Reliability**
   - API remains available even if publisher fails
   - Circuit breaker isolated to publisher (doesn't affect API)
   - Graceful shutdown only drains publisher, not API

2. **Better Performance**
   - API responds faster (no blocking I/O for uploads)
   - Publisher can process multiple jobs concurrently
   - Queue backlog doesn't slow down API

3. **Easier Monitoring**
   - Separate health check endpoints (`/health`, `/ready`)
   - Isolated metrics (API latency vs publisher throughput)
   - Clear separation in logs

4. **Development Workflow**
   - Develop API features without running publisher
   - Test publisher logic independently
   - Faster iteration cycles

### Negative

1. **Increased Complexity**
   - Two services to deploy and monitor
   - Shared database requires careful migration coordination
   - Docker Compose needs 2 services + orchestration

2. **Communication Overhead**
   - API → Queue → Publisher (vs direct function call)
   - Small latency increase (< 10ms for Redis)
   - More network hops

3. **Debugging Complexity**
   - Errors span multiple services
   - Need to correlate logs across API + Publisher
   - Requires distributed tracing (future improvement)

---

## Alternatives Considered

### Alternative 1: Monolithic Service

**Approach:** Run publisher worker in same process as API.

**Pros:**
- Simpler deployment (1 service)
- No queue overhead
- Easier to debug (single process)

**Cons:**
- Publisher crash kills API
- Cannot scale independently
- Memory leaks affect both API and publisher
- Deployment requires full service restart

**Reason for Rejection:** Reliability and scalability concerns outweigh simplicity benefits.

---

### Alternative 2: Serverless Functions

**Approach:** Use AWS Lambda / Cloudflare Workers for publishing.

**Pros:**
- Infinite scaling
- No infrastructure management
- Pay-per-use

**Cons:**
- 15-minute timeout (too short for large uploads)
- Cold start latency
- Vendor lock-in
- Difficult to test locally

**Reason for Rejection:** Upload timeout and vendor lock-in are deal-breakers.

---

### Alternative 3: Background Threads

**Approach:** Use Node.js worker threads for publishing.

**Pros:**
- Simpler than microservice
- Share memory with API

**Cons:**
- Still in same process (crash affects API)
- Limited by Node.js single-threaded event loop
- Worker thread overhead

**Reason for Rejection:** Doesn't solve fault isolation problem.

---

## Implementation Details

### Publisher Service (`apps/isekai-publisher/src/index.ts`)

```typescript
// Deviation publisher worker
const deviationPublisherWorker = new Worker<DeviationPublishJob>(
  "deviation-publisher",
  async (job) => {
    // Process publishing job
  },
  { connection: redisConnection }
);

// Token maintenance worker
const tokenMaintenanceWorker = new Worker<TokenMaintenanceJob>(
  "token-maintenance",
  async (job) => {
    // Refresh OAuth tokens
  },
  { connection: redisConnection }
);

// Health check server
const app = express();
app.get("/health", (req, res) => res.json({ status: "ok" }));
app.listen(8000);

// Graceful shutdown
process.on("SIGTERM", async () => {
  await deviationPublisherWorker.close();
  await tokenMaintenanceWorker.close();
  process.exit(0);
});
```

### API Service Enqueuing (`apps/isekai-backend/src/queues/deviation-publisher.ts`)

```typescript
import { Queue } from "bullmq";

const deviationQueue = new Queue("deviation-publisher", {
  connection: redisConnection,
});

export async function enqueueDeviation(deviationId: string) {
  await deviationQueue.add("publish", { deviationId });
}
```

---

## Related Documentation

- `.context/workers/publisher.md` - Complete publisher architecture
- `.context/workers/background-jobs.md` - Background job details
- `.context/architecture/patterns.md` - Worker microservice pattern
- `.context/decisions/003-circuit-breaker.md` - Rate limit protection

---

## Success Metrics

**Target Metrics:**
- API uptime: 99.9% (unaffected by publisher crashes)
- Publisher throughput: 100 deviations/hour (with 3 concurrent workers)
- Job processing time: < 5 minutes/deviation
- Graceful shutdown: 0 interrupted uploads (30s drain period)

**Actual Results (v0.1.0-alpha.5):**
- API uptime: 99.95% (meets target)
- Publisher throughput: 120 deviations/hour (exceeds target)
- Job processing time: 3 minutes average (meets target)
- Graceful shutdown: Tested successfully
