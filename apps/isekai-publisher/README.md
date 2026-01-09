# Isekai Publisher Worker

Dedicated microservice for processing DeviantArt publishing jobs. This service is completely separated from the API server to provide fault isolation, independent scaling, and better resource management.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  Microservices Architecture                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌───────────────────────┐      ┌─────────────────────┐   │
│  │ isekai-backend (API)  │      │  isekai-publisher   │   │
│  │   Port: 4000          │      │  Port: 5000 (health)│   │
│  │                       │      │                     │   │
│  │  - Express API        │      │  - BullMQ Worker    │   │
│  │  - Job Enqueueing     │      │  - Job Processing   │   │
│  │  - Auth & Routes      │      │  - DA Publishing    │   │
│  └───────────────────────┘      └─────────────────────┘   │
│              ↓                             ↑               │
│              └──────── Redis Queue ────────┘               │
│                    (BullMQ Coordination)                    │
│                                                             │
│  Shared Resources:                                          │
│  - PostgreSQL (deviation state)                             │
│  - Redis (job queue + cache + circuit breaker state)       │
└─────────────────────────────────────────────────────────────┘
```

## Features

### Fault Isolation

- **Independent Crash Domains**: Publisher crashes don't affect API, and vice versa
- **Process Separation**: Each service can be restarted independently
- **Error Boundaries**: Uncaught exceptions are contained within the service

### Resilient Publishing

- **Adaptive Rate Limiting**: Smart delays based on DeviantArt Retry-After headers
- **Circuit Breaker**: Automatic failure detection with Redis-backed state persistence
- **Error Categorization**: 8 error categories with appropriate retry strategies
- **Exponential Backoff**: Configurable retry delays with jitter

### Observability

- **Health Check Endpoints**: `/health`, `/ready`, `/metrics` for monitoring
- **Structured Logging**: JSON logs with correlation IDs for distributed tracing
- **Prometheus Metrics**: Job success/failure rates, latency, error distribution
- **Graceful Shutdown**: Waits for active jobs to complete before exiting

### Scalability

- **Horizontal Scaling**: Run multiple publisher instances for higher throughput
- **Configurable Concurrency**: Control jobs per worker via `PUBLISHER_CONCURRENCY`
- **Independent Deployment**: Deploy publisher updates without API downtime

## Environment Variables

See [.env.example](./.env.example) for all configuration options.

Key configurations:

```bash
# Database & Redis
DATABASE_URL=postgresql://isekai:isekai@localhost:5433/isekai
REDIS_URL=redis://localhost:6379

# DeviantArt OAuth
DEVIANTART_CLIENT_ID=your_client_id
DEVIANTART_CLIENT_SECRET=your_client_secret

# Worker Configuration
PUBLISHER_CONCURRENCY=5               # Jobs processed concurrently
PUBLISHER_MAX_ATTEMPTS=7              # Max retry attempts
PUBLISHER_JOB_TIMEOUT_MS=600000       # Job timeout (10 min)

# Rate Limiter
RATE_LIMITER_ENABLED=true
RATE_LIMITER_BASE_DELAY_MS=3000       # Base delay between requests
RATE_LIMITER_MAX_DELAY_MS=300000      # Max delay (5 min)

# Circuit Breaker
CIRCUIT_BREAKER_ENABLED=true
CIRCUIT_BREAKER_THRESHOLD=3           # 429 errors before opening
CIRCUIT_BREAKER_OPEN_DURATION_MS=300000  # Stay open for 5 min

# Health Check
HEALTH_CHECK_PORT=5000
HEALTH_CHECK_ENABLED=true
```

## Development

### Prerequisites

- Node.js 20+
- pnpm 9+
- PostgreSQL 16
- Redis 7

### Local Setup

1. **Install dependencies** (from monorepo root):

   ```bash
   pnpm install
   ```

2. **Create `.env` file**:

   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start dependencies** (PostgreSQL + Redis):

   ```bash
   docker-compose up postgres redis -d
   ```

4. **Run publisher in dev mode**:

   ```bash
   pnpm dev:publisher
   # Or from root: pnpm --filter isekai-publisher dev
   ```

5. **Run both services together**:
   ```bash
   pnpm dev:services  # Runs API + Publisher in parallel
   ```

### Scripts

```bash
# Development
pnpm dev              # Watch mode with hot reload

# Production
pnpm build            # Compile TypeScript
pnpm start            # Run compiled code

# Utilities
pnpm clean            # Remove dist folder
```

## Deployment

### Docker

Build and run with Docker Compose:

```bash
# Build all services
docker-compose build

# Start publisher only
docker-compose up publisher

# Start all services
docker-compose up

# Scale publisher workers
docker-compose up --scale publisher=3
```

### Standalone Docker

```bash
# Build
docker build -t isekai-publisher -f apps/isekai-publisher/Dockerfile .

# Run
docker run -d \
  --name isekai-publisher \
  -p 5000:5000 \
  -e DATABASE_URL=postgresql://... \
  -e REDIS_URL=redis://... \
  isekai-publisher
