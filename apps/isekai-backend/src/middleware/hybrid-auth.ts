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

import { Request, Response, NextFunction } from 'express';
import { prisma } from '../db/index.js';
import { hashApiKey, isValidApiKeyFormat } from '../lib/api-key-utils.js';
import type { User } from '../db/index.js';

/**
 * Hybrid authentication middleware
 * Supports both:
 * 1. Session authentication (for web frontend)
 * 2. API key authentication (for API access)
 */
export async function hybridAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  // Try API key authentication first (Authorization header)
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    return await apiKeyAuth(req, res, next);
  }

  // Fall back to session authentication
  return await sessionAuth(req, res, next);
}

/**
 * API key authentication
 */
async function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization!;
  const apiKey = authHeader.substring(7); // Remove "Bearer "

  // Validate format
  if (!isValidApiKeyFormat(apiKey)) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid API key format',
    });
  }

  try {
    // Hash the key and lookup in database
    const keyHash = hashApiKey(apiKey);

    const apiKeyRecord = await prisma.apiKey.findFirst({
      where: {
        keyHash,
        revokedAt: null, // Only active keys
      },
      include: {
        user: true,
      },
    });

    if (!apiKeyRecord || !apiKeyRecord.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or revoked API key',
      });
    }

    // Update last used timestamp (async, don't await)
    prisma.apiKey
      .update({
        where: { id: apiKeyRecord.id },
        data: { lastUsedAt: new Date() },
      })
      .catch((err) => console.error('Failed to update lastUsedAt:', err));

    // Attach user to request (same as session auth)
    req.user = apiKeyRecord.user;
    req.apiKeyAuth = {
      apiKeyId: apiKeyRecord.id,
      userId: apiKeyRecord.userId,
    };

    next();
  } catch (error) {
    console.error('API key auth error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

/**
 * Session authentication
 */
async function sessionAuth(req: Request, res: Response, next: NextFunction) {
  const userId = req.session.userId;

  if (!userId) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Please log in or provide an API key',
    });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      req.session.destroy((err) => {
        if (err) console.error('[Auth] Session destroy error:', err);
      });
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not found',
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Session auth error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
