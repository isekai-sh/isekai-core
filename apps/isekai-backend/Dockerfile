FROM node:20-alpine AS builder

# Build arguments for versioning (optional)
ARG VERSION=dev
ARG BUILD_DATE
ARG VCS_REF

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Copy workspace config and package files
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./

# Copy backend and shared package files
COPY apps/isekai-backend/package.json ./apps/isekai-backend/
COPY packages/shared/package.json ./packages/shared/

# Copy Prisma schema and config from shared package BEFORE install (for postinstall script)
COPY packages/shared/prisma ./packages/shared/prisma
COPY packages/shared/prisma.config.ts ./packages/shared/prisma.config.ts

# Set dummy DATABASE_URL for prisma generate (doesn't actually connect)
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"

# Set NODE_ENV to development in builder stage to ensure devDependencies are installed
# (needed for TypeScript compilation and build tools like tsup)
ENV NODE_ENV=development

# Install all dependencies (this runs postinstall which generates Prisma client)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY apps/isekai-backend ./apps/isekai-backend
COPY packages/shared ./packages/shared

# Re-run install to re-establish workspace links and regenerate Prisma client via postinstall
# This is fast because packages are already cached
RUN pnpm install --frozen-lockfile

# Build shared package first, then backend
RUN pnpm --filter @isekai/shared build && \
    pnpm --filter isekai-backend build

# Production stage
FROM node:20-alpine

# Metadata labels
ARG VERSION=dev
ARG BUILD_DATE
ARG VCS_REF
LABEL org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.title="Isekai Backend" \
      org.opencontainers.image.description="Isekai backend API service" \
      org.opencontainers.image.licenses="AGPL-3.0"

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Copy workspace config and package files
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./

# Copy backend package.json
COPY apps/isekai-backend/package.json ./apps/isekai-backend/

# Copy entire shared package from builder (needed for workspace linking)
COPY --from=builder /app/packages/shared ./packages/shared

# Set dummy DATABASE_URL for prisma generate during install (doesn't actually connect)
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"

# Set NODE_ENV to production for runtime stage
ENV NODE_ENV=production

# Install production dependencies (includes prisma, runs postinstall to generate client)
RUN pnpm install --frozen-lockfile --prod

# Copy built backend artifacts
COPY --from=builder /app/apps/isekai-backend/dist ./apps/isekai-backend/dist

# Copy startup script
COPY apps/isekai-backend/start.sh ./apps/isekai-backend/start.sh

# Make startup script executable
RUN chmod +x ./apps/isekai-backend/start.sh

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Change ownership
RUN chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 4000

WORKDIR /app/apps/isekai-backend

CMD ["./start.sh"]
