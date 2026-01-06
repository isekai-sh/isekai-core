/*
 * Copyright (C) 2025 Isekai
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/index.js";
import { AppError } from "../middleware/error.js";
import { generateApiKey } from "../lib/api-key-utils.js";

const router = Router();

const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
});

// List all API keys for the user
router.get("/", async (req, res) => {
  const user = req.user!;

  const userApiKeys = await prisma.apiKey.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  // Transform to omit sensitive data
  const safeKeys = userApiKeys.map((key) => ({
    id: key.id,
    name: key.name,
    keyPrefix: key.keyPrefix,
    lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
    createdAt: key.createdAt.toISOString(),
    revokedAt: key.revokedAt?.toISOString() ?? null,
    isActive: key.revokedAt === null,
  }));

  res.json({ apiKeys: safeKeys });
});

// Create new API key
router.post("/", async (req, res) => {
  const user = req.user!;

  const data = createApiKeySchema.parse(req.body);

  // Generate key
  const { key, hash, prefix } = generateApiKey();

  // Store in database
  const newApiKey = await prisma.apiKey.create({
    data: {
      userId: user.id,
      name: data.name,
      keyHash: hash,
      keyPrefix: prefix,
    },
  });

  // Return the raw key ONLY on creation (never again)
  res.status(201).json({
    id: newApiKey.id,
    name: newApiKey.name,
    key: key, // RAW KEY - shown once
    keyPrefix: prefix,
    createdAt: newApiKey.createdAt.toISOString(),
  });
});

// Revoke API key (soft delete)
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  const user = req.user!;

  const apiKey = await prisma.apiKey.findFirst({
    where: {
      id,
      userId: user.id,
    },
  });

  if (!apiKey) {
    throw new AppError(404, "API key not found");
  }

  if (apiKey.revokedAt !== null) {
    throw new AppError(400, "API key already revoked");
  }

  // Soft delete by setting revokedAt
  await prisma.apiKey.update({
    where: { id },
    data: { revokedAt: new Date() },
  });

  res.status(204).send();
});

// Permanently delete API key (hard delete)
router.delete("/:id/permanent", async (req, res) => {
  const { id } = req.params;
  const user = req.user!;

  const apiKey = await prisma.apiKey.findFirst({
    where: {
      id,
      userId: user.id,
    },
  });

  if (!apiKey) {
    throw new AppError(404, "API key not found");
  }

  // Hard delete - permanently remove from database
  await prisma.apiKey.delete({
    where: { id },
  });

  res.status(204).send();
});

export { router as apiKeysRouter };
