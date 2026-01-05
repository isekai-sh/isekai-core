# Glossary - Domain Terminology

**Purpose:** Define project-specific and DeviantArt terminology
**Last Updated:** 2026-01-05

---

## Core Concepts

### Deviation
A piece of artwork on DeviantArt. In Isekai Core, represents a work to be uploaded/managed. States:
- **review**: Newly uploaded, awaiting user review
- **draft**: Work in progress, not scheduled
- **scheduled**: Queued for future publishing with specific time
- **uploading**: Files being uploaded to DeviantArt
- **publishing**: Metadata being submitted to DeviantArt
- **published**: Successfully posted to DeviantArt
- **failed**: Publishing encountered an error

### Stash
DeviantArt's private storage area for deviations before publishing. Users can save work to Stash first, then publish it later. Isekai supports both direct publishing and stash-only uploads (`stashOnly: true`).

### Gallery
A collection/folder on DeviantArt containing published deviations. Users organize their work into galleries by theme, medium, or series. Identified by `galleryIds` array in deviation metadata.

### Folder
DeviantArt's organizational unit for grouping deviations, galleries, or notes. Can be public or private.

## DeviantArt API Terms

### Category Path
Hierarchical classification for deviations (e.g., `digitalart/paintings/fantasy`). Required for publishing. Determines how the work appears in DeviantArt's browse system.

### Mature Content
Adult/sensitive content requiring age verification. Two levels:
- **moderate**: Mild mature content (artistic nudity, violence)
- **strict**: Explicit mature content (strong sexual themes, graphic violence)

Set via `isMature: true` and `matureLevel: 'moderate' | 'strict'`

### Upload Mode
Determines how multiple files are handled:
- **single**: One file per deviation (default)
- **multiple**: Multiple files combined into one deviation (e.g., comic pages)

### Display Resolution
Maximum resolution shown to viewers (original file stored separately):
- `0`: Original resolution
- `1-8`: Progressively higher resolutions (400px to 1920px)

### AI Generated
Flag indicating artwork created with AI tools. Set `isAiGenerated: true` for compliance with DeviantArt policies. Separate from `noAi` flag which prevents AI training on the work.

### No AI Training
Flag (`noAi: true`) that opts out of AI training datasets. Recommended for artists protecting their style.

### Watermark
Optional overlay added to prevent unauthorized use. Only works when `displayResolution > 0`. Set `addWatermark: true` to enable.

### Allow Free Download
Permission for users to download full-resolution file. Default: `false`. Set `allowFreeDownload: true` to enable.

## Automation System

### Automation / Workflow
A configured rule set that automatically schedules deviations from drafts. Each automation has:
- **Schedule Rules**: When to post (days, times, jitter)
- **Default Values**: Metadata applied to selected deviations
- **Draft Selection Strategy**: How to choose which drafts to schedule

### Schedule Rule
Defines WHEN automation runs:
- **daysOfWeek**: Which days to post (0-6, where 0=Sunday)
- **timeRanges**: Time windows (24-hour format, e.g., `["09:00-12:00", "18:00-21:00"]`)
- **jitterMinutes**: Random delay ±N minutes for natural posting patterns
- **timezone**: User's local timezone for scheduling

Example: Post Mon-Fri between 9am-12pm with ±30min jitter.

### Default Values
Metadata template applied to auto-scheduled deviations:
- **tags**: Array of tags to add
- **description**: Default description text
- **categoryPath**: Category for the work
- **galleryIds**: Which galleries to add to
- **isMature**: Mature content flag
- **matureLevel**: Mature content severity
- **isAiGenerated**: AI artwork flag
- **pricePresetId**: Pricing for exclusives

### Draft Selection Strategy
How automation chooses which drafts to schedule:
- **oldest**: Oldest drafts first (FIFO queue)
- **random**: Random selection from available drafts
- **folder**: Select from specific DeviantArt folder

### Execution Lock
UUID-based optimistic lock preventing concurrent automation executions. Critical for preventing duplicate schedules. Format: `executionLockId: string`, `executionLockedAt: DateTime`, `executionVersion: int`

### Jitter
Random time offset (±N minutes) added to scheduled time to avoid predictable posting patterns and reduce rate limit risk. Stored as `jitterSeconds` on deviation.

## Publisher System

### Publisher Worker
Dedicated Node.js microservice separate from API, responsible for:
- Processing deviation publishing queue
- Token refresh maintenance
- R2/S3 cleanup jobs
- Stuck job recovery

### Queue
BullMQ job queue for asynchronous task processing:
- **deviation-publisher**: Main publishing queue
- **token-maintenance**: OAuth token refresh
- **r2-cleanup**: Storage file cleanup

### Circuit Breaker
Rate limit protection mechanism. States:
- **closed**: Normal operation
- **open**: Too many failures, reject requests temporarily
- **half-open**: Testing if service recovered

Thresholds: 3 consecutive 429s → 5-minute cooldown

### Adaptive Rate Limiter
Dynamic delay system that adjusts based on API responses:
- **Base delay**: 3 seconds
- **Success**: Decrease delay by 10%
- **Failure (429)**: Double the delay
- **Jitter**: ±20% randomization
- **Max delay**: 5 minutes

