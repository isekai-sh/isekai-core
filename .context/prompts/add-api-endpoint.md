# Prompt: Add API Endpoint

**Purpose:** Guide for adding a new REST API endpoint to Isekai Core

---

## Prerequisites

Before starting, ensure you have:
- [ ] Local development environment running
- [ ] Database schema updated (if new models needed)
- [ ] Prisma client generated
- [ ] Shared package built

---

## Step 1: Define Requirements

**Questions to Answer:**
1. What is the endpoint's purpose?
2. What HTTP method (GET, POST, PUT, DELETE, PATCH)?
3. What are the request parameters?
4. What is the response format?
5. Who can access it (authentication required)?
6. What are the validation rules?

**Example:**
```
Purpose: Get all automations for authenticated user
Method: GET
Path: /api/automations
Auth: Required (session-based)
Response: { automations: Automation[] }
```

---

## Step 2: Create Route Handler

**Location:** `apps/isekai-backend/src/routes/my-endpoint.ts`

**Template:**

```typescript
/*
 * Copyright (C) 2026 Isekai
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { asyncHandler } from "../middleware/async-handler";
import { requireAuth } from "../middleware/auth";

const router = Router();

// Request validation schema
const createRequestSchema = z.object({
  name: z.string().min(1).max(255),
  enabled: z.boolean().optional().default(true),
});

/**
 * GET /api/my-endpoint
 * Get all items for authenticated user
 */
router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.session.user!.id;

    const items = await prisma.myModel.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    res.json({ items });
  })
);

/**
 * POST /api/my-endpoint
 * Create a new item
 */
router.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.session.user!.id;

    // Validate request body
    const data = createRequestSchema.parse(req.body);

    // Create item
    const item = await prisma.myModel.create({
      data: {
        ...data,
        userId,
      },
    });

    res.status(201).json({ item });
  })
);

/**
 * GET /api/my-endpoint/:id
 * Get a single item by ID
 */
router.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.session.user!.id;
    const { id } = req.params;

    const item = await prisma.myModel.findFirst({
      where: { id, userId },
    });

    if (!item) {
      return res.status(404).json({ error: "Item not found" });
    }

    res.json({ item });
  })
);

/**
 * PUT /api/my-endpoint/:id
 * Update an item
 */
router.put(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.session.user!.id;
    const { id } = req.params;

    // Validate request body
    const data = createRequestSchema.parse(req.body);

    // Check ownership
    const existing = await prisma.myModel.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return res.status(404).json({ error: "Item not found" });
    }

    // Update item
    const item = await prisma.myModel.update({
      where: { id },
      data,
    });

    res.json({ item });
  })
);

/**
 * DELETE /api/my-endpoint/:id
 * Delete an item
 */
router.delete(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.session.user!.id;
    const { id } = req.params;

    // Check ownership
    const existing = await prisma.myModel.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return res.status(404).json({ error: "Item not found" });
    }

    // Delete item
    await prisma.myModel.delete({
      where: { id },
    });

    res.status(204).send();
  })
);

export default router;
```

---

## Step 3: Register Route

**File:** `apps/isekai-backend/src/index.ts`

```typescript
import myEndpointRoutes from "./routes/my-endpoint";

// Register routes
app.use("/api/my-endpoint", myEndpointRoutes);
```

---

## Step 4: Add Tests

**Location:** `apps/isekai-backend/src/routes/my-endpoint.test.ts`

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../index";
import { prisma } from "../db";

describe("POST /api/my-endpoint", () => {
  beforeEach(async () => {
    // Clean database
    await prisma.myModel.deleteMany();
  });

  it("should create an item", async () => {
    const response = await request(app)
      .post("/api/my-endpoint")
      .send({ name: "Test Item" })
      .expect(201);

    expect(response.body.item.name).toBe("Test Item");
  });

  it("should return 401 if not authenticated", async () => {
    await request(app)
      .post("/api/my-endpoint")
      .send({ name: "Test Item" })
      .expect(401);
  });

  it("should validate request body", async () => {
    const response = await request(app)
      .post("/api/my-endpoint")
      .send({ name: "" }) // Invalid: empty name
      .expect(400);

    expect(response.body.error).toContain("validation");
  });
});
```

---

## Step 5: Update Documentation

**File:** `.context/api/endpoints.md`

Add new endpoint to API documentation:

```markdown
### POST /api/my-endpoint

Create a new item.

**Authentication:** Required (session)

**Request Body:**
```json
{
  "name": "Item Name",
  "enabled": true
}
```

**Response (201):**
```json
{
  "item": {
    "id": "abc123",
    "name": "Item Name",
    "enabled": true,
    "userId": "user123",
    "createdAt": "2025-12-21T10:00:00Z"
  }
}
```
```

---

## Step 6: Test Locally

```bash
# Start dev server
pnpm dev

# Test endpoint with curl
curl -X POST http://localhost:4000/api/my-endpoint \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Item"}'

# Run tests
pnpm --filter isekai-backend test
```

---

## Checklist

- [ ] Route handler created with AGPL license header
- [ ] Zod validation schema defined
- [ ] Authentication middleware added (if required)
- [ ] Error handling implemented
- [ ] Route registered in index.ts
- [ ] Tests written (unit + integration)
- [ ] Documentation updated in .context/api/endpoints.md
- [ ] Local testing passed
- [ ] TypeScript compiles without errors
- [ ] Linting passes

---

## Common Pitfalls

1. **Missing Authentication**
   - ❌ `router.get("/", asyncHandler(...))`
   - ✅ `router.get("/", requireAuth, asyncHandler(...))`

2. **No Ownership Check**
   - ❌ `prisma.myModel.findUnique({ where: { id } })`
   - ✅ `prisma.myModel.findFirst({ where: { id, userId } })`

3. **Missing Validation**
   - ❌ `const data = req.body`
   - ✅ `const data = createRequestSchema.parse(req.body)`

4. **Synchronous Handler**
   - ❌ `router.get("/", (req, res) => { ... })`
   - ✅ `router.get("/", asyncHandler(async (req, res) => { ... }))`

---

## Related Documentation

- `.context/api/endpoints.md` - API reference
- `.context/testing.md` - Test strategies
- `.context/ai-rules.md` - Code style
