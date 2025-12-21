# Isekai Core

[![CI](https://github.com/isekai-sh/isekai-core/actions/workflows/ci.yml/badge.svg)](https://github.com/isekai-sh/isekai-core/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/isekai-sh/isekai-core/graph/badge.svg)](https://codecov.io/gh/isekai-sh/isekai-core)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Node](https://img.shields.io/badge/node-20.x-green.svg)](https://nodejs.org)
[![pnpm](https://img.shields.io/badge/pnpm-9.x-orange.svg)](https://pnpm.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)

> Open source DeviantArt posting management platform with scheduling, draft management, ComfyUI integration, and robust publishing automation.

![Isekai](/screenshots/isekai-browse.png)

Isekai is a modern web application that helps artists manage their DeviantArt posting workflow with features like scheduled publishing, draft organization, and AI image generation integration through ComfyUI.

## Features

- **DeviantArt Integration**: OAuth authentication and seamless posting
- **Scheduled Publishing**: Plan and automate your DeviantArt posts
- **Draft Management**: Organize and edit your artwork before publishing
- **ComfyUI Integration**: Generate and manage AI artwork -- check out [Isekai Comfy Node](https://github.com/isekai-sh/isekai-comfy-node)
- **Cloud Storage**: Cloudflare R2 for reliable file storage

## Tech Stack

### Frontend (React App)

- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite 6
- **Styling**: Tailwind CSS 3
- **Routing**: React Router
- **State Management**: React Query (TanStack Query)

### Backend (API)

- **Runtime**: Node.js 20+
- **Framework**: Express.js
- **Language**: TypeScript
- **Database**: PostgreSQL 16 with Prisma ORM
- **Cache/Sessions**: Redis 7
- **Authentication**: OAuth 2.0 (DeviantArt)
- **Storage**: Cloudflare R2 (S3-compatible)
- **Job Queue**: BullMQ

### Publisher Worker (Microservice)

- **Runtime**: Node.js 20+
- **Architecture**: Dedicated background job processor
- **Queue**: BullMQ with Redis
- **Features**: Fault isolation, independent scaling, graceful shutdown
- **Monitoring**: Health check endpoints (/health, /ready, /metrics)

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker & Docker Compose
- PostgreSQL 16 (or use Docker)
- Redis 7 (or use Docker)
- Prisma CLI (installed via pnpm)
- DeviantArt Application -- register your own app at https://www.deviantart.com/developers/apps
- Cloudflare R2 credentials, free tier is enough for testing

## Quick Start

### Running Docker with pre-built image

```bash
# Clone the repository
git clone https://github.com/isekai-sh/isekai-core.git
cd isekai-core

# Copy and edit your environment variables
cp .env.example .env

# Start the Docker container
docker compose up --build
```

The application will be available at:

- Frontend (React): http://localhost:3000
- Backend (API): http://localhost:4000
- Publisher (Health): http://localhost:8000

### Building Docker image locally

```bash
# Development: build locally and run
docker-compose -f docker-compose.local.yml up --build
```

## Project Structure

```
isekai/
├── apps/
│   ├── isekai-backend/     # Express backend API (port 4000)
│   ├── isekai-frontend/    # React frontend application (port 3000)
│   └── isekai-publisher/   # DeviantArt publishing worker (microservice)
├── packages/
│   └── shared/             # Shared types and database schema
├── docker-compose.yml      # Local development services
└── pnpm-workspace.yaml     # Monorepo configuration
```

## Development

```bash
# Install dependencies
pnpm install

# Start database and Redis with Docker
docker-compose up -d postgres redis

# Set up individual environment variables
cp apps/isekai-backend/.env.example apps/isekai-backend/.env
cp apps/isekai-frontend/.env.example apps/isekai-frontend/.env
cp apps/isekai-publisher/.env.example apps/isekai-publisher/.env
cp packages/shared/.env.example packages/shared/.env

# Run database migrations
pnpm db:migrate

# Start development servers
pnpm dev
```

### Available Scripts

```bash
# Development
pnpm dev              # Start all apps in parallel
pnpm dev:frontend     # Start frontend only
pnpm dev:backend      # Start backend only
pnpm dev:publisher    # Start publisher worker only
pnpm dev:services     # Start API + Publisher together

# Building
pnpm build            # Build all apps
pnpm build:frontend   # Build frontend
pnpm build:backend    # Build backend
pnpm build:publisher  # Build publisher worker

# Database
pnpm db:generate      # Generate database migrations
pnpm db:migrate       # Apply database migrations
pnpm db:studio        # Open Prisma Studio GUI

# Quality
pnpm lint             # Lint all apps
pnpm clean            # Clean build artifacts
```

### Docker Services

```bash
# Start all services
docker-compose up -d

# Start specific services
docker-compose up -d postgres redis

# View logs
docker-compose logs -f

# Stop all services
docker-compose down

# Stop and remove volumes
docker-compose down -v
```

## Documentation

Complete documentation can be accessed at [Isekai Official Website](https://isekai.sh)

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Workflow

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests and linting
5. Commit your changes (`git commit -m 'feat: add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## Support

Open an issue to report problems and questions.