### Token Maintenance
Background job that refreshes OAuth tokens 7 days before expiry. Prevents 90-day token expiration. Sends email warnings at 7 days and 1 day remaining.

### Stuck Job Recovery
Automated recovery process running every 5 minutes:
- Detects jobs stalled > job timeout
- Resets execution locks
- Requeues failed jobs
- Max 2 recovery attempts per job

### Past-Due Recovery
Every 1 minute, finds `scheduled` deviations with `actualPublishAt` in the past and queues them for immediate publishing.

### Lock Cleanup
Every 30 minutes, clears execution locks older than 1 hour to prevent permanent deadlocks.

## Storage & Files

### Storage Key
Unique identifier for file in S3-compatible storage:
```
deviations/{deviationId}/{filename}
```

With multi-tenant support (SaaS):
```
{S3_PATH_PREFIX}/deviations/{deviationId}/{filename}
```

### Storage Service
Abstracted interface supporting:
- **Cloudflare R2**: Production default
- **AWS S3**: Compatible storage
- **MinIO**: Self-hosted S3-compatible

### Presigned URL
Temporary URL for secure file access without exposing credentials. Generated for uploads (PUT) and downloads (GET). Expires after configured TTL (default: 1 hour).

### R2 Public URL
Base URL for accessing uploaded files via CDN. Format: `https://pub-xxx.r2.dev` (or custom domain).

## Sales & Exclusives

### Price Preset
Reusable pricing template for exclusive deviations:
- **price**: Fixed price in cents (e.g., 5000 = $50.00)
- **minPrice / maxPrice**: Random price range
- **currency**: USD, EUR, etc.
- **isDefault**: Auto-apply to new exclusives

### Sale Queue
Workflow for batch-processing exclusive content pricing:
- **pending**: Awaiting processing
- **processing**: Currently being priced
- **completed**: Successfully priced
- **failed**: Error during processing
- **skipped**: Intentionally skipped

### Exclusives
Premium content available only to paying supporters. Set prices via sale queue and price presets.

## Instance & Multi-Tenancy (SaaS)

### Instance
Single deployment of Isekai Core. Can run standalone or as part of SaaS platform (Isekai Run).

### Instance User
User account within an instance (SaaS mode). Links DeviantArt identity to instance permissions. Roles:
- **admin**: Full instance access
- **member**: Standard user access

### Instance Settings
Runtime-configurable settings stored in database (singleton row):
- **teamInvitesEnabled**: Allow multiple users per instance
- Overrides environment variable defaults

### S3_PATH_PREFIX
Tenant-specific prefix for multi-tenant storage isolation:
```
tenant-abc123/deviations/{deviationId}/{filename}
```

Prevents file collisions in shared S3 buckets.

## Caching & Performance

### Gallery Cache
Cached DeviantArt gallery data to reduce API calls. TTL: 5 minutes, stale: 2 hours.

### Browse Cache
Cached DeviantArt browse results (popular, newest, daily deviations). Same TTL as gallery cache.

### Stale-While-Revalidate
Caching pattern: Serve stale data while fetching fresh data in background. Improves perceived performance.

## Authentication

### OAuth 2.0
DeviantArt authentication protocol. Isekai uses authorization code flow with refresh tokens.

### Access Token
Short-lived token (1 hour) for API requests. Stored encrypted in database.

### Refresh Token
Long-lived token (90 days) for obtaining new access tokens. **Critical:** Must be refreshed before expiry.

### API Key
Alternative authentication for external integrations. Format: `isk_live_{random}` or `isk_test_{random}`. Stored as bcrypt hash in database.

### Session
User authentication state stored in Redis (or PostgreSQL). Contains `userId`, `deviantartId`. Expires after 30 days of inactivity.

## Technical Terms

### Monorepo
Single repository containing multiple applications (`apps/`) and shared packages (`packages/`). Managed with pnpm workspaces.

### Prisma
Database ORM (Object-Relational Mapping) tool. Single schema file (`schema.prisma`) generates type-safe database client.

### BullMQ
Redis-based job queue library. Provides reliability, retries, and distributed processing.

### Vitest
Fast unit test framework. Used for both backend and frontend testing.

### TanStack Query
React library for server state management. Handles data fetching, caching, and synchronization.

### Zustand
Lightweight global state management for React. Used for client-side application state.

### shadcn/ui
Collection of re-usable React components built with Radix UI and Tailwind CSS.

## Abbreviations

- **DA**: DeviantArt
- **OAuth**: Open Authorization
- **API**: Application Programming Interface
- **ORM**: Object-Relational Mapping
- **CRUD**: Create, Read, Update, Delete
- **TTL**: Time To Live
- **UUID**: Universally Unique Identifier
- **AGPL**: Affero General Public License (v3.0)
- **SPA**: Single Page Application
- **REST**: Representational State Transfer

## Status Lifecycle

**Deviation States:**
```
review → draft → scheduled → uploading → publishing → published
                                           ↓
                                        failed
```

**Sale Queue States:**
```
pending → processing → completed
            ↓
          failed / skipped
```

## Related Files

- See `.context/architecture/overview.md` for system architecture
- See `.context/database/models.md` for detailed model descriptions
- See `.context/features/automation.md` for automation workflow details
- See `.context/api/endpoints.md` for API terminology
