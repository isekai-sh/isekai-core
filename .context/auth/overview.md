# Authentication Overview

**Purpose:** Complete guide to authentication, session management, and token lifecycle
**Last Updated:** 2026-01-05 (v0.1.0-alpha.5)

---

## Overview

Isekai Core uses **DeviantArt OAuth 2.0** for user authentication. Users log in with their DeviantArt accounts, and the system stores access/refresh tokens for API access.

**Authentication Methods:**
1. **Session Authentication** - Cookie-based for web frontend
2. **API Key Authentication** - Token-based for ComfyUI and integrations

**Session Storage:**
- **Redis** (preferred) - If `REDIS_URL` is set
- **PostgreSQL** (fallback) - Auto-detected if Redis unavailable

---

## OAuth Flow

### Step 1: User Clicks "Login with DeviantArt"

**Frontend:**
```typescript
window.location.href = "http://localhost:4000/api/auth/deviantart";
```

**Backend Redirect:**
```typescript
// GET /api/auth/deviantart
const params = new URLSearchParams({
  response_type: "code",
  client_id: process.env.DEVIANTART_CLIENT_ID!,
  redirect_uri: process.env.DEVIANTART_REDIRECT_URI!,
  scope: "user browse stash publish note message gallery",
});

const authUrl = `https://www.deviantart.com/oauth2/authorize?${params}`;
res.redirect(authUrl); // Redirect to DeviantArt
```

### Step 2: User Authorizes on DeviantArt

**DeviantArt OAuth Page:**
- Shows app name, requested scopes
- User clicks "Authorize"

**Scopes Requested:**
- `user` - Basic user info
- `browse` - Browse content
- `stash` - Upload files to stash
- `publish` - Publish deviations
- `note` - Send notes (future)
- `message` - Send messages (future)
- `gallery` - Manage galleries

### Step 3: DeviantArt Redirects to Callback

**Callback URL:**
```
http://localhost:4000/api/auth/deviantart/callback?code=ABC123
```

**Backend Handler:**
```typescript
// GET /api/auth/deviantart/callback
const { code } = req.query;

// Exchange authorization code for tokens
const tokenResponse = await fetch("https://www.deviantart.com/oauth2/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "authorization_code",
    client_id: process.env.DEVIANTART_CLIENT_ID!,
    client_secret: process.env.DEVIANTART_CLIENT_SECRET!,
    redirect_uri: process.env.DEVIANTART_REDIRECT_URI!,
    code,
  }),
});

const tokenData = await tokenResponse.json();
// { access_token, refresh_token, expires_in }
```

### Step 4: Fetch User Info

**Using Access Token:**
```typescript
const userResponse = await fetch("https://www.deviantart.com/api/v1/oauth2/user/whoami", {
  headers: { Authorization: `Bearer ${access_token}` },
});

const userData = await userResponse.json();
// { userid, username, usericon, type }
```

### Step 5: Create or Update User

**New User:**
```typescript
const user = await prisma.user.create({
  data: {
    deviantartId: userData.userid,
    deviantartUsername: userData.username,
    email: userData.email,
    avatarUrl: userData.usericon,
    accessToken: encrypt(access_token),
    refreshToken: encrypt(refresh_token),
    tokenExpiresAt: new Date(Date.now() + expires_in * 1000),
    refreshTokenExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
  },
});
```

**Existing User:**
```typescript
const user = await prisma.user.update({
  where: { deviantartId: userData.userid },
  data: {
    accessToken: encrypt(access_token),
    refreshToken: encrypt(refresh_token),
    tokenExpiresAt: new Date(Date.now() + expires_in * 1000),
    refreshTokenExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    avatarUrl: userData.usericon,
  },
});
```

### Step 6: Create Session

**Set Session Cookie:**
```typescript
req.session.user = {
  id: user.id,
  deviantartId: user.deviantartId,
  deviantartUsername: user.deviantartUsername,
};

// Redirect to frontend
res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
```

**Session Cookie:**
```
connect.sid=s%3AabcdefXYZ...; Path=/; HttpOnly; SameSite=Lax
```

---

## Token Lifecycle

### Access Token

**Expiry:** 1 hour (3600 seconds)

**Storage:** Encrypted in database (AES-256-GCM)

**Refresh Logic:**
```typescript
// Check if token expires in next 5 minutes
const expiresIn5Min = new Date(Date.now() + 5 * 60 * 1000);

