# API Response Formats

**Purpose:** Standard response structures, pagination patterns, and error formats
**Last Updated:** 2026-01-05 (v0.1.0-alpha.5)

---

## Overview

All API endpoints return JSON with consistent structure and HTTP status codes.

**Content-Type:** `application/json; charset=utf-8`

---

## Success Responses

### Simple Success (200 OK)

**Single Resource:**

```json
{
  "deviation": {
    "id": "deviation-uuid",
    "title": "My Artwork",
    "status": "published"
  }
}
```

**Multiple Resources:**

```json
{
  "deviations": [
    { "id": "uuid-1", "title": "Artwork 1" },
    { "id": "uuid-2", "title": "Artwork 2" }
  ]
}
```

### Created (201 Created)

**Resource Creation:**

```json
{
  "deviation": {
    "id": "deviation-uuid",
    "title": "My Artwork",
    "createdAt": "2025-01-10T14:00:00Z"
  }
}
```

**Batch Creation:**

```json
{
  "created": 5,
  "skipped": 2,
  "message": "Added 5 deviation(s) to sale queue",
  "items": [
    /* created items */
  ]
}
```

### No Content (204 No Content)

**Deletion:**

```http
HTTP/1.1 204 No Content
```

**No response body.** Used for DELETE operations.

---

## Pagination Patterns

### Offset-Based Pagination

**Request:**

```http
GET /api/deviations?page=2&limit=20
```

**Response:**

```json
{
  "deviations": [
    /* 20 items */
  ],
  "total": 142,
  "page": 2,
  "limit": 20,
  "totalPages": 8
}
```

**Calculation:**

```typescript
const offset = (page - 1) * limit;
const totalPages = Math.ceil(total / limit);
```

**Use Cases:** Deviations list, sale queue, automation logs.

### Cursor-Based Pagination

**Request:**

```http
GET /api/browse/home?offset=24&limit=24
```

**Response:**

```json
{
  "deviations": [
    /* 24 items */
  ],
  "hasMore": true,
  "nextOffset": 48,
  "estimatedTotal": 500
}
```

**Next Page Request:**

```http
GET /api/browse/home?offset=48&limit=24
```

**Use Cases:** Browse results (DeviantArt API uses offset-based cursor).

**Why Not Page Number?** DeviantArt API uses offsets, not page numbers.

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

### 400 Bad Request

**Validation Error:**

```json
{
  "error": "Validation error",
  "code": "VALIDATION_ERROR",
  "details": {
    "field": "scheduledAt",
    "message": "Scheduled time must be at least 1 hour in the future",
    "value": "2025-01-10T13:30:00Z"
  }
}
```

**Zod Validation:**

```json
{
  "error": "Validation error",
  "code": "VALIDATION_ERROR",
  "details": {
    "issues": [
      {
        "path": ["title"],
        "message": "String must contain at least 1 character(s)"
      },
      {
        "path": ["tags"],
        "message": "Expected array, received string"
      }
    ]
  }
}
```

**Invalid JSON:**

```json
{
  "error": "Invalid JSON"
}
```

### 401 Unauthorized

**Not Authenticated:**

```json
{
  "error": "Unauthorized",
  "code": "UNAUTHORIZED"
}
```

**Token Expired:**

```json
{
  "error": "DeviantArt authentication expired. Please re-connect your account.",
  "code": "REFRESH_TOKEN_EXPIRED"
}
```

### 403 Forbidden

**Insufficient Permissions:**

```json
{
  "error": "Insufficient permissions",
  "code": "FORBIDDEN"
}
```

**Admin Required:**

```json
{
  "error": "Admin access required",
  "code": "ADMIN_REQUIRED"
}
```

### 404 Not Found

**Resource Not Found:**

```json
{
  "error": "Deviation not found",
  "code": "NOT_FOUND"
}
```

**Ownership Check Failed:**

```json
{
  "error": "Deviation not found or not owned by user",
  "code": "NOT_FOUND"
}
```

### 409 Conflict

**Duplicate Resource:**

```json
{
  "error": "Deviation already in queue",
  "code": "CONFLICT"
}
```

**State Conflict:**

```json
{
  "error": "Cannot update automation while it is executing. Please try again in a moment.",
  "code": "CONFLICT"
}
```

### 429 Too Many Requests

**Rate Limit Exceeded:**

```json
{
  "error": "Too many requests. Try again later.",
  "code": "RATE_LIMITED",
  "retryAfter": 60
}
```

**DeviantArt Rate Limit:**

```json
{
  "error": "Rate limited by DeviantArt. Please try again later.",
  "code": "DEVIANTART_RATE_LIMITED",
  "retryAfter": 300
}
```

### 500 Internal Server Error

**Generic Server Error:**

```json
{
  "error": "Internal server error",
  "code": "INTERNAL_ERROR"
}
```

**Database Error:**

```json
{
  "error": "Database operation failed",
  "code": "DATABASE_ERROR"
}
```

**Upstream Service Error:**

```json
{
  "error": "Failed to fetch data from DeviantArt",
  "code": "UPSTREAM_ERROR",
  "details": {
    "service": "DeviantArt API",
    "endpoint": "/browse/home"
  }
}
```

---

## Date/Time Format

### ISO 8601 Format

**All timestamps use ISO 8601 UTC:**

```json
{
  "createdAt": "2025-01-10T14:00:00.000Z",
  "updatedAt": "2025-01-10T15:30:45.123Z",
  "scheduledAt": "2025-01-15T14:00:00.000Z"
}
```

**Format:** `YYYY-MM-DDTHH:mm:ss.sssZ`

**Parsing:**

