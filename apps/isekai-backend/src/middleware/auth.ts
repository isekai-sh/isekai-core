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
import type { User } from '../db/index.js';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    instanceUserRole?: string;
  }
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const userId = req.session.userId;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Please log in' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: 'Unauthorized', message: 'User not found' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

/**
 * Middleware that requires admin role.
 * Must be used after authMiddleware.
 */
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  // First check session for cached role
  if (req.session.instanceUserRole === 'admin') {
    return next();
  }

  // Fallback: check database (handles session migration)
  if (!req.user) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required',
    });
  }

  try {
    const instanceUser = await prisma.instanceUser.findUnique({
      where: { daUserId: req.user.deviantartId },
    });

    if (!instanceUser || instanceUser.role !== 'admin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Admin access required',
      });
    }

    // Update session cache
    req.session.instanceUserRole = instanceUser.role;
    next();
  } catch (error) {
    console.error('requireAdmin middleware error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
