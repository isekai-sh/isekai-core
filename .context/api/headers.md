# API Headers & Authentication

**Purpose:** Guide to HTTP headers, authentication methods, and CORS configuration
**Last Updated:** 2026-01-05 (v0.1.0-alpha.5)

---

## Authentication Methods

### Session Authentication (Cookie-Based)

**Default Method:** Used by frontend web application.

**Flow:**

1. User logs in via OAuth (`/api/auth/login`)
2. Server sets session cookie
3. Browser automatically sends cookie with each request
4. Server validates session and loads user

**Cookie Details:**

```typescript
{
  name: "connect.sid",              // Session ID cookie
  secure: true,                     // HTTPS only (production)
  httpOnly: true,                   // Not accessible via JavaScript
  sameSite: "lax",                  // CSRF protection
  domain: ".yourdomain.com",        // Share across subdomains (optional)
  maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
}
```

**Request Example:**

```http
GET /api/deviations HTTP/1.1
Host: api.example.com
Cookie: connect.sid=s%3AabcdefXYZ...
```

**Session Storage:**

- **Redis** (if `REDIS_URL` set) - Preferred, supports horizontal scaling
- **PostgreSQL** (fallback) - Auto-detected if Redis unavailable

### API Key Authentication

**Use Cases:**

- ComfyUI integration
- Third-party integrations
- CLI tools
- Automation scripts

**Header Format:**

```http
X-API-Key: isk_live_abc123def456ghi789...
```

**Key Prefix:**

- `isk_live_*` - Production keys
- `isk_test_*` - Test keys (future)

**Request Example:**

```http
POST /api/comfyui/deviations HTTP/1.1
Host: api.example.com
X-API-Key: isk_live_abc123def456ghi789
Content-Type: application/json

{
  "title": "AI Generated Art",
  "fileUrl": "https://example.com/output.png"
}
```

**Security:**

- Keys stored as bcrypt hashes in database
- Only `keyPrefix` (first 8 chars) stored in plaintext for identification
- Full key shown only once on creation

### Hybrid Authentication

**Used By:** `/api/sale-queue` routes

**Logic:**

```typescript
// Try session first
if (req.session?.user) {
  req.user = req.session.user;
  return next();
}

// Fall back to API key
const apiKey = req.headers['x-api-key'];
if (apiKey) {
  const user = await validateApiKey(apiKey);
  if (user) {
    req.user = user;
    return next();
  }
}

// Neither method succeeded
return res.status(401).json({ error: 'Unauthorized' });
```

**Why?** Sale queue can be accessed by frontend (session) and background jobs (API key).

---

## Request Headers

### Required Headers

#### Content-Type

```http
Content-Type: application/json
```

**Required For:** POST, PATCH requests with body.

**Error if Missing:**

```json
{
  "error": "Invalid JSON"
}
```

#### X-API-Key

```http
X-API-Key: isk_live_abc123def456ghi789
```

**Required For:** `/api/comfyui/*` routes and hybrid-auth routes without session.

### Optional Headers

#### Accept

```http
Accept: application/json
```

**Default:** All endpoints return JSON. Accept header is optional.

#### User-Agent

```http
User-Agent: Isekai-CLI/1.0.0
```

**Optional:** Logged for debugging but not required.

---

## Response Headers

### Standard Headers

#### Content-Type

```http
Content-Type: application/json; charset=utf-8
```

**All responses are JSON.**

#### Set-Cookie

```http
Set-Cookie: connect.sid=s%3AabcdefXYZ...; Path=/; HttpOnly; SameSite=Lax
```

**Set on:**

- Successful login (`/api/auth/callback`)
- Session refresh