```typescript
// JavaScript
const date = new Date(createdAt);

// TypeScript with date-fns
import { parseISO } from 'date-fns';
const date = parseISO(createdAt);
```

### Null Timestamps

**Nullable fields return `null`:**

```json
{
  "publishedAt": null,
  "scheduledAt": null
}
```

**Not empty string or undefined.**

---

## Numeric Formats

### Prices (Cents)

**All prices in cents (integer):**

```json
{
  "price": 5000, // $50.00
  "minPrice": 3000, // $30.00
  "maxPrice": 10000 // $100.00
}
```

**Display:**

```typescript
const dollars = price / 100;
const formatted = `$${dollars.toFixed(2)}`; // "$50.00"
```

### Counts

**Always integers:**

```json
{
  "total": 142,
  "completed": 98,
  "pending": 44
}
```

### Stats

**May include zeros:**

```json
{
  "stats": {
    "favourites": 0,
    "comments": 0,
    "views": 0,
    "downloads": 0
  }
}
```

---

## Array Formats

### Empty Arrays

**Always return empty array, never `null`:**

```json
{
  "deviations": [],
  "tags": [],
  "files": []
}
```

### Arrays with Metadata

**Include count or total:**

```json
{
  "deviations": [
    /* items */
  ],
  "total": 5,
  "_count": {
    "scheduleRules": 2,
    "defaultValues": 3
  }
}
```

---

## Nested Resources

### Shallow Nesting

**Include only essential fields:**

```json
{
  "deviation": {
    "id": "deviation-uuid",
    "title": "My Artwork",
    "user": {
      "id": "user-uuid",
      "username": "artist"
    }
  }
}
```

### Deep Nesting

**Include full related objects when needed:**

```json
{
  "automation": {
    "id": "automation-uuid",
    "name": "Daily Posts",
    "scheduleRules": [
      {
        "id": "rule-uuid",
        "type": "fixed_time",
        "timeOfDay": "14:00"
      }
    ],
    "defaultValues": [
      {
        "id": "default-uuid",
        "fieldName": "tags",
        "value": ["digital art"]
      }
    ]
  }
}
```

### Select Fields

**Use Prisma select to optimize:**

```typescript
await prisma.deviation.findMany({
  select: {
    id: true,
    title: true,
    deviationUrl: true,
    publishedAt: true,
  },
});
```

**Response:**

```json
{
  "deviations": [
    {
      "id": "uuid",
      "title": "Artwork",
      "deviationUrl": "https://...",
      "publishedAt": "2025-01-10T14:00:00Z"
    }
  ]
}
```

---

## Boolean Flags

### True/False

**Never use 1/0 or "true"/"false" strings:**

```json
{
  "enabled": true,
  "isMature": false,
  "allowComments": true
}
```

### Nullable Booleans

**Use `null` for unknown/not-set:**

```json
{
  "stashOnly": null // User hasn't set preference
}
```

---

## Enum Values

### String Enums

**Use lowercase with underscores:**

```json
{
  "status": "scheduled",
  "matureLevel": "moderate",
  "draftSelectionMethod": "random",
  "type": "fixed_time"
}
```

**Not camelCase or UPPER_CASE.**

### Enum Arrays

**Days of week:**

```json
{
  "daysOfWeek": ["monday", "wednesday", "friday"]
}
```

---

## File/Image URLs

### Presigned URLs

**Time-limited signed URLs:**

```json
{
  "uploadUrl": "https://r2.example.com/presigned?X-Amz-Signature=...",
  "downloadUrl": "https://r2.example.com/presigned?X-Amz-Signature=...",
  "expiresIn": 3600
}
```

**Expiration:** Typically 1 hour (3600 seconds).

### DeviantArt URLs

**Permanent URLs:**

```json
{
  "deviationUrl": "https://www.deviantart.com/artist/art/Title-123456",
  "thumbUrl": "https://images-wixmp-ed30a86b8c4ca887773594c2.wixmp.com/...",
  "avatarUrl": "https://a.deviantart.net/avatars/..."
}
```

---

## Metadata Fields

### Optional Fields

**Use `null` for absent optional fields:**

```json
{
  "description": null,
  "categoryPath": null,
  "automationId": null
}
```

**Not empty string or `undefined`.**

### Default Values

**Explicitly return defaults:**

```json
{
  "allowComments": true, // Default
  "allowFreeDownload": false, // Default
  "displayResolution": 0 // Default (original)
}
```

---

## Batch Operations

### Batch Creation

```json
{
  "created": 5,
  "skipped": 2,
  "message": "Added 5 deviation(s) to sale queue",
  "items": [{ "id": "uuid-1" /* ... */ }, { "id": "uuid-2" /* ... */ }]
}
```

### Batch Deletion

```json
{
  "deleted": 3,
  "message": "Deleted 3 item(s)"
}
```

### Batch Update

```json
{
  "updated": 10,
  "message": "Updated 10 deviation(s)"
}
```

---

## Status Messages

### Confirmation Messages

**Include action and count:**

```json
{
  "message": "Deviation scheduled successfully"
}
```

```json
{
  "message": "Added 5 deviation(s) to sale queue"
}
```

### Warning Messages

**Include warning in separate field:**

```json
{
  "created": 3,
  "skipped": 2,
  "message": "Added 3 deviation(s) to sale queue",
  "warning": "Some deviations not found or not published"
}
```

---

## Related Documentation

- `.context/api/endpoints.md` - All API routes
- `.context/api/headers.md` - Auth and CORS
- `.context/errors.md` - Error codes catalog
- `.context/glossary.md` - Status/enum definitions