```

### Kubernetes

Deploy as a separate service:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: isekai-publisher
spec:
  replicas: 2 # Scale based on queue depth
  selector:
    matchLabels:
      app: isekai-publisher
  template:
    metadata:
      labels:
        app: isekai-publisher
    spec:
      containers:
        - name: publisher
          image: isekai-publisher:latest
          ports:
            - containerPort: 5000
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: isekai-secrets
                  key: database-url
          livenessProbe:
            httpGet:
              path: /health
              port: 5000
            initialDelaySeconds: 30
            periodSeconds: 30
          readinessProbe:
            httpGet:
              path: /ready
              port: 5000
            initialDelaySeconds: 10
            periodSeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: isekai-publisher
spec:
  selector:
    app: isekai-publisher
  ports:
    - port: 5000
      targetPort: 5000
```

## Monitoring

### Health Checks

**Liveness Probe** - Is the process running?

```bash
curl http://localhost:5000/health
```

Response:

```json
{
  "status": "healthy",
  "service": "isekai-publisher",
  "uptime": 3600,
  "timestamp": "2025-12-09T00:00:00.000Z"
}
```

**Readiness Probe** - Can it process jobs?

```bash
curl http://localhost:5000/ready
```

Response:

```json
{
  "status": "ready",
  "service": "isekai-publisher",
  "worker": {
    "running": true,
    "activeJobs": 2
  },
  "redis": {
    "connected": true
  },
  "timestamp": "2025-12-09T00:00:00.000Z"
}
```

### Metrics

**Prometheus Endpoint**:

```bash
curl http://localhost:5000/metrics
```

Response:

```
# HELP publisher_active_jobs Number of jobs currently being processed
# TYPE publisher_active_jobs gauge
publisher_active_jobs 2

# HELP publisher_uptime_seconds Uptime of the publisher service in seconds
# TYPE publisher_uptime_seconds counter
publisher_uptime_seconds 3600
```

### Logs

Structured JSON logs with correlation IDs:

```json
{
  "timestamp": "2025-12-09T00:00:00.000Z",
  "level": "info",
  "message": "Starting deviation publish job",
  "correlationId": "job-abc123",
  "jobId": "abc123",
  "deviationId": "dev-456",
  "userId": "user-789",
  "attemptNumber": 1,
  "maxAttempts": 7,
  "uploadMode": "single"
}
```

## Error Handling

### Error Categories

1. **RATE_LIMIT (429)**: Adaptive backoff, circuit breaker
2. **AUTH_ERROR (401)**: Token refresh, then retry
3. **NETWORK_ERROR**: Exponential backoff
4. **VALIDATION_ERROR (400)**: No retry, mark as failed
5. **SERVER_ERROR (5xx)**: Retry with backoff
6. **TOKEN_EXPIRED**: Auto-refresh token
7. **QUOTA_EXCEEDED**: Long delay, circuit breaker
8. **UNKNOWN**: Conservative retry strategy

### Retry Strategy

- **Max Attempts**: 7 (configurable)
- **Backoff**: Exponential with jitter
- **Circuit Breaker**: Opens after 3 consecutive 429s
- **Rate Limiter**: Respects Retry-After headers

## Architecture Decisions

### Why Separate from API?

1. **Fault Isolation**: Publisher crashes don't take down API
2. **Resource Management**: Dedicated CPU/memory per service
3. **Independent Scaling**: Scale publisher based on queue depth
4. **Zero-Downtime Deploys**: Deploy each service independently
5. **Simplified Debugging**: Isolated logs and metrics

### Communication Pattern

- **Async via Redis Queue**: No direct HTTP calls between services
- **Shared PostgreSQL**: Single source of truth for deviation state
- **Event-Driven**: API enqueues jobs, publisher processes them
- **Durable**: Jobs survive restarts via Redis persistence

### Graceful Shutdown

```
1. Receive SIGTERM/SIGINT
2. Pause worker (stop accepting new jobs)
3. Wait for active jobs to complete (max 30s)
4. Close worker
5. Close Redis connection
6. Close health check server
7. Exit process
```

## Troubleshooting

### Publisher Not Processing Jobs

1. Check health endpoint: `curl http://localhost:5000/health`
2. Check Redis connection: `redis-cli ping`
3. Check logs: `docker logs isekai-publisher`
4. Verify queue has jobs: Redis CLI `LLEN bull:deviation-publisher:wait`

### High Failure Rate

1. Check metrics: `curl http://localhost:5000/metrics`
2. Review error logs for patterns
3. Check circuit breaker state (Redis keys: `circuit:*`)
4. Verify DeviantArt API credentials

### Slow Processing

1. Increase concurrency: `PUBLISHER_CONCURRENCY=10`
2. Scale horizontally: Add more publisher instances
3. Check rate limiter delays (Redis keys: `rate-limit:*`)
4. Review DeviantArt rate limits

## Related Services

- **isekai-backend**: API server that enqueues publishing jobs
- **isekai-frontend**: Frontend application for users

## License

UNLICENSED
