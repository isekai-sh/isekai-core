# API Endpoints Reference

**Purpose:** Complete reference for all REST API endpoints in Isekai Core
**Last Updated:** 2026-01-05 (v0.1.0-alpha.5)

---

## Overview

**Base URL:** `http://localhost:4000/api` (development)

**Authentication:** Most endpoints require session authentication (cookie-based) or API key (for ComfyUI integration).

**Response Format:** All endpoints return JSON with consistent structure:

**Success:**
```json
{
  "data": { /* response data */ }
}
```

**Error:**
```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": { /* optional error context */ }
}
```

---

## Route Groups

| Group | Base Path | Auth | Description |
|-------|-----------|------|-------------|
| Health | `/api/health` | Public | Health check, cache stats |
| Auth | `/api/auth` | Public | OAuth login, logout |
| Config | `/api/config` | Public | Instance configuration |
| Deviations | `/api/deviations` | Session | Deviation CRUD, scheduling |
| Uploads | `/api/uploads` | Session | File upload (presigned URLs) |
| DeviantArt | `/api/deviantart` | Session | DeviantArt API proxy |
| Browse | `/api/browse` | Session | Browse DeviantArt content |
| Galleries | `/api/galleries` | Session | Gallery/folder management |
| Templates | `/api/templates` | Session | Metadata templates |
| Cache | `/api/cache` | Session | Cache management |
| API Keys | `/api/api-keys` | Session | API key management |
| Review | `/api/review` | Session | Review management |
| Price Presets | `/api/price-presets` | Session | Price preset management |
| Sale Queue | `/api/sale-queue` | Hybrid | Sale queue management |
| Automations | `/api/automations` | Session | Automation workflows |
| Schedule Rules | `/api/automation-schedule-rules` | Session | Automation schedule rules |
| Default Values | `/api/automation-default-values` | Session | Automation default values |
| ComfyUI | `/api/comfyui` | API Key | ComfyUI integration |
| Admin | `/api/admin` | Session + Admin | Admin-only routes |

---

## Health & Config

### GET /api/health

**Auth:** Public

