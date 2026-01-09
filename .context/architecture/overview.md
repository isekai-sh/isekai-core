# Architecture Overview

**Purpose:** System design and component architecture
**Last Updated:** 2026-01-05 (v0.1.0-alpha.5)

---

## System Architecture

Isekai Core uses a **3-tier microservice architecture** with fault isolation:

```
┌─────────────────────────────────────────────────────────────┐
│                         USER BROWSER                         │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                 FRONTEND (React SPA)                         │
│  • Port: 3000                                                │
│  • React 18 + Vite 6 + TypeScript                           │
│  • TanStack Query for server state                          │
│  • Zustand for client state                                 │
│  • shadcn/ui + Tailwind CSS                                 │
└────────────────────────────┬────────────────────────────────┘
                             │ REST API calls
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                 BACKEND (Express API)                        │
│  • Port: 4000                                                │
│  • Express.js + TypeScript                                   │
│  • Session-based auth (Redis/PostgreSQL)                    │
│  • API key auth for integrations                            │
│  • 36 REST endpoints                                         │
│  • Queue job submission (BullMQ)                            │
└───────────────┬────────────────────────────┬────────────────┘
                │                            │
                │ Shared DB                  │ Job Queue (Redis)
                │                            │
┌───────────────▼────────────┐   ┌───────────▼──────────────┐
│  PostgreSQL 16             │   │  Redis 7                 │
│  • Prisma ORM              │   │  • BullMQ queues         │
│  • 20+ models              │   │  • Session store         │
│  • Execution locks         │   │  • Circuit breaker state│
│  • User data, deviations   │   │  • Cache layer           │
└───────────────▲────────────┘   └───────────▲──────────────┘
                │                            │
                │ Shared DB                  │ Queue processing
                │                            │
┌───────────────┴────────────────────────────┴────────────────┐
│           PUBLISHER WORKER (Microservice)                    │
│  • Port: 8000 (health checks)                               │
│  • Dedicated Node.js process                                │
│  • Fault isolated from API                                  │
│  • 3 queue workers: deviation, token, cleanup              │
│  • 4 background jobs: auto-scheduler, recovery             │
│  • Health endpoints: /health, /ready, /metrics             │
│  • Graceful shutdown (30s drain)                           │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    EXTERNAL SERVICES                         │
│  • DeviantArt API (OAuth, publishing)                       │
│  • S3-Compatible Storage (R2/S3/MinIO)                      │
│  • Email (Resend) - token expiry warnings                   │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow Diagrams

### 1. OAuth Authentication Flow

```
User Browser → Frontend → Backend API → DeviantArt OAuth
                              ↓
                         PostgreSQL
                         (store tokens)
                              ↓
                         Redis/PostgreSQL
                         (create session)
                              ↓
Frontend ← Backend API ← Session cookie
```

**Steps:**

1. User clicks "Login with DeviantArt"
2. Backend redirects to DeviantArt OAuth authorize URL
3. User grants permission on DeviantArt
4. DeviantArt redirects back with authorization code
5. Backend exchanges code for access + refresh tokens
6. Backend encrypts and stores tokens in PostgreSQL
7. Backend creates session (Redis or PostgreSQL)
8. Backend sets session cookie and redirects to frontend

### 2. Deviation Publishing Workflow

```
User Upload → Frontend → Backend API → S3 Storage
                              ↓
                         PostgreSQL
                         (create deviation)
                              ↓
                         BullMQ Queue
                         (publish job)
                              ↓
                    Publisher Worker
                    (process job)
                              ↓
                    DeviantArt API
                    (submit stash/publish)
                              ↓
                    PostgreSQL
                    (update status → published)
```

**Status Lifecycle:**

```
review → draft → scheduled → uploading → publishing → published
                                           ↓
                                        failed (retry)
```

### 3. Automation Execution Flow

```
Cron Trigger (auto-scheduler job)
         ↓
PostgreSQL (find active automations)
         ↓
For each automation:
  1. Acquire execution lock (UUID)
  2. Select drafts based on strategy
  3. Apply default values
  4. Calculate schedule time + jitter
  5. Update deviation status → scheduled
  6. Release execution lock
         ↓
Publisher Worker (past-due recovery)
  → Detects scheduled deviations
  → Queues for immediate publishing
```

### 4. Token Maintenance Flow

```
Cron Trigger (every 6 hours)
         ↓
PostgreSQL (find tokens expiring < 7 days)
         ↓