#### X-RateLimit-\* (Planned)

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1641038400
```

**Not yet implemented.** Planned for tiered rate limiting.

---

## CORS Configuration

### Allowed Origins

**Development:**

```typescript
[
  'http://localhost:3000', // Frontend dev server
  'http://localhost:3001', // Alternative port
  'http://localhost:5173', // Vite default
  'http://localhost:5174', // Vite alternative
];
```

**Production:**

```typescript
[
  process.env.FRONTEND_URL, // e.g., "https://app.example.com"
];
```

**Dynamic Origin Check:**

```typescript
cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // Allow cookies
  /* ... */
});
```

### Allowed Methods

```
GET, POST, PUT, DELETE, PATCH, OPTIONS
```

### Allowed Headers

```
Content-Type, Authorization, X-Requested-With
```

### Exposed Headers

```
Set-Cookie
```

**Why?** Allows frontend to read Set-Cookie header for debugging.

### Preflight Cache

```
Access-Control-Max-Age: 86400  // 24 hours
```

**Preflight:** Browser sends OPTIONS request before actual request. Cache reduces latency.

---

## Rate Limiting

### Middleware Configuration

**Schedule Rate Limit:**

```typescript
// Applied to /api/deviations/:id/schedule
const scheduleRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute
  message: 'Too many schedule requests. Try again later.',
});
```

**Batch Rate Limit:**

```typescript
// Applied to batch operations
const batchRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 requests per minute
  message: 'Too many batch requests. Try again later.',
});
```

### Rate Limit Response

**HTTP 429:**

```http
HTTP/1.1 429 Too Many Requests
Content-Type: application/json
Retry-After: 60

{
  "error": "Too many requests. Try again later.",
  "retryAfter": 60
}
```

**Client Behavior:**

- Wait for `retryAfter` seconds
- Exponential backoff on repeated 429s
- Display error to user

---

## Error Responses

### Standard Error Format

```json
{
  "error": "Human-readable error message",
  "code": "ERROR_CODE",
  "details": {
    /* Optional error context */
  }
}
```

### HTTP Status Codes

| Status | Meaning               | Example                             |
| ------ | --------------------- | ----------------------------------- |
| 200    | Success               | Data returned successfully          |
| 201    | Created               | Resource created                    |
| 204    | No Content            | Resource deleted                    |
| 400    | Bad Request           | Invalid input                       |
| 401    | Unauthorized          | Not authenticated                   |
| 403    | Forbidden             | Insufficient permissions            |
| 404    | Not Found             | Resource doesn't exist              |
| 409    | Conflict              | Resource conflict (e.g., duplicate) |
| 429    | Too Many Requests     | Rate limited                        |
| 500    | Internal Server Error | Server error                        |
| 502    | Bad Gateway           | Upstream service error              |
| 503    | Service Unavailable   | Service temporarily down            |

### Common Errors

#### 401 Unauthorized

```json
{
  "error": "Unauthorized",
  "code": "UNAUTHORIZED"
}
```

**Cause:** No session cookie or invalid API key.

**Solution:** Log in or provide valid API key.

#### 403 Forbidden

```json
{
  "error": "Insufficient permissions",
  "code": "FORBIDDEN"
}
```

**Cause:** User doesn't have required role (e.g., admin).

**Solution:** Contact admin for permissions.

#### 404 Not Found

```json
{
  "error": "Deviation not found",
  "code": "NOT_FOUND"
}
```

**Cause:** Resource doesn't exist or user doesn't own it.

#### 400 Validation Error

```json
{
  "error": "Validation error",
  "code": "VALIDATION_ERROR",
  "details": {
    "field": "scheduledAt",
    "message": "Scheduled time must be at least 1 hour in the future"
  }
}
```

**Cause:** Invalid request body (Zod validation failed).

---

## Security Headers

### HTTPS Enforcement

**Production Only:**

```typescript
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(`https://${req.hostname}${req.url}`);
    }
    next();
  });
}
```

**Why?** Cookies with `secure: true` only sent over HTTPS.

### Trust Proxy

**Behind Reverse Proxy:**

```typescript
app.set('trust proxy', 1);
```

**Why?** Allows Express to read client IP from `X-Forwarded-For` header.

**Security Implication:** Only enable if behind trusted proxy (Nginx, Cloudflare).

---

## Session Management

### Session Store Auto-Detection

**Logic:**

```typescript
export async function createSessionStore() {
  // Try Redis first
  if (process.env.REDIS_URL) {
    try {
      const redisClient = new Redis(process.env.REDIS_URL);
      await redisClient.ping();
      console.log('Using Redis for session storage');
      return new RedisStore({ client: redisClient });
    } catch (error) {
      console.warn('Redis unavailable, falling back to PostgreSQL');
    }
  }

  // Fall back to PostgreSQL
  console.log('Using PostgreSQL for session storage');
  return new PrismaSessionStore(prisma);
}
```

**Benefits:**

- **Redis:** Fast, supports horizontal scaling, sessions survive server restart
- **PostgreSQL:** Reliable fallback, no additional infrastructure needed

### Session Expiration

**Max Age:**

```typescript
maxAge: 1000 * 60 * 60 * 24 * env.SESSION_MAX_AGE_DAYS; // Default: 30 days
```

**Sliding Expiration:** Session renewed on each request (extends expiration).

**Absolute Expiration:** After `SESSION_MAX_AGE_DAYS`, user must re-login.

### Session Cleanup

**PostgreSQL:** Manual cleanup recommended (cron job):

```sql
DELETE FROM sessions WHERE expire < NOW();
```

**Redis:** Automatic cleanup (TTL-based).

---

## API Key Management

### Key Generation

**Format:** `isk_live_` + 32 random bytes (hex)

**Example:** `isk_live_abc123def456ghi789jkl012mno345pqr678stu901`

**Generation:**

```typescript
import crypto from 'crypto';

