# Claude Code Guide - Isekai Core

> **All documentation is in `.context/`** following the [Substrate Methodology](https://github.com/andrefigueira/.context). This file is your entry point.

## What is Isekai Core?

An **open-source DeviantArt automation platform** (AGPL-3.0) that helps artists manage their DeviantArt posting workflow with features like scheduled publishing, draft organization, and AI image generation integration through ComfyUI.

**Key Features:**
- DeviantArt OAuth authentication and seamless posting
- Scheduled publishing with automation workflows
- Draft management and organization
- ComfyUI integration for AI artwork generation
- Cloud storage with Cloudflare R2
- Gallery synchronization and browsing

## Quick Reference

### Start Development

```bash
# Clone and install
git clone https://github.com/isekai-sh/isekai-core.git
cd isekai-core
pnpm install

# Start services
docker compose up -d postgres redis

# Set up database
pnpm db:migrate

# Start all apps
pnpm dev
```

### Local URLs

| App | URL |
|-----|-----|
| Frontend (React) | http://localhost:3000 |
| Backend (API) | http://localhost:4000 |
| Publisher (Health) | http://localhost:8000 (port 5000 in container) |

### Common Commands

```bash
# Development
pnpm dev                 # Start all apps
pnpm dev:backend         # API only
pnpm dev:frontend        # Frontend only
pnpm dev:publisher       # Worker only
pnpm dev:services        # API + Publisher

# Database
pnpm db:migrate          # Apply migrations
pnpm db:generate         # Generate migrations
pnpm db:studio           # Open Prisma Studio

# Building
pnpm build               # Build all apps
pnpm lint                # Lint code
pnpm clean               # Clean build artifacts
```

## Documentation Index

**Start here:** `.context/substrate.md`

| Topic | File | What's Inside |
|-------|------|---------------|
| **Rules** | `.context/ai-rules.md` | Code style, commits, patterns |
| **Scope** | `.context/boundaries.md` | What to modify, what to avoid |
| **Architecture** | `.context/architecture/overview.md` | System design, 3-tier architecture |
| **Patterns** | `.context/architecture/patterns.md` | Execution locks, circuit breaker, rate limiter |
| **API** | `.context/api/endpoints.md` | All 36 REST endpoints |
| **Database** | `.context/database/schema.md` | Prisma schema (20+ models) |
| **Auth** | `.context/auth/overview.md` | OAuth flow, sessions, tokens |
| **Workers** | `.context/workers/publisher.md` | Microservice architecture |
| **Automation** | `.context/features/automation.md` | Workflow system (schedule rules, default values) |
| **Publishing** | `.context/features/publishing.md` | Deviation lifecycle |
| **Environment** | `.context/env.md` | All env vars explained |
| **Errors** | `.context/errors.md` | Error codes catalog |
| **Testing** | `.context/testing.md` | Vitest strategy |
| **Decisions** | `.context/decisions/` | Architecture Decision Records |
| **Prompts** | `.context/prompts/` | AI task templates |

## Monorepo Structure

```
isekai-core/
├── .context/              # Substrate documentation
├── apps/
│   ├── isekai-backend/    # Express API (port 4000)
│   ├── isekai-frontend/   # React SPA (port 3000)
│   └── isekai-publisher/  # Background worker microservice (port 8000/5000)
├── packages/
│   └── shared/            # Prisma schema, shared types
├── docker-compose.yml     # Local dev PostgreSQL + Redis
└── pnpm-workspace.yaml    # Monorepo config
```

## Key Principles

1. **Open Source** - AGPL-3.0 licensed, community-driven
2. **Microservice Architecture** - Dedicated publisher for fault isolation
3. **Type Safety** - TypeScript-first with strict mode
4. **Execution Locks** - Prevent duplicate publishes with UUID-based locking
5. **Circuit Breaker** - Rate limit protection for DeviantArt API
6. **Automation-First** - Workflow system for intelligent scheduling
7. **Cloud-Native** - Docker Compose, PostgreSQL, Redis, R2

## Common Tasks

### Add API Endpoint
1. Create handler in `apps/isekai-backend/src/routes/`
2. Add auth middleware (`requireAuth` or `hybridAuth`)
3. Register in `apps/isekai-backend/src/index.ts`
4. See `.context/prompts/add-api-endpoint.md`

### Add Frontend Page
1. Create page in `apps/isekai-frontend/src/pages/`
2. Add route in `apps/isekai-frontend/src/App.tsx`
3. Create TanStack Query hooks if needed
4. See `.context/prompts/add-frontend-page.md`

### Modify Database
1. Edit `packages/shared/prisma/schema.prisma`
2. Run `pnpm db:generate` to generate migration
3. Run `pnpm db:migrate` to apply
4. See `.context/database/migrations.md`

### Add Background Job
1. Create job in `apps/isekai-publisher/src/jobs/`
2. Register in `apps/isekai-publisher/src/index.ts`
3. Use BullMQ patterns
4. See `.context/prompts/add-background-job.md`

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Cannot find @isekai/shared | `pnpm install && pnpm build` from root |
| Database connection fails | Check `docker compose ps` - ensure postgres is healthy |
| Redis connection fails | Check `docker compose ps` - ensure redis is healthy |
| Prisma client out of sync | Run `pnpm db:generate` |
| Port already in use | Kill process: `lsof -ti:3000 \| xargs kill -9` |
| TypeScript errors | Run `pnpm build` to check all apps |

## Development Workflow

1. **Start services**: `docker compose up -d postgres redis`
2. **Apply migrations**: `pnpm db:migrate`
3. **Start dev servers**: `pnpm dev`
4. **Make changes**: Follow `.context/workflows.md`
5. **Commit**: Use Conventional Commits (`.context/ai-rules.md`)
6. **Submit PR**: See `.context/guidelines.md`

## Resources

- [Isekai Official Website](https://isekai.sh)
- [GitHub Repository](https://github.com/isekai-sh/isekai-core)
- [DeviantArt Developer Portal](https://www.deviantart.com/developers)
- [Prisma Docs](https://www.prisma.io/docs)
- [BullMQ Docs](https://docs.bullmq.io)
- [Cloudflare R2 Docs](https://developers.cloudflare.com/r2)
