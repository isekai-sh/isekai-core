# Isekai Core - Substrate

**Purpose:** Entry point for AI-optimized project documentation
**Last Updated:** 2026-01-05
**Status:** Alpha (v0.1.0-alpha.1)

---

## Overview

This `.context/` directory implements the [Substrate Methodology](https://github.com/andrefigueira/.context) - a documentation-as-code framework for AI-assisted development.

Isekai Core is an **open-source DeviantArt automation platform** (AGPL-3.0) that helps artists manage their DeviantArt posting workflow with scheduled publishing, draft organization, ComfyUI integration, and robust automation features.

**Key Capabilities:**
- DeviantArt OAuth authentication and seamless posting
- Scheduled publishing with automation workflows
- Draft management and content organization
- ComfyUI integration for AI artwork generation (via [Isekai Comfy Node](https://github.com/isekai-sh/isekai-comfy-node))
- Cloud storage with Cloudflare R2
- Gallery synchronization and content browsing
- Exclusives/sales management with price presets

## Quick Navigation

### For AI Assistants
| Start Here | Purpose |
|------------|---------|
| `ai-rules.md` | Hard constraints, code style, commit format |
| `boundaries.md` | What to modify and what to avoid |
| `anti-patterns.md` | Common mistakes to prevent |
| `glossary.md` | DeviantArt and project terminology |

### For Architecture
| File | Purpose |
|------|---------|
| `architecture/overview.md` | 3-tier system design (API + SPA + Worker) |
| `architecture/patterns.md` | Execution locks, circuit breaker, rate limiter |
| `architecture/dependencies.md` | Tech stack and approved packages |

### For Implementation
| Domain | Location |
|--------|----------|
| API | `api/endpoints.md` (36 routes), `api/headers.md`, `api/responses.md` |
| Database | `database/schema.md` (20+ models), `database/models.md`, `database/migrations.md` |
| Auth | `auth/overview.md` (OAuth flow), `auth/oauth.md`, `auth/security.md` |
| Workers | `workers/publisher.md` (microservice), `workers/background-jobs.md` (5 jobs) |
| Features | `features/automation.md`, `features/publishing.md`, `features/browse.md`, `features/sales-queue.md` |
| UI | `ui/components.md` (React patterns), `ui/state-management.md` (Zustand/TanStack) |

### For Operations
| File | Purpose |
|------|---------|
| `env.md` | Environment variables reference |
| `errors.md` | Error codes and handling patterns |
| `testing.md` | Vitest strategy and patterns |
| `workflows.md` | Development workflow |
| `guidelines.md` | PR process and code review |
| `debt.md` | Technical debt registry |

### For Decisions
| Location | Purpose |
|----------|---------|
| `decisions/` | 6 Architecture Decision Records (ADRs) |
| `prompts/` | 8 pre-built AI task templates |
| `changelog.md` | Version history |

## Entry Points by Tool

| Tool | Entry Point |
|------|-------------|
| Claude Code | `CLAUDE.md` (auto-loaded) |
| Other AI | `CLAUDE.md` or `.context/substrate.md` |
| Human Dev | `README.md` → `.context/substrate.md` |

## Project Status

- **Version**: 0.1.0-alpha.1 (Released December 21, 2024)
- **License**: AGPL-3.0 (Open Source)
- **Architecture**: Production-ready monorepo with microservice publisher
- **Stability**: Alpha - lacks comprehensive testing, many linting warnings

## Monorepo Structure

```
isekai-core/
├── .context/              # Substrate documentation (this directory)
├── apps/
│   ├── isekai-backend/    # Express API (port 4000)
│   ├── isekai-frontend/   # React SPA (port 3000)
│   └── isekai-publisher/  # Background worker microservice (port 8000)
├── packages/
│   └── shared/            # Prisma schema, shared types, crypto utils
├── docker-compose.yml     # Local PostgreSQL + Redis
└── pnpm-workspace.yaml    # Monorepo configuration
```

## Core Architectural Decisions

1. **Microservice Publisher** - Dedicated worker isolated from API for fault tolerance (see `decisions/001-microservice-publisher.md`)
2. **Execution Locks** - UUID-based optimistic locking prevents duplicate publishes (see `decisions/002-execution-locks.md`)
3. **Circuit Breaker** - Rate limit protection with Redis persistence (see `decisions/003-circuit-breaker.md`)
4. **AGPL-3.0 License** - Open-source community project (see `decisions/006-agpl-license.md`)

## Key Features

### Automation System (Most Complex)
The automation workflow system (`features/automation.md`) enables intelligent scheduling with:
- Schedule rules (day of week, time ranges, jitter)
- Default values (tags, description, mature level, etc.)
- Draft selection strategies (oldest first, random, specific folder)
- Execution locking to prevent conflicts
- Sale queue integration for exclusives

### Publishing Flow
Deviations move through lifecycle states: `review` → `draft` → `scheduled` → `uploading` → `publishing` → `published` / `failed`

### Reliability Features
- Adaptive rate limiter with exponential backoff
- Circuit breaker for API failures
- Stuck job recovery (every 5 minutes)
- Past-due recovery (every minute)
- Lock cleanup (every 30 minutes)
- Token maintenance (refresh 7 days before expiry)

## Technology Stack

**Frontend:** React 18, TypeScript, Vite 6, Tailwind CSS, shadcn/ui, TanStack Query, React Router 7, Zustand
**Backend:** Node.js 20+, Express, TypeScript, Prisma ORM 7
**Database:** PostgreSQL 16
**Cache/Queue:** Redis 7, BullMQ 5
**Storage:** Cloudflare R2 (S3-compatible)
**Testing:** Vitest 4
**Monorepo:** pnpm workspaces

## Related Projects

- **Isekai Run** - SaaS platform built on top of Isekai Core (commercial, separate repo)
- **Isekai Comfy Node** - ComfyUI custom node for integration
- **DeviantArt API** - External dependency for publishing

## Getting Started

See `CLAUDE.md` for quick start commands and `workflows.md` for detailed development workflow.

## Documentation Philosophy

This `.context/` directory serves as the **single source of truth** for:
- Development constraints and patterns
- Architectural decisions and rationale
- API and database schemas
- Domain terminology and concepts
- Common tasks and workflows

Documentation is versioned with code, preventing drift and enabling AI tools to provide accurate assistance.
