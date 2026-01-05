# DeviantArt OAuth Setup

**Purpose:** Guide to DeviantArt OAuth configuration and integration
**Last Updated:** 2026-01-05 (v0.1.0-alpha.5)

---

## OAuth Application Setup

### Register Application

1. Go to [DeviantArt Developer Portal](https://www.deviantart.com/developers)
2. Create new application
3. Fill in application details:
   - **Name:** "Isekai Core"
   - **Description:** "DeviantArt automation and scheduling tool"
   - **Redirect URI:** `http://localhost:4000/api/auth/deviantart/callback` (development)
   - **Production:** `https://api.yourdomain.com/api/auth/deviantart/callback`

### OAuth Credentials

**Client ID:** `1234567` (public)
**Client Secret:** `abc123xyz789` (secret, store in env)

### Environment Variables

```bash
DEVIANTART_CLIENT_ID=1234567
DEVIANTART_CLIENT_SECRET=abc123xyz789
DEVIANTART_REDIRECT_URI=http://localhost:4000/api/auth/deviantart/callback
```

---

## OAuth Scopes

**Requested Scopes:**
```
user browse stash publish note message gallery
```

| Scope | Purpose | Required |
|-------|---------|----------|
| `user` | Basic user info (username, ID, avatar) | Yes |
| `browse` | Browse DeviantArt content | Yes |
| `stash` | Upload files to stash | Yes |
| `publish` | Publish deviations | Yes |
| `note` | Send notes (future feature) | Optional |
| `message` | Send messages (future feature) | Optional |
| `gallery` | Manage galleries/folders | Yes |

**Why These Scopes?**
- `user`: Identify user, display profile info
- `browse`: Browse content for inspiration
- `stash`: Upload deviation files before publishing
- `publish`: Submit deviations to DeviantArt
- `gallery`: Organize deviations into folders

---

## OAuth Flow Implementation

See `.context/auth/overview.md` for complete flow.

**Key Endpoints:**
- Authorize: `https://www.deviantart.com/oauth2/authorize`
- Token: `https://www.deviantart.com/oauth2/token`
- User Info: `https://www.deviantart.com/api/v1/oauth2/user/whoami`

---

## Callback Handling

**Success:**
- User authorized
- Tokens stored
- Session created
- Redirect to frontend dashboard

**Error Codes:**
- `access_denied`: User declined authorization
- `invalid_request`: Malformed OAuth request
- `missing_code`: No authorization code received

---

## Token Refresh

**Access Token:** 1 hour expiry
**Refresh Token:** 90 days expiry

**Refresh Request:**
```http
POST https://www.deviantart.com/oauth2/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
&client_id=1234567
&client_secret=abc123xyz789
&refresh_token=def456ghi789
```

**Response:**
```json
{
  "access_token": "new_access_token",
  "refresh_token": "new_refresh_token",
  "expires_in": 3600
}
```

---

## Security Considerations

1. **HTTPS Only:** Production must use HTTPS
2. **Secure Cookies:** Set `secure: true` in production
3. **CSRF Protection:** Use `state` parameter (planned)
4. **Token Encryption:** Store tokens encrypted (AES-256-GCM)

---

## Related Documentation

- `.context/auth/overview.md` - Complete OAuth flow
- `.context/auth/security.md` - Token encryption
