# Dependencies & Tech Stack

**Purpose:** Technology stack, approved packages, and license compatibility
**Last Updated:** 2026-01-05 (v0.1.0-alpha.5)

---

## Version Information

- **Project Version:** 0.1.0-alpha.5
- **License:** AGPL-3.0
- **Node.js:** ≥20.0.0 (LTS)
- **pnpm:** ≥9.0.0
- **TypeScript:** 5.6.3

## Core Technologies

### Runtime & Language

| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | 20+ | JavaScript runtime |
| TypeScript | 5.6.3 | Type-safe development |
| pnpm | 9+ | Fast package manager, monorepo support |

**Why TypeScript 5.6:**
- Strict mode enabled by default
- Modern ES modules support
- Best-in-class IDE integration
- Type-safe Prisma client generation

### Backend Framework

| Package | Version | Purpose |
|---------|---------|---------|
| express | ^4.21.1 | HTTP server framework |
| express-async-errors | ^3.1.1 | Automatic async error handling |
| express-session | ^1.18.1 | Session middleware |
| cookie-parser | ^1.4.7 | Cookie parsing |
| cors | ^2.8.5 | Cross-origin resource sharing |
| express-rate-limit | ^8.2.1 | Request rate limiting |
| zod | ^3.23.8 | Runtime input validation |

**Why Express:**
- Mature, stable ecosystem (13+ years)
- Extensive middleware library
- Excellent TypeScript support
- Simple, unopinionated design

### Frontend Framework

| Package | Version | Purpose |
|---------|---------|---------|
| react | ^18.3.1 | UI library |
| react-dom | ^18.3.1 | React DOM renderer |
| react-router-dom | ^7.1.1 | Client-side routing |
| vite | ^6.0.6 | Build tool & dev server |
| @tanstack/react-query | ^5.67.2 | Server state management |
| zustand | ^5.0.2 | Client state management |

**Why React 18:**
- Concurrent rendering features
- Automatic batching
- Mature ecosystem
- Excellent TypeScript support

**Why Vite:**
- Lightning-fast HMR (Hot Module Replacement)
- Native ES modules
- Optimized production builds
- Built-in TypeScript support

### Database & ORM

| Package | Version | Purpose |
|---------|---------|---------|
| @prisma/client | ^7.4.1 | Type-safe database client |
| prisma | ^7.4.1 | Database toolkit & migrations |
| postgresql | 16+ | Relational database |
| pg | ^8.16.3 | PostgreSQL driver |

**Why Prisma:**
- Type-safe queries (zero runtime errors)
- Automatic migration generation
- Excellent developer experience
- Single schema source of truth
- Built-in connection pooling

**Why PostgreSQL 16:**
- ACID transactions
- Row-level locking (execution locks)
- Composite indexes for performance
- JSON support (metadata)
- Full-text search (future feature)

### Queue & Cache

| Package | Version | Purpose |
|---------|---------|---------|
| bullmq | ^5.35.0 | Reliable job queue (Redis-based) |
| ioredis | ^5.4.2 | Redis client |
| redis | 7+ | In-memory data store |

**Why BullMQ:**
- Redis-backed reliability
- Automatic retries with backoff
- Job prioritization
- Distributed processing
- Pause/resume queues
- Event-driven architecture

**Why Redis:**
- Sub-millisecond latency
- Pub/sub for real-time events
- Atomic operations (circuit breaker state)
- Built-in persistence (AOF)
- Cluster support for scaling

### Storage (S3-Compatible)

| Package | Version | Purpose |
|---------|---------|---------|
| @aws-sdk/client-s3 | ^3.693.0 | S3-compatible storage client |
| @aws-sdk/s3-request-presigner | ^3.693.0 | Presigned URL generation |
| sharp | ^0.34.5 | Image processing |

**Supported Backends (v0.1.0-alpha.3+):**
- **Cloudflare R2** (production default) - No egress fees
- **AWS S3** - Standard S3 service
- **MinIO** - Self-hosted S3-compatible

