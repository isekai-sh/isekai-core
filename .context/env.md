# Environment Variables

**Purpose:** Complete reference for all environment variables and configuration
**Last Updated:** 2026-01-05 (v0.1.0-alpha.5)

---

## Overview

Isekai Core uses environment variables for all configuration. Copy `.env.example` to `.env` and customize values.

**Never commit `.env` to git.** It contains secrets.

---

## Required Variables

### Database

```bash
DATABASE_URL=postgresql://user:password@host:port/database
```

**Format:** PostgreSQL connection string

**Example:**

```bash
# Development (Docker Compose)
DATABASE_URL=postgresql://isekai:isekai@postgres:5432/isekai

# Production
DATABASE_URL=postgresql://user:pass@db.example.com:5432/isekai_prod
```

### Redis

```bash
REDIS_URL=redis://host:port
```

**Optional:** If not set, sessions/cache fall back to PostgreSQL.

**Examples:**

```bash
# Development
REDIS_URL=redis://redis:6379

# Production with auth
REDIS_URL=redis://:password@redis.example.com:6379

# TLS
REDIS_URL=rediss://redis.example.com:6380
```

### DeviantArt OAuth

```bash
DEVIANTART_CLIENT_ID=your_client_id
DEVIANTART_CLIENT_SECRET=your_secret
DEVIANTART_REDIRECT_URI=http://localhost:4000/api/auth/deviantart/callback
```