if (user.tokenExpiresAt < expiresIn5Min) {
  // Refresh access token
  const tokenResponse = await fetch("https://www.deviantart.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: process.env.DEVIANTART_CLIENT_ID!,
      client_secret: process.env.DEVIANTART_CLIENT_SECRET!,
      refresh_token: decrypt(user.refreshToken),
    }),
  });

  const { access_token, expires_in } = await tokenResponse.json();

  await prisma.user.update({
    where: { id: user.id },
    data: {
      accessToken: encrypt(access_token),
      tokenExpiresAt: new Date(Date.now() + expires_in * 1000),
    },
  });
}
```

**Proactive Refresh:** Token maintenance job refreshes 7 days before expiry.

### Refresh Token

**Expiry:** 90 days (configurable via `REFRESH_TOKEN_EXPIRY_DAYS`)

**Storage:** Encrypted in database

**Proactive Maintenance:**

Token maintenance job (in publisher service) runs every 6 hours:

```typescript
// Find users with tokens expiring in 7+ days
const users = await prisma.user.findMany({
  where: {
    refreshTokenExpiresAt: {
      gte: new Date(),
      lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
    refreshTokenWarningEmailSent: false,
  },
});

for (const user of users) {
  // Try to refresh
  try {
    const newTokens = await refreshAccessToken(user.refreshToken);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        accessToken: encrypt(newTokens.access_token),
        refreshToken: encrypt(newTokens.refresh_token),
        tokenExpiresAt: new Date(Date.now() + newTokens.expires_in * 1000),
        refreshTokenExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        refreshTokenWarningEmailSent: false,
        refreshTokenExpiredEmailSent: false,
      },
    });
  } catch (error) {
    // Send warning email
    await sendRefreshTokenWarningEmail(user);
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenWarningEmailSent: true },
    });
  }
}
```

**Email Warnings:**
- **7 days before expiry:** Warning email sent
- **1 day before expiry:** Urgent email sent
- **On expiry:** All scheduled posts paused, user must re-login

**Expiration Handling:**

When publishing job detects expired refresh token:

```typescript
if (error.code === 'REFRESH_TOKEN_EXPIRED') {
  // Pause ALL scheduled posts for this user
  await prisma.deviation.updateMany({
    where: { userId, status: 'scheduled' },
    data: {
      status: 'draft',
      errorMessage: 'DeviantArt authentication expired. Please re-connect your account.',
    },
  });

  // Send notification email
  await sendRefreshTokenExpiredJobNotification(user, deviation.title);
}
```

---

## Session Management

### Session Store

**Auto-Detection:**

```typescript
export async function createSessionStore() {
  // Try Redis first
  if (process.env.REDIS_URL) {
    try {
      const redisClient = new Redis(process.env.REDIS_URL);
      await redisClient.ping();
      console.log("Using Redis for session storage");
      return new RedisStore({ client: redisClient });
    } catch (error) {
      console.warn("Redis unavailable, falling back to PostgreSQL");
    }
  }

  // Fall back to PostgreSQL
  console.log("Using PostgreSQL for session storage");
  return new PrismaSessionStore(prisma);
}
```

**Redis Store:**
- Fast (in-memory)
- Scales horizontally
- Sessions survive server restart
- TTL-based automatic cleanup

**PostgreSQL Store:**
- Reliable fallback
- No additional infrastructure
- Manual cleanup recommended (cron job)

### Session Configuration

```typescript
app.use(session({
  store: sessionStore,
  secret: env.SESSION_SECRET,      // 32+ character random string
  resave: false,                   // Don't save unchanged sessions
  saveUninitialized: false,        // Don't create session until data stored
  cookie: {
    secure: env.NODE_ENV === "production",  // HTTPS only in production
    httpOnly: true,                 // Not accessible via JavaScript
    sameSite: "lax",               // CSRF protection
    domain: env.COOKIE_DOMAIN,     // e.g., ".yourdomain.com" for subdomains
    maxAge: 30 * 24 * 60 * 60 * 1000,  // 30 days
  },
}));
```

### Session Data

**Stored in Session:**
```typescript
req.session.user = {
  id: "user-uuid",
  deviantartId: "123456",
  deviantartUsername: "artist",
};
```

**Not stored:** Sensitive data (tokens, email). Loaded from database on each request.

### Session Lifecycle

**Creation:** OAuth callback sets session.

**Renewal:** Session renewed on each request (sliding expiration).

**Expiration:**
- **Idle timeout:** 30 days without activity
- **Absolute timeout:** None (slides indefinitely while active)

**Destruction:**
```typescript
// GET /api/auth/logout
req.session.destroy((err) => {
  res.clearCookie('connect.sid');
  res.json({ message: "Logged out successfully" });
});
```

---

## Multi-Tenant Support (v0.1.0-alpha.3+)

### InstanceUser Model

**Purpose:** Track which DeviantArt users can access this instance.

**Fields:**
```typescript
{
  id: string,
  daUserId: string,        // Links to User.deviantartId
  daUsername: string,
  role: "admin" | "member",
  createdAt: DateTime,
  lastLoginAt: DateTime?
}
```

**First User = Admin:**
```typescript
const instanceUserCount = await prisma.instanceUser.count();
const isFirstUser = instanceUserCount === 0;