**Why S3-Compatible:**
- Industry standard API
- Multiple vendor options
- Presigned URLs for secure uploads
- CDN integration (R2 Public URL)

## UI Component Libraries

| Package | Version | Purpose |
|---------|---------|---------|
| @radix-ui/react-* | Various | Accessible UI primitives |
| tailwindcss | ^3.4.17 | Utility-first CSS |
| clsx | ^2.1.1 | Conditional classNames |
| lucide-react | ^0.468.0 | Icon library |
| @dnd-kit/core | ^7.0.0 | Drag-and-drop |
| @fullcalendar/react | ^6.1.16 | Calendar views |
| @tanstack/react-table | ^8.25.1 | Data tables |
| recharts | ^2.15.0 | Charts & graphs |

**Why shadcn/ui (Radix + Tailwind):**
- Copy-paste components (no npm package)
- Full customization control
- Accessible by default (Radix UI)
- Consistent design system
- Tailwind integration

## Testing

| Package | Version | Purpose |
|---------|---------|---------|
| vitest | ^4.0.16 | Fast unit test runner |
| @vitest/ui | ^4.0.16 | Visual test UI |
| @vitest/coverage-v8 | ^4.0.16 | Code coverage (V8 engine) |
| @faker-js/faker | ^10.1.0 | Test data generation |
| ioredis-mock | ^8.13.1 | Mock Redis client |
| vitest-mock-extended | ^3.1.0 | Enhanced mocking utilities |

**Why Vitest:**
- Vite-powered (same config as dev/build)
- Extremely fast (concurrent tests)
- Jest-compatible API
- Native ES modules support
- Built-in coverage (v8)
- Watch mode with HMR

**Current Coverage (v0.1.0-alpha.2+):**
- Frontend: ~30% (baseline)
- Backend: Minimal
- Publisher: Minimal
- **Target:** 80% for critical paths

## Development Tools

| Package | Version | Purpose |
|---------|---------|---------|
| eslint | ^9.39.1 | JavaScript/TypeScript linter |
| prettier | ^3.7.4 | Code formatter |
| tsx | ^4.19.2 | TypeScript execution (dev) |
| dotenv | ^16.4.5 | Environment variable loading |

**ESLint Config:** Flat config (modern), TypeScript-first
**Prettier Config:** Single quotes, semi-colons, 100 chars

## Deployment

| Technology | Purpose |
|------------|---------|
| Docker | Containerization |
| Docker Compose | Multi-container orchestration |
| GitHub Actions | CI/CD pipeline |
| GitHub Container Registry (GHCR) | Docker image registry |

**Docker Images (v0.1.0-alpha.2+):**
- `ghcr.io/isekai-sh/isekai-core/backend:latest`
- `ghcr.io/isekai-sh/isekai-core/frontend:latest`
- `ghcr.io/isekai-sh/isekai-core/publisher:latest`

**Tags:**
- `latest` - Most recent build
- `v0.1.0-alpha.5` - Version tags
- `sha-{git-sha}` - Commit-specific builds

## Security & Encryption

| Package | Version | Purpose |
|---------|---------|---------|
| crypto (Node.js built-in) | - | AES-256-GCM encryption |
| bcrypt (via Prisma) | - | API key hashing |

**Encryption Algorithm:** AES-256-GCM (authenticated encryption)
**Hash Algorithm:** bcrypt with salt rounds = 10

## Session Storage

| Package | Version | Purpose |
|---------|---------|---------|
| connect-redis | ^7.1.1 | Redis session store |
| connect-pg-simple | ^10.0.0 | PostgreSQL session store |

**Auto-Detection (v0.1.0-alpha.3+):**
- If `REDIS_URL` set → Use Redis (preferred)
- If not → Fall back to PostgreSQL

## External APIs

| Service | Purpose | Authentication |
|---------|---------|----------------|
| DeviantArt API | Publishing, OAuth | OAuth 2.0 Bearer tokens |
| Resend (optional) | Email notifications | API key |

**DeviantArt SDK:** Custom implementation (no official Node.js SDK)