For each user:
  1. Check refreshTokenExpiresAt
  2. If < 7 days: refresh token + send warning email
  3. If < 1 day: send urgent email
  4. Update tokenExpiresAt and accessToken
         ↓
DeviantArt OAuth (refresh endpoint)
```

## Component Descriptions

### Frontend (apps/isekai-frontend)

**Technology:** React 18, Vite 6, TypeScript 5.6

**Key Features:**

- Single Page Application (SPA) with React Router 7
- TanStack Query for server state caching
- Zustand for client state (user preferences, UI state)
- shadcn/ui components with Radix UI primitives
- Tailwind CSS for styling
- Drag-and-drop interfaces (@dnd-kit)
- Calendar views (FullCalendar)
- Data tables (TanStack Table)

**Pages (19 total):**

- Authentication: Login, Callback
- Content Management: Draft, Scheduled, Published, Review
- Browsing: Browse, Galleries, GalleryDetail
- Automation: AutomationList, AutomationDetail
- Sales: ExclusivesQueue
- Settings: Templates, ApiKeys, Settings

**State Management:**

- Server state: TanStack Query (deviations, galleries, automations)
- Client state: Zustand (theme, layout preferences)
- Form state: React Hook Form (inferred from patterns)

### Backend API (apps/isekai-backend)

**Technology:** Express.js, TypeScript 5.6, Node.js 20+

**Key Responsibilities:**

- HTTP request handling (REST API)
- Authentication (session + API keys)
- Input validation (Zod schemas)
- Business logic coordination
- Job queue submission (BullMQ)
- File upload handling (multipart/form-data)
- Database operations (Prisma ORM)

**Middleware Stack:**

1. CORS (allow frontend origin)
2. Body parser (JSON + URL-encoded)
3. Cookie parser
4. Session middleware (Redis/PostgreSQL store - auto-detection)
5. Auth middleware (`requireAuth` or `hybridAuth`)
6. Route handlers
7. Error handler (centralized)

**Authentication Modes:**

- **Session-based:** Browser users (cookie)
- **API key:** External integrations (header: `X-API-Key`)
- **Hybrid:** Supports both (e.g., ComfyUI integration)

**Session Store Auto-Detection:**

```typescript
// Tries Redis first, falls back to PostgreSQL
if (REDIS_URL) {
  return new RedisStore({ client: redis });
} else {
  return new PrismaSessionStore(prisma);
}
```

**Storage Abstraction (v0.1.0-alpha.3+):**
Supports multiple S3-compatible backends:

- **Cloudflare R2** (default production)
- **AWS S3** (compatible)
- **MinIO** (self-hosted, development)

Configured via environment variables:

```bash
S3_ENDPOINT=https://xxx.r2.cloudflarestorage.com  # R2
S3_ENDPOINT=https://s3.amazonaws.com              # AWS S3
S3_ENDPOINT=http://minio:9000                     # MinIO
```

**Multi-Tenant Support (SaaS Mode, v0.1.0-alpha.3+):**

- InstanceUser model tracks users per instance
- InstanceSettings model stores runtime config
- S3_PATH_PREFIX for storage isolation: `{tenant_id}/deviations/...`

### Publisher Worker (apps/isekai-publisher)

**Technology:** Node.js 20+, BullMQ 5, TypeScript 5.6

**Why Separate Microservice:**

1. **Fault Isolation:** Crashes don't affect API
2. **Independent Scaling:** Scale based on queue depth
3. **Resource Isolation:** CPU-intensive jobs don't block API
4. **Deployment Flexibility:** Update publisher without API downtime
5. **Simplified Monitoring:** Dedicated health checks

**Architecture (apps/isekai-publisher/src/index.ts):**

```
Main Process
  ├─ Health Check Server (Express on port 8000)
  │   ├─ GET /health (liveness)
  │   ├─ GET /ready (readiness)
  │   └─ GET /metrics (stats)
  │
  ├─ Queue Workers (BullMQ)
  │   ├─ deviation-publisher (concurrency: 5)
  │   ├─ token-maintenance (concurrency: 1)
  │   └─ r2-cleanup (concurrency: 2)
  │
  ├─ Background Jobs (Cron)
  │   ├─ auto-scheduler (every 5 minutes)
  │   ├─ stuck-job-recovery (every 5 minutes)
  │   ├─ past-due-recovery (every 1 minute)
  │   └─ lock-cleanup (every 30 minutes)
  │
  └─ Graceful Shutdown Handler (SIGTERM)
      └─ 30-second drain period
