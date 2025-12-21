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

# Copy frontend and shared package files
COPY apps/isekai-frontend/package.json ./apps/isekai-frontend/
COPY packages/shared/package.json ./packages/shared/

# Copy Prisma schema and config from shared BEFORE install (for postinstall script)
COPY packages/shared/prisma ./packages/shared/prisma
COPY packages/shared/prisma.config.ts ./packages/shared/prisma.config.ts

# Set dummy DATABASE_URL for prisma generate (doesn't actually connect)
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"

# Set NODE_ENV to development in builder stage to ensure devDependencies are installed
# (needed for TypeScript compilation and build tools like tsup, vite)
ENV NODE_ENV=development

# Install all dependencies (runs postinstall which generates Prisma client)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY apps/isekai-frontend ./apps/isekai-frontend
COPY packages/shared ./packages/shared

# Re-run install to re-establish workspace links and regenerate Prisma client via postinstall
# This is fast because packages are already cached
RUN pnpm install --frozen-lockfile

# Build shared package first, then frontend
# Note: No build-time environment variables needed - config is injected at runtime
RUN pnpm --filter @isekai/shared build && \
    pnpm --filter isekai-frontend build

# Production stage
FROM nginx:alpine

# Metadata labels
ARG VERSION=dev
ARG BUILD_DATE
ARG VCS_REF
LABEL org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.title="Isekai Frontend" \
      org.opencontainers.image.description="Isekai frontend service with runtime configuration" \
      org.opencontainers.image.licenses="AGPL-3.0"

# Copy custom nginx config for SPA support
RUN echo 'server { \
    listen 80; \
    server_name _; \
    root /usr/share/nginx/html; \
    index index.html; \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
    location /config.js { \
        expires -1; \
        add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0"; \
    } \
}' > /etc/nginx/conf.d/default.conf

# Copy built files from builder stage
COPY --from=builder /app/apps/isekai-frontend/dist /usr/share/nginx/html

# Copy entrypoint script
COPY apps/isekai-frontend/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 80

# Use custom entrypoint to inject runtime config, then start nginx
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