## License Compatibility

**Project License:** AGPL-3.0

### Compatible Licenses (✅ Safe to use)
- MIT
- Apache 2.0
- BSD (2-clause, 3-clause)
- ISC
- CC0 (Public Domain)

### Incompatible Licenses (❌ Avoid)
- Proprietary/Commercial licenses without AGPL exception
- GPL without linking exception (use AGPL instead)

**All dependencies checked:** ✅ All are MIT, Apache 2.0, or BSD

## Monorepo Structure

```
isekai-core/
├── packages/shared/           # @isekai/shared
│   └── package.json           # Prisma, crypto utils
├── apps/isekai-backend/
│   └── package.json           # Express, BullMQ, AWS SDK
├── apps/isekai-frontend/
│   └── package.json           # React, Vite, TanStack Query
└── apps/isekai-publisher/
    └── package.json           # BullMQ workers, node-cron
```

**Workspace Protocol:** `workspace:*` for internal dependencies

## Version Pinning Strategy

- **Exact versions:** Critical dependencies (Prisma, TypeScript)
- **Caret (^):** Most dependencies (patch + minor updates)
- **Dev dependencies:** More flexible (latest features)

**Lockfile:** `pnpm-lock.yaml` (committed to git)

## Dependency Updates

**Process:**
1. Check CHANGELOG for breaking changes
2. Update in development first
3. Run full test suite
4. Test manually in all apps
5. Update lockfile: `pnpm install`
6. Commit lockfile with dependency update

**Automation:** Dependabot disabled (manual updates preferred for stability)

## Performance Optimizations

### Production Build

**Vite optimizations (frontend):**
- Tree-shaking (removes unused code)
- Code splitting (lazy-loaded routes)
- Minification (terser)
- CSS extraction

**TypeScript compilation (backend/publisher):**
- Target: ES2022
- Module: ES2022
- Source maps: Separate files

### Bundle Sizes (target)

- **Frontend JS:** < 500KB gzipped
- **Backend:** N/A (server-side)
- **Vendor chunks:** Split by route

## Platform Requirements

### Minimum System Requirements

**Development:**
- CPU: 4 cores
- RAM: 8GB
- Disk: 10GB free space
- OS: macOS, Linux, Windows (WSL2)

**Production:**
- CPU: 2 cores (backend), 4 cores (publisher)
- RAM: 2GB (backend), 4GB (publisher)
- PostgreSQL: 2GB RAM minimum
- Redis: 512MB RAM minimum

### Database Connections

**Connection Pooling (Prisma):**
- Backend: 10 connections (default)
- Publisher: 10 connections (default)
- **Total:** 20 connections to PostgreSQL

Adjust via `DATABASE_URL`:
```
postgresql://user:pass@host/db?connection_limit=20
```

## Deprecated Dependencies

**Removed in v0.1.0-alpha.3:**
- None currently

**Planned Removals:**
- None

## Future Additions

**Planned (not yet added):**
- WebSocket library (for real-time updates)
- Prometheus client (metrics export)
- OpenTelemetry (distributed tracing)
- S3 multipart upload (for files > 5GB)

## Adding New Dependencies

**Checklist:**
1. Check license compatibility (AGPL-3.0)
2. Verify actively maintained (commits in last 6 months)
3. Check security advisories (npm audit)
4. Evaluate bundle size impact (frontend only)
5. Consider alternatives (prefer minimal dependencies)
6. Add to this document
7. Update `.context/ai-rules.md` if constraints apply

**Example:**
```bash
# Add to specific app
pnpm --filter isekai-backend add package-name

# Add to shared package
pnpm --filter @isekai/shared add package-name

# Add dev dependency (root)
pnpm add -D -w package-name
```

## Related Files

- `.context/architecture/overview.md` - System architecture
- `.context/architecture/patterns.md` - Design patterns using these dependencies
- `.context/ai-rules.md` - Dependency-related constraints
- `package.json` - Root package manifest
- `pnpm-workspace.yaml` - Monorepo configuration