```

**Graceful Shutdown:**

```typescript
process.on('SIGTERM', async () => {
  isShuttingDown = true; // Prevent new jobs
  await setTimeout(30000); // Drain period
  await Promise.all([deviationWorker.close(), tokenWorker.close(), cleanupWorker.close()]);
  process.exit(0);
});
```

### Shared Package (packages/shared)

**Purpose:** Type-safe code sharing across all apps

**Contents:**

- `prisma/schema.prisma` - Single source of truth for database schema
- `src/index.ts` - Exported TypeScript types
- `src/crypto.ts` - Encryption/decryption utilities (AES-256-GCM)
- `src/publisher/` - Publisher queue types and utilities

**Build Process:**

```bash
pnpm --filter @isekai/shared build
# Outputs: dist/ with compiled JS + .d.ts files
```

**Usage in Apps:**

```typescript
import { Deviation, User } from '@isekai/shared';
import { encrypt, decrypt } from '@isekai/shared/crypto';
import { prisma } from '@isekai/shared/db';
```

## Infrastructure Components

### PostgreSQL 16

**Purpose:** Primary data store

**Key Features:**

- ACID transactions
- Row-level locking
- Composite indexes for performance
- Full-text search (future)

**Connection:**

- Backend: Direct via Prisma
- Publisher: Direct via Prisma (no HTTP to API!)
- Connection pooling: Prisma default (10 connections)

**Critical Indexes:**

```sql
-- Performance-critical queries
CREATE INDEX idx_deviations_user_status ON deviations(user_id, status);
CREATE INDEX idx_deviations_status_publish ON deviations(status, actual_publish_at);
CREATE INDEX idx_deviations_execution_lock ON deviations(execution_lock_id, status);
CREATE INDEX idx_deviations_automation ON deviations(automation_id);
```

### Redis 7

**Purpose:** Cache, queue, session store

**Use Cases:**

1. **BullMQ Job Queue:** Reliable job processing
2. **Session Store:** User authentication (optional - can use PostgreSQL)
3. **Circuit Breaker State:** Rate limit protection
4. **Cache Layer:** Gallery/browse data (5min TTL, 2hr stale)

**Persistence:** AOF (Append-Only File) enabled for durability

**Connection:**

- Backend: Via `ioredis` client
- Publisher: Via `ioredis` client
- BullMQ: Via `ioredis` client

**Auto-Detection (v0.1.0-alpha.3+):**
If `REDIS_URL` not set, system falls back to PostgreSQL for sessions. Queues still require Redis.

### S3-Compatible Storage (R2/S3/MinIO)

**Purpose:** File storage for deviation uploads

**Supported Backends (v0.1.0-alpha.3+):**

1. **Cloudflare R2** (production default)
   - No egress fees
   - S3-compatible API
   - Global CDN via R2 Public URL

2. **AWS S3**
   - Standard S3 service
   - Regional buckets

3. **MinIO**
   - Self-hosted S3-compatible
   - Docker Compose for local dev
   - Internal network URL support

**Storage Abstraction (apps/isekai-backend/src/lib/storage.ts):**

```typescript
interface StorageService {
  upload(file: Buffer, key: string): Promise<void>;
  getPresignedUrl(key: string, operation: 'getObject' | 'putObject'): Promise<string>;
  delete(key: string): Promise<void>;
}

// Factory function
export function getStorageService(): StorageService {
  // Returns R2/S3/MinIO implementation based on S3_ENDPOINT
}
```

**Multi-Tenant Storage (v0.1.0-alpha.3+):**

```
Bucket: isekai-uploads
├── tenant-abc123/          ← S3_PATH_PREFIX
│   ├── deviations/
│   │   ├── {id}/file.jpg
│   └── temp/
└── tenant-xyz789/          ← Different tenant
    └── deviations/