**Setup:** [DeviantArt Developers](https://www.deviantart.com/developers/apps)

**Required Scopes:** `user, browse, stash, publish, note, message, gallery`

### Security

```bash
SESSION_SECRET=your-random-string-min-32-chars
ENCRYPTION_KEY=your-32-byte-hex-key
```

**Generate:**

```bash
# Session secret (any length, 32+ recommended)
openssl rand -base64 32

# Encryption key (must be 64 hex characters = 32 bytes)
openssl rand -hex 32
```

**CRITICAL:** Change from defaults before production use.

---

## S3-Compatible Storage

### Supported Providers

- **AWS S3** (default)
- **Cloudflare R2** (recommended for production)
- **MinIO** (local development)
- **DigitalOcean Spaces**
- **Backblaze B2**

### AWS S3

```bash
S3_ENDPOINT=                   # Empty for AWS
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=AKIA...
S3_SECRET_ACCESS_KEY=...
S3_BUCKET_NAME=my-bucket
S3_PUBLIC_URL=https://my-bucket.s3.us-east-1.amazonaws.com
S3_FORCE_PATH_STYLE=false
```

### Cloudflare R2

```bash
S3_ENDPOINT=https://abc123.r2.cloudflarestorage.com
S3_REGION=auto
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_BUCKET_NAME=isekai-uploads
S3_PUBLIC_URL=https://pub-xxx.r2.dev
S3_FORCE_PATH_STYLE=false
```

### MinIO (Default Development)

```bash
S3_ENDPOINT=http://minio:9000
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_BUCKET_NAME=isekai-uploads
S3_PUBLIC_URL=http://localhost:9000/isekai-uploads
S3_FORCE_PATH_STYLE=true
S3_PRESIGNED_ENDPOINT=http://localhost:9000  # Browser-accessible URL
```

**MinIO Console:** http://localhost:9001 (minioadmin / minioadmin)

### Multi-Tenant Storage Prefix

```bash
S3_PATH_PREFIX=tenant-123/
```

**Optional:** Prefix all storage keys for multi-tenant isolation.

**Example:** `tenant-123/deviations/uuid/file.png`

---

## Application URLs

```bash
FRONTEND_URL=http://localhost:3000
PORT=4000
NODE_ENV=development
```

**NODE_ENV:**

- `development` - Dev mode, verbose logging
- `production` - Prod mode, HTTPS enforcement, secure cookies

---

## Session Configuration

```bash
SESSION_STORE=redis                 # redis | postgres
SESSION_MAX_AGE_DAYS=7             # Cookie lifetime (days)
COOKIE_DOMAIN=                      # Leave empty or set ".yourdomain.com"
REFRESH_TOKEN_EXPIRY_DAYS=90       # DeviantArt token expiry
```

**Auto-Detection:** If `SESSION_STORE` not set, tries Redis → PostgreSQL fallback.

---

## Cache Configuration

```bash
CACHE_ENABLED=true                  # Master switch
CACHE_DEFAULT_TTL=300               # 5 minutes
CACHE_STALE_TTL=7200                # 2 hours (rate limit fallback)
```

**Cache TTLs:**

- `CACHE_DEFAULT_TTL` - Normal cache lifetime
- `CACHE_STALE_TTL` - Max age for stale cache on 429 errors

---

## Circuit Breaker

```bash
CIRCUIT_BREAKER_ENABLED=true
CIRCUIT_BREAKER_THRESHOLD=3                  # 3 failures → open
CIRCUIT_BREAKER_OPEN_DURATION_MS=300000      # 5 minutes
CIRCUIT_BREAKER_PERSIST_TO_REDIS=true
```

**When Circuit Opens:**

- Stops sending requests to DeviantArt for 5 minutes
- Returns cached data or 429 error
- Prevents wasting API quota

---

## Publisher Worker

```bash
PUBLISHER_CONCURRENCY=5                      # Concurrent jobs (default: 2)
PUBLISHER_MAX_ATTEMPTS=7                     # Max retries
PUBLISHER_JOB_TIMEOUT_MS=600000              # 10 minutes
PUBLISHER_STALE_CHECK_INTERVAL_MS=60000      # 1 minute
PUBLISHER_MAX_STALLED_COUNT=2
```

**Concurrency:** Low values (2-5) recommended to avoid rate limits.

**Timeout:** Jobs taking >10 minutes are marked as stalled.

---

## Adaptive Rate Limiter

```bash
RATE_LIMITER_ENABLED=true
RATE_LIMITER_BASE_DELAY_MS=3000              # 3 seconds
RATE_LIMITER_MAX_DELAY_MS=300000             # 5 minutes
RATE_LIMITER_JITTER_PERCENT=20               # ±20% randomness
RATE_LIMITER_SUCCESS_DECREASE_FACTOR=0.9     # Speed up after success
RATE_LIMITER_FAILURE_INCREASE_FACTOR=2.0     # Slow down after failure
```

**Adaptive:** Automatically adjusts delay based on API responses.

---

## Metrics & Monitoring

```bash
METRICS_ENABLED=true
METRICS_FLUSH_INTERVAL_MS=60000              # 1 minute
LOG_LEVEL=info                               # debug | info | warn | error
```

**Log Levels:**

- `debug` - Verbose (all requests, SQL queries)
- `info` - Normal (startup, key events)
- `warn` - Warnings (retries, fallbacks)
- `error` - Errors only

---

## Health Check

```bash
HEALTH_CHECK_PORT=8000                       # Publisher health check
HEALTH_CHECK_ENABLED=true
```

**Publisher Health Endpoint:** `http://localhost:8000/health`

---

## Optional Variables

### Account Limits (SaaS)

```bash
MAX_DA_ACCOUNTS=5                            # 0 = unlimited
```

**Enforcement:** Blocks new signups when limit reached.

### Frontend Runtime Config

```bash
VITE_API_URL=http://localhost:4000/api
VITE_DEVIANTART_CLIENT_ID=${DEVIANTART_CLIENT_ID}
```

**Build Once, Run Anywhere:** These are injected at runtime, not build time.

---

## Development vs Production

### Development

```bash
NODE_ENV=development
DATABASE_URL=postgresql://isekai:isekai@localhost:5432/isekai
REDIS_URL=redis://localhost:6379
FRONTEND_URL=http://localhost:3000
S3_ENDPOINT=http://localhost:9000
S3_PRESIGNED_ENDPOINT=http://localhost:9000
LOG_LEVEL=debug
```

### Production

```bash
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@db.prod.com:5432/isekai
REDIS_URL=rediss://:password@redis.prod.com:6380
FRONTEND_URL=https://app.example.com
S3_ENDPOINT=https://abc123.r2.cloudflarestorage.com
S3_PUBLIC_URL=https://pub-xxx.r2.dev
LOG_LEVEL=info
COOKIE_DOMAIN=.example.com
SESSION_MAX_AGE_DAYS=30
```

---

## Docker Compose

**File:** `docker-compose.yml`

**Services:**

- **postgres** - PostgreSQL database
- **redis** - Redis cache/sessions
- **minio** - S3-compatible storage
- **backend** - Express API server
- **frontend** - React SPA
- **publisher** - BullMQ worker

**Start All:**

```bash
docker compose up -d
```

---

## Environment Validation

**Validated on Startup:**

```typescript
// apps/isekai-backend/src/lib/env.ts
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  DEVIANTART_CLIENT_ID: z.string().min(1),
  DEVIANTART_CLIENT_SECRET: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  ENCRYPTION_KEY: z.string().length(64), // 32 bytes hex
  // ...
});

export const env = envSchema.parse(process.env);
```

**Startup Fails:** If required variables missing or invalid.

---

## Troubleshooting

### "ENCRYPTION_KEY must be 64 characters"

**Cause:** Wrong length for AES-256-GCM.

**Solution:**

```bash
openssl rand -hex 32  # Generates 64 hex characters
```

### "Cannot connect to PostgreSQL"

**Check:**

1. Database running? (`docker ps`)
2. Correct host/port?
3. User/password correct?

**Test Connection:**

```bash
psql "postgresql://isekai:isekai@localhost:5432/isekai"
```

### "Redis connection failed"

**Fallback:** Sessions/cache use PostgreSQL automatically.

**To Use Redis:**

1. Start Redis (`docker compose up redis -d`)
2. Set `REDIS_URL=redis://localhost:6379`

### "MinIO bucket not found"

**Create Bucket:**

1. Open http://localhost:9001
2. Login: minioadmin / minioadmin
3. Create bucket: `isekai-uploads`
4. Set public access policy

---

## Related Documentation

- `.context/auth/security.md` - Encryption details
- `.context/architecture/overview.md` - System architecture
- `.context/deployment.md` - Production deployment (planned)
