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

import { Router } from 'express';
import { prisma } from '../db/index.js';
import { authMiddleware, requireAdmin } from '../middleware/auth.js';
import { logger } from '../lib/logger.js';
import { env } from '../lib/env.js';
import { cleanupUserData } from '../lib/user-cleanup.js';

const router = Router();

// All admin routes require authentication and admin role
router.use(authMiddleware);
router.use(requireAdmin);

// GET /api/admin/team - List all team members
router.get('/team', async (req, res) => {
  try {
    const users = await prisma.instanceUser.findMany({
      orderBy: { createdAt: 'asc' },
    });

    res.json({
      users: users.map((user) => ({
        id: user.id,
        daUserId: user.daUserId,
        daUsername: user.daUsername,
        daAvatar: user.daAvatar,
        role: user.role,
        createdAt: user.createdAt.toISOString(),
        lastLoginAt: user.lastLoginAt?.toISOString() || null,
      })),
    });
  } catch (error) {
    logger.error('Failed to list team members', { error });
    res.status(500).json({ error: 'Failed to list team members' });
  }
});

// DELETE /api/admin/team/:id - Remove a team member (with full cleanup)
router.delete('/team/:id', async (req, res) => {
  try {
    const instanceUser = await prisma.instanceUser.findUnique({
      where: { id: req.params.id },
    });

    if (!instanceUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (instanceUser.role === 'admin') {
      return res.status(400).json({ error: 'Cannot remove admin' });
    }

    // Find the linked DA User record
    const user = await prisma.user.findUnique({
      where: { deviantartId: instanceUser.daUserId },
    });

    let cleanupResult = null;
    if (user) {
      // Full cleanup: cancel jobs, queue storage cleanup, clear cache, delete user
      cleanupResult = await cleanupUserData(user.id);
    }

    // Remove instance user record
    await prisma.instanceUser.delete({ where: { id: req.params.id } });

    logger.info('Team member removed', {
      instanceUserId: req.params.id,
      daUsername: instanceUser.daUsername,
      removedBy: req.session.userId,
      cleanup: cleanupResult,
    });

    res.json({
      success: true,
      message: 'Member removed and data cleaned up',
      cleanup: cleanupResult
        ? {
            jobsCancelled: cleanupResult.jobsCancelled,
            filesQueued: cleanupResult.filesQueued,
            cacheKeysDeleted: cleanupResult.cacheKeysDeleted,
          }
        : null,
    });
  } catch (error) {
    logger.error('Failed to remove team member', {
      id: req.params.id,
      error,
    });
    res.status(500).json({ error: 'Failed to remove team member' });
  }
});

// GET /api/admin/instance - Get instance info
router.get('/instance', async (req, res) => {
  try {
    const [instanceUserCount, daAccountCount, deviationCount, storageStats, settings] =
      await Promise.all([
        prisma.instanceUser.count(),
        prisma.user.count(),
        prisma.deviation.count(),
        prisma.deviationFile.aggregate({ _sum: { fileSize: true } }),
        prisma.instanceSettings.findUnique({ where: { id: 'singleton' } }),
      ]);

    // DB settings override env vars when set
    const teamInvitesEnabled = settings?.teamInvitesEnabled ?? env.TEAM_INVITES_ENABLED;

    res.json({
      instanceId: env.INSTANCE_ID || null,
      tier: env.MAX_DA_ACCOUNTS === 1 ? 'pro' : env.MAX_DA_ACCOUNTS > 1 ? 'agency' : 'self-hosted',
      limits: {
        maxDaAccounts: env.MAX_DA_ACCOUNTS,
        currentDaAccounts: daAccountCount,
        unlimited: env.MAX_DA_ACCOUNTS === 0,
      },
      stats: {
        teamMembers: instanceUserCount,
        deviations: deviationCount,
        storageUsedBytes: storageStats._sum.fileSize || 0,
      },
      settings: {
        teamInvitesEnabled,
        whitelabelEnabled: env.WHITELABEL_ENABLED,
      },
    });
  } catch (error) {
    logger.error('Failed to get instance info', { error });
    res.status(500).json({ error: 'Failed to get instance info' });
  }
});

// GET /api/admin/settings - Get instance settings
router.get('/settings', async (req, res) => {
  try {
    const settings = await prisma.instanceSettings.findUnique({
      where: { id: 'singleton' },
    });

    res.json({
      teamInvitesEnabled: settings?.teamInvitesEnabled ?? env.TEAM_INVITES_ENABLED,
    });
  } catch (error) {
    logger.error('Failed to get settings', { error });
    res.status(500).json({ error: 'Failed to get settings' });
  }
});

// PATCH /api/admin/settings - Update instance settings
router.patch('/settings', async (req, res) => {
  try {
    const { teamInvitesEnabled } = req.body;

    const settings = await prisma.instanceSettings.upsert({
      where: { id: 'singleton' },
      create: {
        id: 'singleton',
        teamInvitesEnabled: typeof teamInvitesEnabled === 'boolean' ? teamInvitesEnabled : null,
      },
      update: {
        teamInvitesEnabled: typeof teamInvitesEnabled === 'boolean' ? teamInvitesEnabled : null,
      },
    });

    logger.info('Instance settings updated', {
      teamInvitesEnabled: settings.teamInvitesEnabled,
      updatedBy: req.session.userId,
    });

    res.json({
      teamInvitesEnabled: settings.teamInvitesEnabled ?? env.TEAM_INVITES_ENABLED,
    });
  } catch (error) {
    logger.error('Failed to update settings', { error });
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

export { router as adminRouter };