**Description:** Health check with cache stats.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-01-10T14:00:00Z",
  "cache": {
    "redis": "connected",
    "keys": 1234,
    "memory": "15.2 MB"
  }
}
```

### GET /api/config

**Auth:** Public

**Description:** Get instance configuration (whitelabel settings).

**Response:**
```json
{
  "instanceName": "My Isekai Instance",
  "customLogo": null,
  "teamInvitesEnabled": false
}
```

---

## Authentication

### GET /api/auth/login

**Auth:** Public

**Description:** Redirect to DeviantArt OAuth login.

**Response:** `302 Redirect` to DeviantArt OAuth page.

### GET /api/auth/callback

**Auth:** Public (OAuth callback)

**Description:** OAuth callback handler. Sets session cookie and redirects to frontend.

**Query Params:**
- `code`: OAuth authorization code
- `state`: CSRF token

**Response:** `302 Redirect` to frontend dashboard.

### GET /api/auth/logout

**Auth:** Session

**Description:** Destroy session and logout.

**Response:**
```json
{
  "message": "Logged out successfully"
}
```

### GET /api/auth/me

**Auth:** Session

**Description:** Get current user info.

**Response:**
```json
{
  "user": {
    "id": "user-uuid",
    "deviantartId": "123456",
    "deviantartUsername": "artist",
    "email": "artist@example.com",
    "avatarUrl": "https://a.deviantart.net/avatars/...",
    "timezone": "America/Los_Angeles",
    "createdAt": "2025-01-01T00:00:00Z"
  }
}
```

---

## Deviations

### GET /api/deviations

**Auth:** Session

**Description:** List user's deviations with pagination.

**Query Params:**
- `status`: Filter by status (optional)
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20, max: 100)

**Response:**
```json
{
  "deviations": [
    {
      "id": "deviation-uuid",
      "title": "My Artwork",
      "description": "...",
      "status": "published",
      "deviationUrl": "https://www.deviantart.com/...",
      "files": [/* DeviationFile[] */],
      "createdAt": "2025-01-10T14:00:00Z"
    }
  ],
  "total": 42
}
```

### GET /api/deviations/:id

**Auth:** Session

**Description:** Get single deviation with files.

**Response:** Single deviation object.

### POST /api/deviations

**Auth:** Session

**Description:** Create new deviation.

**Body:**
```json
{
  "title": "My Artwork",
  "description": "Created with digital painting",
  "tags": ["digital art", "fantasy"],
  "uploadMode": "single"
}
```

**Response:** Created deviation object.

### PATCH /api/deviations/:id

**Auth:** Session

**Description:** Update deviation metadata.

**Body:** Partial deviation object (any fields).

**Response:** Updated deviation object.

### DELETE /api/deviations/:id

**Auth:** Session

**Description:** Delete deviation and associated files.

**Response:** `204 No Content`

### POST /api/deviations/:id/schedule

**Auth:** Session

**Rate Limit:** Tier-based

**Description:** Schedule deviation for publishing.

**Body:**
```json
{
  "scheduledAt": "2025-01-15T14:00:00Z"
}
```

**Validation:**
- Must be at least 1 hour in future
- Max 365 days in future

**Response:** Updated deviation with `status: "scheduled"`.

### POST /api/deviations/:id/publish

**Auth:** Session

**Rate Limit:** Tier-based

**Description:** Publish deviation immediately.

**Response:** Deviation queued for immediate publishing.

### POST /api/deviations/:id/unschedule

**Auth:** Session

**Description:** Cancel scheduled deviation.

**Response:** Deviation moved back to `draft` status.

---

## Uploads

### POST /api/uploads/presigned-url

**Auth:** Session

**Description:** Get presigned URL for uploading file to storage (R2/S3/MinIO).

**Body:**
```json
{
  "deviationId": "deviation-uuid",
  "filename": "artwork.png",
  "contentType": "image/png",
  "fileSize": 2048576
}
```

**Response:**
```json
{
  "uploadUrl": "https://r2.example.com/presigned?...",
  "fileId": "file-uuid",
  "storageKey": "deviations/deviation-uuid/artwork.png"
}
```

**Client Flow:**
1. Call `/api/uploads/presigned-url`
2. Upload file to `uploadUrl` with PUT request
3. Call `/api/uploads/confirm` with `fileId`

### POST /api/uploads/confirm

**Auth:** Session

**Description:** Confirm file upload and create DeviationFile record.

**Body:**
```json
{
  "fileId": "file-uuid"
}
```

**Response:**
```json
{
  "file": {
    "id": "file-uuid",
    "deviationId": "deviation-uuid",
    "filename": "artwork.png",
    "mimeType": "image/png",
    "fileSize": 2048576,
    "width": 1920,
    "height": 1080,
    "storageKey": "deviations/deviation-uuid/artwork.png"
  }
}
```

### DELETE /api/uploads/:fileId

**Auth:** Session

**Description:** Delete file from storage and database.

**Response:** `204 No Content`

---

## DeviantArt Proxy

### GET /api/deviantart/whoami

**Auth:** Session

**Description:** Get current DeviantArt user info (whoami endpoint).

**Response:**
```json
{
  "username": "artist",
  "userid": "123456",
  "usericon": "https://a.deviantart.net/avatars/...",
  "type": "regular"
}
```

### GET /api/deviantart/folders

**Auth:** Session

**Description:** List user's galleries/folders.

**Response:**
```json
{
  "folders": [
    {
      "folderid": "abc123",
      "name": "Featured",
      "size": 42,
      "parent": null
    }
  ]
}
```

---

## Browse

**See `.context/features/browse.md` for detailed browse documentation.**

### GET /api/browse/:mode

**Auth:** Session

**Description:** Browse DeviantArt content by mode.

**Modes:** `home`, `daily`, `following`, `tags`, `topic`, `user-gallery`

**Query Params:**
- `offset`: Pagination offset (default: 0)
- `limit`: Items per page (default: 24, max: 50)
- `tag`: Tag name (for `tags` mode)
- `topic`: Topic canonical name (for `topic` mode)
- `username`: Username (for `user-gallery` mode)
- `date`: Date in YYYY-MM-DD format (for `daily` mode)
- `mature_content`: Include mature content (default: false)

**Response:**
```json
{
  "deviations": [/* BrowseDeviation[] */],
  "hasMore": true,
  "nextOffset": 24,
  "estimatedTotal": 500
}
```

### GET /api/browse/tags/search

**Auth:** Session

**Description:** Tag autocomplete.

**Query Params:**
- `tag_name`: Search query (min 2 characters)

**Response:**
```json
{
  "tags": ["fantasy", "fantasy art", "fantasy character"]
}
```

### GET /api/browse/topics/list

**Auth:** Session

**Description:** List all topics with sample deviations.

**Response:**
```json
{
  "topics": [
    {
      "name": "Digital Art",
      "canonicalName": "digitalart",
      "exampleDeviations": [/* up to 4 deviations */]
    }
  ],
  "hasMore": false
}
```

### GET /api/browse/deviation/:deviationId

**Auth:** Session

**Description:** Get full deviation details.

**Response:** Full deviation object with metadata, stats, download URL.

---

## Galleries

### GET /api/galleries

**Auth:** Session

**Description:** List user's galleries/folders (cached).

**Response:**
```json
{
  "folders": [
    {
      "folderid": "abc123",
      "name": "Featured",
      "size": 42,
      "parent": null
    }
  ]
}
```

---

## Templates

### GET /api/templates

**Auth:** Session

**Description:** List user's templates.

**Query Params:**
- `type`: Filter by type (optional): `tag`, `description`, `comment`

**Response:**
```json
{
  "templates": [
    {
      "id": "template-uuid",
      "name": "Fantasy Tags",
      "type": "tag",
      "content": {
        "tags": ["fantasy", "digital art", "character design"]
      }
    }
  ]
}
```

### POST /api/templates

**Auth:** Session

**Description:** Create template.

**Body:**
```json
{
  "name": "Fantasy Tags",
  "type": "tag",
  "content": {
    "tags": ["fantasy", "digital art"]
  }
}
```

### PATCH /api/templates/:id

**Auth:** Session

**Description:** Update template.

### DELETE /api/templates/:id

**Auth:** Session

**Description:** Delete template.

---

## Cache Management

### DELETE /api/cache/galleries

**Auth:** Session

**Description:** Clear gallery cache for current user.

**Response:**
```json
{
  "message": "Gallery cache cleared"
}
```

### DELETE /api/cache/browse

**Auth:** Session

**Description:** Clear browse cache for current user.

---

## API Keys

### GET /api/api-keys

**Auth:** Session

**Description:** List user's API keys (shows only prefix, not full key).

**Response:**
```json
{
  "apiKeys": [
    {
      "id": "key-uuid",
      "name": "ComfyUI Integration",
      "keyPrefix": "isk_live_",
      "lastUsed": "2025-01-10T14:00:00Z",
      "createdAt": "2025-01-01T00:00:00Z"
    }
  ]
}
```

### POST /api/api-keys

**Auth:** Session

**Description:** Create API key.

**Body:**
```json
{
  "name": "ComfyUI Integration"
}
```

**Response:**
```json
{
  "apiKey": {
    "id": "key-uuid",
    "name": "ComfyUI Integration",
    "key": "isk_live_abc123def456...",  // ONLY shown once
    "keyPrefix": "isk_live_"
  }
}
```

**⚠️ IMPORTANT:** Full key is only returned once. Store securely.

### DELETE /api/api-keys/:id

**Auth:** Session

**Description:** Revoke API key.

---

## Review Management

### GET /api/review

**Auth:** Session

**Description:** List deviations in review status.

### POST /api/review/:id/approve

**Auth:** Session

**Description:** Approve deviation (move to draft).

### POST /api/review/:id/reject

**Auth:** Session

**Description:** Reject deviation (delete).

---

## Price Presets

### GET /api/price-presets

**Auth:** Session

**Description:** List price presets.

**Response:**
```json
{
  "presets": [
    {
      "id": "preset-uuid",
      "name": "Standard $50",
      "price": 5000,
      "minPrice": null,
      "maxPrice": null,
      "currency": "USD",
      "isDefault": true
    }
  ]
}
```

### POST /api/price-presets

**Auth:** Session

**Description:** Create price preset.

**Body:**
```json
{
  "name": "Variable $30-100",
  "price": 5000,
  "minPrice": 3000,
  "maxPrice": 10000,
  "currency": "USD",
  "isDefault": false
}
```

### PATCH /api/price-presets/:id

**Auth:** Session

**Description:** Update price preset.

### DELETE /api/price-presets/:id

**Auth:** Session

**Description:** Delete price preset.

---

## Sale Queue

**See `.context/features/sales-queue.md` for detailed documentation.**

### GET /api/sale-queue

**Auth:** Hybrid (Session or API Key)

**Description:** List sale queue items.

**Query Params:**
- `status`: Filter by status (optional)
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 50, max: 100)

### POST /api/sale-queue

**Auth:** Hybrid

**Description:** Add deviations to sale queue (batch up to 50).

**Body:**
```json
{
  "deviationIds": ["deviation-uuid-1", "deviation-uuid-2"],
  "pricePresetId": "preset-uuid"
}
```

### PATCH /api/sale-queue/:id

**Auth:** Hybrid

**Description:** Update queue item status.

### DELETE /api/sale-queue/:id

**Auth:** Hybrid

**Description:** Remove from queue.

---

## Automations

**See `.context/features/automation.md` for detailed documentation.**

### GET /api/automations

**Auth:** Session

**Description:** List user's automation workflows.

**Response:**
```json
{
  "automations": [
    {
      "id": "automation-uuid",
      "name": "Daily Posts",
      "enabled": true,
      "draftSelectionMethod": "random",
      "jitterMinSeconds": 0,
      "jitterMaxSeconds": 300,
      "scheduleRules": [/* AutomationScheduleRule[] */],
      "_count": {
        "scheduleRules": 2,
        "defaultValues": 3
      }
    }
  ]
}
```

### GET /api/automations/:id

**Auth:** Session

**Description:** Get single automation with full details (rules, default values, logs).

### POST /api/automations

**Auth:** Session

**Description:** Create automation workflow.

**Body:**
```json
{
  "name": "Daily Posts",
  "draftSelectionMethod": "random",
  "jitterMinSeconds": 0,
  "jitterMaxSeconds": 300,
  "autoAddToSaleQueue": false
}
```

### PATCH /api/automations/:id

**Auth:** Session

**Description:** Update automation config.

### DELETE /api/automations/:id

**Auth:** Session

**Description:** Delete automation (cascades rules, defaults, logs).

### POST /api/automations/:id/toggle

**Auth:** Session

**Description:** Toggle automation enabled state.

### PATCH /api/automations/reorder

**Auth:** Session

**Description:** Reorder automations (update sortOrder).

**Body:**
```json
{
  "automationIds": ["uuid-1", "uuid-2", "uuid-3"]
}
```

### GET /api/automations/:id/logs

**Auth:** Session

**Description:** Get execution logs (paginated).

**Query Params:**
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20)

---

## Automation Schedule Rules

### GET /api/automation-schedule-rules

**Auth:** Session

**Description:** List rules for automation.

**Query Params:**
- `automationId`: Automation ID (required)

### POST /api/automation-schedule-rules

**Auth:** Session

**Description:** Create schedule rule.

**Body (Fixed Time):**
```json
{
  "automationId": "automation-uuid",
  "type": "fixed_time",
  "timeOfDay": "14:00",
  "daysOfWeek": ["monday", "wednesday", "friday"],
  "priority": 1
}
```

**Body (Fixed Interval):**
```json
{
  "automationId": "automation-uuid",
  "type": "fixed_interval",
  "intervalMinutes": 240,
  "deviationsPerInterval": 2,
  "priority": 1
}
```

**Body (Daily Quota):**
```json
{
  "automationId": "automation-uuid",
  "type": "daily_quota",
  "dailyQuota": 5,
  "priority": 1
}
```

### PATCH /api/automation-schedule-rules/:id

**Auth:** Session

**Description:** Update schedule rule.

### DELETE /api/automation-schedule-rules/:id

**Auth:** Session

**Description:** Delete schedule rule.

---

## Automation Default Values

### GET /api/automation-default-values

**Auth:** Session

**Description:** List default values for automation.

**Query Params:**
- `automationId`: Automation ID (required)

### POST /api/automation-default-values

**Auth:** Session

**Description:** Create default value.

**Body:**
```json
{
  "automationId": "automation-uuid",
  "fieldName": "tags",
  "value": ["digital art", "fantasy"],
  "applyIfEmpty": true
}
```

**Supported Fields:** `description`, `tags`, `isMature`, `matureLevel`, `categoryPath`, `galleryIds`, `isAiGenerated`, `noAi`, `allowComments`, `allowFreeDownload`, `addWatermark`, `displayResolution`, `stashOnly`

### PATCH /api/automation-default-values/:id

**Auth:** Session

**Description:** Update default value.

### DELETE /api/automation-default-values/:id

**Auth:** Session

**Description:** Delete default value.

---

## ComfyUI Integration

### POST /api/comfyui/deviations

**Auth:** API Key (header: `X-API-Key: isk_live_...`)

**Description:** Create deviation from ComfyUI workflow.

**Body:**
```json
{
  "title": "AI Generated Art",
  "description": "Generated with ComfyUI",
  "tags": ["ai art", "comfyui"],
  "fileUrl": "https://example.com/output.png",
  "scheduledAt": "2025-01-15T14:00:00Z"
}
```

**Response:** Created deviation object.

---

## Admin

### GET /api/admin/users

**Auth:** Session + Admin Role

**Description:** List all users (admin only).

### GET /api/admin/stats

**Auth:** Session + Admin Role

**Description:** Get instance statistics.

**Response:**
```json
{
  "users": 10,
  "deviations": 500,
  "published": 350,
  "scheduled": 50
}
```

---

## Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `UNAUTHORIZED` | 401 | Not authenticated |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Invalid request body |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |

---

## Rate Limiting

**Scheduling Endpoints:**
- `/api/deviations/:id/schedule`
- `/api/deviations/:id/publish`

**Limits:** Configured via middleware (see `.context/api/headers.md`).

---

## Related Documentation

- `.context/features/automation.md` - Automation API details
- `.context/features/publishing.md` - Publishing workflow
- `.context/features/browse.md` - Browse API details
- `.context/features/sales-queue.md` - Sale queue API details
- `.context/api/headers.md` - Auth headers, CORS
- `.context/api/responses.md` - Response formats
- `.context/auth/overview.md` - OAuth flow
