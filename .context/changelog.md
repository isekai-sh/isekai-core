# Changelog

**Purpose:** Version history and release notes
**Format:** [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
**Versioning:** [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

---

## [0.1.0-alpha.5] - 2026-01-05

### Added

- Substrate Methodology documentation (`.context/` directory with 30+ files)
- Comprehensive API documentation
- Complete authentication flow documentation
- Environment variables reference
- Error codes catalog

### Changed

- Improved documentation structure for AI-assisted development

---

## [0.1.0-alpha.4] - 2025-12-30

### Added

- Session store auto-detection (Redis → PostgreSQL fallback)
- Token maintenance email warnings (7 days, 1 day before expiry)
- Improved error handling for expired tokens

### Fixed

- Session persistence issues in production
- Token refresh edge cases

---

## [0.1.0-alpha.3] - 2025-12-28

### Added

- **Storage Abstraction Layer:** Support for multiple S3-compatible providers
  - Cloudflare R2 (recommended for production)
  - AWS S3
  - MinIO (default for local development)
  - DigitalOcean Spaces
  - Backblaze B2
- **Multi-Tenant SaaS Features:**
  - `InstanceUser` model for team management
  - `InstanceSettings` model for runtime configuration
  - `S3_PATH_PREFIX` for storage isolation
  - First user automatically becomes admin
  - Team invite system

### Changed

- MinIO now default storage provider (easier local setup)
- Storage service abstracted behind interface
- Session storage auto-detection improved

---

## [0.1.0-alpha.2] - 2025-12-22

### Added

- **Docker Support:**
  - Pre-built Docker images on GitHub Container Registry
  - `docker-compose.yml` for easy local setup
  - Multi-stage builds for optimized images
- **Testing Infrastructure:**
  - Vitest test framework
  - 30% baseline coverage requirement
  - Unit and integration tests
  - GitHub Actions CI with test coverage

### Changed

- Migrated from Drizzle to Prisma ORM
- Improved build process with Docker caching

### Known Issues

- Low coverage in frontend tests
- Linting warnings not addressed

---

## [0.1.0-alpha.1] - 2025-12-21

**Initial alpha release of Isekai Core - DeviantArt automation platform.**

### Features

#### Authentication & Core

- DeviantArt OAuth 2.0 authentication
- Session-based user management
- API key system for external integrations (ComfyUI)
- AES-256-GCM encryption for tokens

#### Deviation Management

- Draft system for unpublished work
- Scheduled queue with jitter for natural timing
- Published history with activity tracking
- Review system for content curation
- File upload via presigned URLs (R2/S3)
- Upload modes: single file, multiple files

#### Automation System

- **Workflow Automation:**
  - Fixed time rules (e.g., "2pm daily")
  - Fixed interval rules (e.g., "every 4 hours")
  - Daily quota rules (e.g., "max 5 per day")
- **Draft Selection Methods:**
  - Random selection
  - FIFO (oldest first)
  - LIFO (newest first)
- **Default Values:**
  - Auto-apply tags, description, category
  - Mature content settings
  - Gallery assignment
- **Dedicated Publisher Worker:**
  - Microservice architecture
  - Graceful shutdown
  - Health check endpoints

#### Exclusives & Sales

- **Sales Queue:**
  - Batch-process exclusive content pricing
  - Price preset system (fixed or variable pricing)
  - Status tracking (pending, processing, completed, failed)
  - Retry mechanism for failures
- **Price Presets:**
  - Fixed pricing (e.g., $50)
  - Variable pricing (e.g., $30-$100 random)
  - Default preset selection

#### Organization

- Gallery management with drag-and-drop
- Gallery folder synchronization with DeviantArt
- Template system for reusable metadata
- Tag templates, description templates

#### Browse - Inspiration

- **6 Browse Modes:**
  - Home feed (personalized)
  - Daily deviations (staff picks)
  - Following (watch list)
  - Tags (browse by tag)
  - Topics (browse by category)
  - User gallery (specific artist)
- **Features:**
  - Global tag search (⌘/Ctrl + K)
  - Tag autocomplete
  - More Like This recommendations
  - Full deviation details
- **Performance:**
  - Redis caching with request coalescing
  - Stale cache fallback on rate limits (up to 2 hours old)
  - Circuit breaker pattern for rate limit protection

#### Technical Infrastructure

- **Backend:**
  - Express.js REST API
  - PostgreSQL database
  - Redis for caching & sessions
  - Prisma ORM
  - Zod validation
  - BullMQ job queue
- **Frontend:**
  - React 18 with TypeScript
  - TanStack Query (data fetching)
  - React Router 7
  - shadcn/ui components
  - Tailwind CSS
- **Architecture:**
  - 3-tier microservice (API, SPA, Worker)
  - Monorepo with pnpm workspaces
  - Shared package for types & Prisma client

#### Resilience & Reliability

- **Execution Locks:**
  - UUID-based optimistic locking
  - Prevents duplicate publishes
  - Race condition protection
- **Circuit Breaker:**
  - Opens after 3 consecutive 429 errors
  - 5-minute cooldown period
  - Redis-persisted state
- **Adaptive Rate Limiter:**
  - Dynamic backoff (3s to 5min)
  - Exponential increase on failure
  - Exponential decrease on success
  - ±20% jitter
- **Recovery Jobs:**
  - Stuck job recovery (every 5 min, 10min timeout)
  - Past-due recovery (every 1 min, 50 batch size)
  - Lock cleanup (every 30 min, 1hr timeout)
  - Token maintenance (every 6 hours)

#### Security

- OAuth-only authentication (no passwords)
- AES-256-GCM token encryption
- API key bcrypt hashing
- Session hijacking protection
- CSRF protection (SameSite cookies)
- HTTPS enforcement (production)

### Known Issues

- Limited test coverage (working toward 30%)
- Linting warnings throughout codebase
- Chrome extension for exclusive sales not yet developed
- No migration system (using `prisma push` for now)

---

## Versioning Scheme

### Pre-1.0.0 (Current)

- **v0.x.x:** Development versions
- **Breaking changes may occur** between minor versions
- **alpha:** Early development, expect bugs
- **beta:** Feature-complete, stabilizing
- **rc:** Release candidate, final testing

### Post-1.0.0 (Future)

- **Major (x.0.0):** Breaking changes
- **Minor (0.x.0):** New features, backward compatible
- **Patch (0.0.x):** Bug fixes, backward compatible

---

## Release Process

### Alpha Releases

1. Tag version: `git tag v0.1.0-alpha.X`
2. Push tag: `git push origin v0.1.0-alpha.X`
3. GitHub Actions builds Docker images
4. Update this changelog
5. Create GitHub release with notes

### Future Stable Releases (1.0.0+)

1. Create release branch: `release/v1.0.0`
2. Update version in `package.json`
3. Update changelog
4. Create migration guide (if breaking changes)
5. Tag and push
6. Deploy to production
7. Monitor for issues

---

## Migration Guides

### v0.1.0-alpha.2 → v0.1.0-alpha.3

**Breaking Changes:** None

**New Features:**

- Multi-tenant support (optional)
- Storage abstraction (transparent upgrade)

**Action Required:**

- Update `.env` with MinIO settings (or keep existing R2/S3)
- Rebuild Docker images: `docker-compose build`

### v0.1.0-alpha.1 → v0.1.0-alpha.2

**Breaking Changes:** ORM migration (Drizzle → Prisma)

**Action Required:**

1. Backup database
2. Run Prisma migrations: `pnpm prisma migrate deploy`
3. Regenerate client: `pnpm prisma generate`
4. Rebuild: `pnpm build`
5. Test thoroughly

---

## Related Documentation

- `.context/debt.md` - Known issues and technical debt
- `.context/guidelines.md` - Contribution process
- `.context/decisions/` - Architectural decisions