```

## Monorepo Structure

```
isekai-core/
├── .context/                    # Substrate documentation (this)
├── .github/
│   └── workflows/
│       └── ci.yml               # CI/CD: test, build, Docker push (GHCR)
├── apps/
│   ├── isekai-backend/          # Express API
│   │   ├── src/
│   │   │   ├── routes/          # 36 route files
│   │   │   ├── middleware/      # Auth, error handling
│   │   │   ├── lib/             # Utilities (DA API, storage, Redis)
│   │   │   ├── queues/          # Queue setup (deprecated)
│   │   │   └── index.ts         # Server entry point
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── isekai-frontend/         # React SPA
│   │   ├── src/
│   │   │   ├── pages/           # 19 page components
│   │   │   ├── components/      # Reusable UI
│   │   │   ├── hooks/           # Custom hooks
│   │   │   ├── lib/             # Utils
│   │   │   ├── store/           # Zustand stores
│   │   │   └── main.tsx         # App entry point
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   └── isekai-publisher/        # Worker microservice
│       ├── src/
│       │   ├── queues/          # 3 workers (deviation, token, cleanup)
│       │   ├── jobs/            # 4 background jobs
│       │   ├── lib/             # Circuit breaker, rate limiter
│       │   └── index.ts         # Worker entry point
│       ├── Dockerfile
│       └── package.json
│
├── packages/
│   └── shared/                  # Shared code
│       ├── prisma/
│       │   └── schema.prisma    # Database schema
│       ├── src/
│       │   ├── index.ts         # Type exports
│       │   ├── crypto.ts        # Encryption
│       │   └── publisher/       # Queue types
│       └── package.json
│
├── docker/                      # Local dev services
│   └── docker-compose.yml       # PostgreSQL + Redis (optional)
│
├── docker-compose.yml           # Full stack (for production)
├── pnpm-workspace.yaml          # Monorepo config
└── package.json                 # Root scripts
```

## Deployment Architecture

**Container Platform:** Docker + Docker Compose

**Production Deployment (v0.1.0-alpha.2+):**

- GitHub Container Registry (GHCR)
- Automated builds via GitHub Actions
- Tags: `latest`, `v0.1.0-alpha.5`, `sha-{git-sha}`

**Environment-Based Configuration:**
All apps configured via environment variables only - no code forks needed for customization.

**Health Checks:**

- Backend: Implicit (HTTP 200 on any route)
- Publisher: Explicit (`/health`, `/ready`, `/metrics`)
- PostgreSQL: `pg_isready`
- Redis: `redis-cli ping`

## Scaling Considerations

### Horizontal Scaling

**Frontend:** Stateless - scale freely behind load balancer

**Backend API:**

- Mostly stateless (sessions in Redis/PostgreSQL)
- Scale behind load balancer
- Session affinity NOT required (external session store)

**Publisher Worker:**

- **Easy horizontal scaling:** Add more worker instances
- BullMQ handles job distribution automatically
- Execution locks prevent duplicate processing
- Each worker processes different jobs concurrently

**Database:**

- PostgreSQL: Vertical scaling (single primary)
- Redis: Vertical scaling (single instance) or Redis Cluster

### Vertical Scaling

**Adjust concurrency:**

```bash
# Publisher
PUBLISHER_CONCURRENCY=10  # Default: 5

# PostgreSQL connection pool
DATABASE_URL="postgresql://...?connection_limit=20"
```

## Development vs Production

| Aspect       | Development            | Production         |
| ------------ | ---------------------- | ------------------ |
| **Storage**  | MinIO (Docker)         | Cloudflare R2      |
| **Database** | PostgreSQL (Docker)    | Managed PostgreSQL |
| **Redis**    | Redis (Docker) or none | Managed Redis      |
| **Sessions** | PostgreSQL fallback    | Redis preferred    |
| **HTTPS**    | Not required           | Required           |
| **CORS**     | `localhost:*`          | Specific domains   |
| **Logging**  | Console                | Structured JSON    |

## Communication Patterns

### Frontend ↔ Backend

- **Protocol:** HTTP/REST
- **Auth:** Session cookies
- **Data Format:** JSON
- **Real-time:** Polling (no WebSockets yet)

### Backend ↔ Publisher

- **NO direct HTTP communication!**
- **Shared Database:** Both read/write PostgreSQL
- **Shared Queue:** Backend enqueues, Publisher dequeues

### Publisher ↔ DeviantArt

- **Protocol:** HTTPS/REST
- **Auth:** OAuth 2.0 Bearer tokens
- **Rate Limiting:** Adaptive with circuit breaker

### All Apps ↔ Storage

- **Protocol:** S3-compatible API
- **Auth:** Access key + secret
- **Operations:** PUT, GET, DELETE via presigned URLs

## Related Files

- `.context/architecture/patterns.md` - Key design patterns
- `.context/architecture/dependencies.md` - Tech stack details
- `.context/decisions/001-microservice-publisher.md` - Why separate publisher
- `.context/workers/publisher.md` - Publisher microservice details
- `.context/database/schema.md` - Database schema reference