function generateApiKey(): string {
  const randomBytes = crypto.randomBytes(32).toString('hex');
  return `isk_live_${randomBytes}`;
}
```

### Key Validation

**Lookup by Prefix:**

```typescript
const keyPrefix = apiKey.substring(0, 16); // "isk_live_abc123d"

const apiKeyRecord = await prisma.apiKey.findFirst({
  where: {
    keyPrefix,
    revokedAt: null,
  },
  include: { user: true },
});

if (!apiKeyRecord) {
  throw new Error('Invalid API key');
}

// Verify full key against bcrypt hash
const isValid = await bcrypt.compare(apiKey, apiKeyRecord.keyHash);
if (!isValid) {
  throw new Error('Invalid API key');
}

// Update last used timestamp
await prisma.apiKey.update({
  where: { id: apiKeyRecord.id },
  data: { lastUsed: new Date() },
});

return apiKeyRecord.user;
```

**Why Bcrypt?** Prevents API key theft from database breach.

### Key Revocation

**Soft Delete:**

```typescript
await prisma.apiKey.update({
  where: { id: apiKeyId },
  data: {
    revokedAt: new Date(),
    revokedBy: req.user!.id,
  },
});
```

**Validation Check:**

```typescript
if (apiKeyRecord.revokedAt) {
  throw new Error('API key has been revoked');
}
```

---

## Troubleshooting

### "Session not persisting"

**Cause:** Missing `credentials: true` in fetch request.

**Solution:**

```typescript
// Frontend
fetch('http://localhost:4000/api/auth/me', {
  credentials: 'include', // Send cookies cross-origin
});
```

### "CORS error"

**Cause:** Frontend origin not in `allowedOrigins`.

**Check Backend Logs:**

```
Not allowed by CORS: https://example.com
```

**Solution:** Add origin to `FRONTEND_URL` env var or `allowedOrigins` array.

### "API key not working"

**Cause:** Header name mismatch.

**Correct:**

```http
X-API-Key: isk_live_...
```

**Incorrect:**

```http
Authorization: Bearer isk_live_...  // Wrong header name
```

### "401 on valid session"

**Cause:** Session expired or session store failure.

**Check:**

1. Session max age (`SESSION_MAX_AGE_DAYS`)
2. Redis/PostgreSQL connectivity
3. Cookie domain mismatch

---

## Related Documentation

- `.context/auth/overview.md` - OAuth flow
- `.context/auth/security.md` - API key generation
- `.context/api/endpoints.md` - All API routes
- `.context/api/responses.md` - Response formats
- `.context/errors.md` - Error codes catalog
