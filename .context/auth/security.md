# Security - Encryption & API Keys

**Purpose:** Guide to security measures, token encryption, and API key management
**Last Updated:** 2026-01-05 (v0.1.0-alpha.5)

---

## Token Encryption

### AES-256-GCM Encryption

**Access and refresh tokens encrypted at rest in database.**

**Encryption Key:**
```bash
ENCRYPTION_KEY=your-32-character-secret-key-here
```

**Encryption:**
```typescript
import crypto from 'crypto';

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY), iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
}
```

**Decryption:**
```typescript
export function decrypt(text: string): string {
  const parts = text.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];

  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY), iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
```

**Why AES-256-GCM?**
- Industry standard
- Authenticated encryption (prevents tampering)
- Fast performance

---

## API Key Security

### Key Generation

**Format:** `isk_live_` + 32 random bytes (hex)

```typescript
import crypto from 'crypto';

function generateApiKey(): string {
  const randomBytes = crypto.randomBytes(32).toString('hex');
  return `isk_live_${randomBytes}`;
}
```

**Length:** 73 characters total (9 prefix + 64 random)

### Key Storage

**Only bcrypt hash stored:**

```typescript
import bcrypt from 'bcrypt';

const apiKey = generateApiKey();
const keyHash = await bcrypt.hash(apiKey, 10);
const keyPrefix = apiKey.substring(0, 16); // "isk_live_abc123d"

await prisma.apiKey.create({
  data: {
    userId,
    name,
    keyHash,    // Hashed version
    keyPrefix,  // For lookup
  },
});

// Return full key ONCE
return { apiKey, keyPrefix };
```

**Full key shown only once.** User must store securely.

### Key Validation

**Lookup by prefix, verify with bcrypt:**

```typescript
const keyPrefix = apiKey.substring(0, 16);

const apiKeyRecord = await prisma.apiKey.findFirst({
  where: { keyPrefix, revokedAt: null },
});

if (!apiKeyRecord) {
  throw new Error("Invalid API key");
}

const isValid = await bcrypt.compare(apiKey, apiKeyRecord.keyHash);
if (!isValid) {
  throw new Error("Invalid API key");
}
```

### Key Revocation

**Soft delete with audit trail:**

```typescript
await prisma.apiKey.update({
  where: { id: apiKeyId },
  data: {
    revokedAt: new Date(),
    revokedBy: req.user!.id,
  },
});
```

---

## Session Security

**Cookie Settings:**
```typescript
{
  secure: true,        // HTTPS only (production)
  httpOnly: true,      // Not accessible via JavaScript (XSS protection)
  sameSite: "lax",     // CSRF protection
  maxAge: 30 * 24 * 60 * 60 * 1000  // 30 days
}
```

**Session Secret:**
```bash
SESSION_SECRET=your-long-random-secret-minimum-32-chars
```

**Generate with:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Password Policies

**No passwords used.** OAuth-only authentication.

---

## HTTPS Enforcement

**Production:**
```typescript
if (process.env.NODE_ENV === "production") {
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(`https://${req.hostname}${req.url}`);
    }
    next();
  });
}
```

---

## Environment Variable Security

**Sensitive Variables:**
- `DEVIANTART_CLIENT_SECRET`
- `ENCRYPTION_KEY`
- `SESSION_SECRET`
- `DATABASE_URL`
- `REDIS_URL`

**Never commit to git.** Use `.env` file (gitignored).

---

## Rate Limiting

See `.context/api/headers.md` for rate limit details.

---

## Related Documentation

- `.context/auth/overview.md` - Authentication flow
- `.context/api/headers.md` - Auth headers