const role = isFirstUser ? "admin" : "member";

await prisma.instanceUser.create({
  data: {
    daUserId: userData.userid,
    daUsername: userData.username,
    role,
  },
});
```

**Team Invites:**

If `teamInvitesEnabled: false` in InstanceSettings:

```typescript
if (!isFirstUser && !instanceSettings?.teamInvitesEnabled) {
  return res.redirect(`${env.FRONTEND_URL}/callback?error=invites_disabled`);
}
```

---

## Account Limits

### Max DeviantArt Accounts

**Environment Variable:**
```bash
MAX_DA_ACCOUNTS=5  # 0 = unlimited
```

**Enforcement:**
```typescript
if (env.MAX_DA_ACCOUNTS > 0) {
  const currentAccountCount = await prisma.user.count();
  if (currentAccountCount >= env.MAX_DA_ACCOUNTS) {
    return res.redirect(`${env.FRONTEND_URL}/callback?error=account_limit_reached`);
  }
}
```

**Use Case:** Enforce subscription tier limits (e.g., Pro = 5 accounts, Agency = 50 accounts).

---

## Authentication Middleware

### Session Auth Middleware

**Applied to most routes:**
```typescript
export function authMiddleware(req, res, next) {
  if (!req.session?.user) {
    return res.status(401).json({
      error: "Unauthorized",
      code: "UNAUTHORIZED",
    });
  }

  // Load full user from database
  const user = await prisma.user.findUnique({
    where: { id: req.session.user.id },
  });

  if (!user) {
    req.session.destroy();
    return res.status(401).json({ error: "User not found" });
  }

  req.user = user;
  next();
}
```

### API Key Auth Middleware

**Applied to ComfyUI routes:**
```typescript
export async function apiKeyAuthMiddleware(req, res, next) {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey || typeof apiKey !== 'string') {
    return res.status(401).json({
      error: "Missing API key",
      code: "UNAUTHORIZED",
    });
  }

  // Lookup by prefix
  const keyPrefix = apiKey.substring(0, 16);
  const apiKeyRecord = await prisma.apiKey.findFirst({
    where: { keyPrefix, revokedAt: null },
    include: { user: true },
  });

  if (!apiKeyRecord) {
    return res.status(401).json({ error: "Invalid API key" });
  }

  // Verify full key
  const isValid = await bcrypt.compare(apiKey, apiKeyRecord.keyHash);
  if (!isValid) {
    return res.status(401).json({ error: "Invalid API key" });
  }

  // Update last used
  await prisma.apiKey.update({
    where: { id: apiKeyRecord.id },
    data: { lastUsed: new Date() },
  });

  req.user = apiKeyRecord.user;
  next();
}
```

### Hybrid Auth Middleware

**Tries session, falls back to API key:**
```typescript
export async function hybridAuthMiddleware(req, res, next) {
  // Try session first
  if (req.session?.user) {
    const user = await prisma.user.findUnique({
      where: { id: req.session.user.id },
    });
    if (user) {
      req.user = user;
      return next();
    }
  }

  // Fall back to API key
  const apiKey = req.headers['x-api-key'];
  if (apiKey) {
    return apiKeyAuthMiddleware(req, res, next);
  }

  return res.status(401).json({ error: "Unauthorized" });
}
```

**Used by:** `/api/sale-queue` routes.

---

## Troubleshooting

### "Session not persisting"

**Cause:** Missing `credentials: "include"` in frontend fetch.

**Solution:**
```typescript
fetch("http://localhost:4000/api/auth/me", {
  credentials: "include",  // Send cookies
});
```

### "Token refresh failed"

**Cause:** Refresh token expired or invalid.

**Solution:** User must re-login via OAuth.

### "Rate limit on OAuth"

**Cause:** DeviantArt API rate limited.

**Error:**
```
DeviantArt API rate limit reached. Please wait a few minutes and try logging in again.
```

**Solution:** Wait 5 minutes before retry.

### "Account limit reached"

**Cause:** `MAX_DA_ACCOUNTS` limit exceeded.

**Solution:** Increase limit or remove existing accounts.

---

## Related Documentation

- `.context/auth/oauth.md` - DeviantArt OAuth setup
- `.context/auth/security.md` - API key generation, encryption
- `.context/api/headers.md` - Auth headers reference
- `.context/database/models.md` - User, ApiKey, InstanceUser models
