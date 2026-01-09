# Technical Debt Registry

**Purpose:** Track known issues, technical debt, and future improvements
**Last Updated:** 2026-01-05 (v0.1.0-alpha.5)

---

## Critical Debt (Must Fix Before v1.0)

### Testing Coverage

**Issue:** Test coverage ~30% baseline, needs improvement for production.

**Impact:** High risk of regressions, bugs in untested code paths.

**Plan:**

- Increase coverage to 60% for v1.0
- Focus on critical paths: auth, publishing, execution locks
- Add integration tests for API routes
- Add E2E tests for key workflows

**Effort:** 2-3 weeks

---

### Linting Warnings

**Issue:** ~100+ linting warnings throughout codebase.

**Impact:** Code quality inconsistency, potential bugs.

**Plan:**

- Fix all `@typescript-eslint/no-explicit-any` warnings
- Fix unused variable warnings
- Enable `strict` mode in all packages
- Add pre-commit hook to prevent new warnings

**Effort:** 1 week

---

### Migration System

**Issue:** Using `prisma push` instead of migrations for schema changes.

**Impact:** No migration history, difficult to deploy to production safely.

**Plan:**

- Switch to `prisma migrate dev` for local development
- Generate migrations for all existing schema changes
- Document migration workflow in `.context/database/migrations.md` (already done)
- Add migration validation to CI

**Effort:** 3-5 days

**Blocker:** Need to stabilize schema first (currently changing frequently).

---

## High Priority Debt

### Browser Automation for Sales Queue

**Issue:** Sale queue processing requires browser automation (Puppeteer/Playwright).

**Impact:** Users must manually set prices on DeviantArt (defeats purpose of sales queue).

**Plan:**

- Implement Puppeteer worker
- Handle DeviantArt login/2FA
- Automate price setting workflow
- Take screenshot proof
- Handle errors gracefully

**Effort:** 2-3 weeks

**Complexity:** High (DeviantArt UI scraping, fragile)

---

### Token Refresh Edge Cases

**Issue:** Token refresh can fail if user changes password, revokes access, or DeviantArt is down.

**Impact:** Posts fail to publish, users must manually re-login.

**Plan:**

- Add retry logic with exponential backoff
- Send email notifications on repeated failures
- Provide clear UI for re-authentication
- Add token health dashboard

**Effort:** 1 week

---

### Error Handling Consistency

**Issue:** Error messages not always user-friendly, some errors logged but not surfaced.

**Impact:** Poor UX, difficult for users to debug issues.

**Plan:**

- Create error message catalog (`.context/errors.md` - done)
- Standardize error response format
- Add user-facing error messages
- Improve error logging (structured logs)

**Effort:** 1 week

---

## Medium Priority Debt

### Frontend State Management

**Issue:** Mix of TanStack Query and local state, some inconsistency.

**Impact:** Potential state synchronization bugs, cache invalidation issues.

**Plan:**

- Standardize on TanStack Query for server state
- Use Zustand only for UI state
- Document state management patterns
- Refactor inconsistent usage

**Effort:** 1-2 weeks

---

### API Documentation

**Issue:** No OpenAPI/Swagger spec, only `.context/api/endpoints.md`.

**Impact:** Harder for third-party integrations, no auto-generated clients.

**Plan:**

- Generate OpenAPI spec from routes
- Add Swagger UI endpoint
- Auto-generate TypeScript client
- Keep `.context/` docs in sync

**Effort:** 1 week

---

### Performance Optimization

**Issue:** Some database queries not optimized (N+1 queries in places).

**Impact:** Slow page loads, increased database load.

**Plan:**

- Profile slow endpoints
- Add missing indexes
- Optimize Prisma queries with `include` and `select`
- Add query result caching

**Effort:** 1 week

---

### Docker Image Size

**Issue:** Docker images ~500MB (could be smaller).

**Impact:** Slower deployments, higher storage costs.

**Plan:**

- Use Alpine base images
- Multi-stage builds (already done, can improve)
- Remove dev dependencies from production image
- Optimize layer caching

**Effort:** 2-3 days

---

## Low Priority Debt

### Notes Management System

**Issue:** Database models exist (`NoteFolder`, `NoteLabel`) but API/UI not implemented.

**Impact:** Incomplete feature, confusing for users who see partial UI.

**Plan:**

- Complete notes API routes
- Build notes UI
- Add note templates
- Document feature

**Effort:** 2-3 weeks (full feature)

**Alternative:** Remove models if not prioritized for v1.0.

---

### ComfyUI Integration Improvements

**Issue:** Basic integration exists but limited features.

**Impact:** Limited workflow automation for AI artists.

**Plan:**

- Add workflow template support
- Improve error handling
- Add batch processing
- Document integration patterns

**Effort:** 1-2 weeks

---

### Mobile Responsiveness

**Issue:** UI optimized for desktop, mobile experience subpar.

**Impact:** Poor UX on mobile devices (but desktop is primary use case).

**Plan:**

- Audit mobile breakpoints
- Improve navigation on small screens
- Test on real devices
- Add mobile-specific components

**Effort:** 2-3 weeks

---

## Known Bugs

### Publisher Worker Stalling

**Severity:** Medium
**Frequency:** Rare (< 1% of jobs)
**Impact:** Jobs stuck in "uploading" status

**Workaround:** Stuck job recovery runs every 5 minutes, releases locks.

**Fix:** Improve job timeout detection, add better error handling in publisher core.

---

### Cache Invalidation Edge Cases

**Severity:** Low
**Frequency:** Occasional
**Impact:** Stale data shown after updates

**Workaround:** Users can manually clear cache (`/api/cache/clear`).

**Fix:** Add granular cache invalidation, subscribe to database events.

---

### Session Expiration During Upload

**Severity:** Low
**Frequency:** Rare (long idle during large file upload)
**Impact:** Upload fails with 401 error

**Workaround:** Refresh page and retry upload.

**Fix:** Add session renewal during upload, or use API key for uploads.

---

## Deprecated Features

### None (v0.1.0-alpha.5)

All features currently active.

**Future Deprecations:**

- Direct SQL usage (if any found) → Prisma ORM
- `prisma push` → `prisma migrate` (planned)

---

## Resolved Debt

### ~~ORM Migration (Drizzle → Prisma)~~

**Resolved:** v0.1.0-alpha.2
**Impact:** Better type safety, easier migrations, better developer experience.

---

### ~~Storage Abstraction~~

**Resolved:** v0.1.0-alpha.3
**Impact:** Support for multiple storage providers (R2, S3, MinIO, etc.).

---

### ~~Session Store Fallback~~

**Resolved:** v0.1.0-alpha.3
**Impact:** PostgreSQL fallback if Redis unavailable, improved reliability.

---

## Future Improvements (Post-v1.0)

### Observability

- Add distributed tracing (OpenTelemetry)
- Improve metrics collection
- Add performance monitoring
- Error tracking (Sentry integration)

### Scalability

- Horizontal scaling for publisher workers
- Database read replicas
- CDN for static assets
- Rate limiting per user/tier

### Features

- Collaborative workflows (team features)
- Advanced analytics
- Webhook system for third-party integrations
- Plugin system for extensibility

---

## Related Documentation

- `.context/changelog.md` - Version history
- `.context/errors.md` - Error handling
- `.context/testing.md` - Test strategy
- `.context/guidelines.md` - Contribution guidelines
