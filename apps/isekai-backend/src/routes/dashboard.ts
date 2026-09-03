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
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 */

import { Router } from 'express';
import type {
  DashboardAutomationScheduleRule,
  DashboardDeviationSummary,
  DashboardOverviewResponse,
  DraftCurationStatus,
} from '@isekai/shared';
import { THUMBNAIL_VERSION } from '@isekai/shared/storage';
import { prisma, type Prisma } from '../db/index.js';
import { curationScopeFilter } from '../lib/curation-status.js';
import { getPublicUrl } from '../lib/upload-service.js';

const router = Router();
const DAY_MS = 24 * 60 * 60 * 1000;
const AUTOMATION_LOCK_TIMEOUT_MS = 5 * 60 * 1000;
const DASHBOARD_LIST_LIMIT = 6;
const DASHBOARD_AUTOMATION_LIMIT = 4;

const dashboardDeviationInclude = {
  files: {
    orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
    take: 1,
    include: {
      variants: {
        where: { version: THUMBNAIL_VERSION },
        orderBy: { width: 'asc' as const },
        take: 12,
      },
    },
  },
} satisfies Prisma.DeviationInclude;

const dashboardAutomationSelect = {
  id: true,
  name: true,
  color: true,
  icon: true,
  enabled: true,
  isExecuting: true,
  lastExecutionLock: true,
  scheduleRules: {
    where: { enabled: true },
    orderBy: [{ priority: 'asc' as const }, { createdAt: 'asc' as const }],
    select: {
      id: true,
      type: true,
      timeOfDay: true,
      intervalMinutes: true,
      deviationsPerInterval: true,
      dailyQuota: true,
      daysOfWeek: true,
      priority: true,
      enabled: true,
    },
  },
  executionLogs: {
    orderBy: { executedAt: 'desc' as const },
    take: 1,
    select: {
      executedAt: true,
      scheduledCount: true,
      errorMessage: true,
    },
  },
} satisfies Prisma.AutomationSelect;

type DashboardDeviationRecord = Prisma.DeviationGetPayload<{
  include: typeof dashboardDeviationInclude;
}>;
type DashboardAutomationRecord = Prisma.AutomationGetPayload<{
  select: typeof dashboardAutomationSelect;
}>;
type DashboardScheduleRuleRecord = DashboardAutomationRecord['scheduleRules'][number];

interface CurationFields {
  ingestSource: string | null;
  curationStatus: DraftCurationStatus | null;
  curatedAt: Date | null;
}

function effectiveCurationStatus(deviation: CurationFields): DraftCurationStatus {
  if (deviation.curationStatus) return deviation.curationStatus;
  if (deviation.curatedAt || deviation.ingestSource !== 'direct_to_draft') return 'curated';
  return 'uncurated';
}

function serializeDashboardDeviation(
  deviation: DashboardDeviationRecord
): DashboardDeviationSummary {
  const files = deviation.files.map((file) => ({
    storageUrl: file.storageUrl,
    variants: file.variants.map((variant) => ({
      width: variant.width,
      format: variant.format,
      storageUrl: getPublicUrl(variant.storageKey),
    })),
  }));

  return {
    id: deviation.id,
    title: deviation.title,
    status: deviation.status,
    ingestSource: deviation.ingestSource,
    curationStatus: effectiveCurationStatus(deviation),
    curatedAt: deviation.curatedAt?.toISOString() ?? null,
    scheduledAt: deviation.scheduledAt?.toISOString() ?? null,
    actualPublishAt: deviation.actualPublishAt?.toISOString() ?? null,
    createdAt: deviation.createdAt.toISOString(),
    files,
  };
}

function serializeDaysOfWeek(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const days = value.filter((day): day is string => typeof day === 'string');
  return days.length > 0 ? days : null;
}

function serializeScheduleRule(rule: DashboardScheduleRuleRecord): DashboardAutomationScheduleRule {
  return {
    id: rule.id,
    type: rule.type,
    timeOfDay: rule.timeOfDay,
    intervalMinutes: rule.intervalMinutes,
    deviationsPerInterval: rule.deviationsPerInterval,
    dailyQuota: rule.dailyQuota,
    daysOfWeek: serializeDaysOfWeek(rule.daysOfWeek),
    priority: rule.priority,
    enabled: rule.enabled,
  };
}

// GET /api/dashboard/overview - bounded operational summary for the authenticated user
router.get('/overview', async (req, res) => {
  const userId = req.user!.id;
  const now = new Date();
  const last24Hours = new Date(now.getTime() - DAY_MS);
  const last7Days = new Date(now.getTime() - 7 * DAY_MS);
  const activeAutomationLockCutoff = new Date(now.getTime() - AUTOMATION_LOCK_TIMEOUT_MS);

  const [
    deviationStatusCounts,
    uncurated,
    curatedDrafts,
    published24Hours,
    published7Days,
    saleStatusCounts,
    recentIntake,
    upcoming,
    automations,
    oldestPendingSale,
  ] = await Promise.all([
    prisma.deviation.groupBy({
      by: ['status'],
      where: { userId, status: { in: ['review', 'scheduled', 'failed'] } },
      _count: { _all: true },
    }),
    prisma.deviation.count({
      where: { userId, status: 'draft', ...curationScopeFilter('uncurated') },
    }),
    prisma.deviation.count({
      where: { userId, status: 'draft', ...curationScopeFilter('curated') },
    }),
    prisma.deviation.count({
      where: { userId, status: 'published', publishedAt: { gte: last24Hours, lte: now } },
    }),
    prisma.deviation.count({
      where: { userId, status: 'published', publishedAt: { gte: last7Days, lte: now } },
    }),
    prisma.saleQueue.groupBy({
      by: ['status'],
      where: { userId, status: { in: ['pending', 'processing', 'failed'] } },
      _count: { _all: true },
    }),
    prisma.deviation.findMany({
      where: { userId, status: { in: ['review', 'draft'] } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: DASHBOARD_LIST_LIMIT,
      include: dashboardDeviationInclude,
    }),
    prisma.deviation.findMany({
      where: { userId, status: 'scheduled', actualPublishAt: { gt: now } },
      orderBy: [{ actualPublishAt: 'asc' }, { id: 'asc' }],
      take: DASHBOARD_LIST_LIMIT,
      include: dashboardDeviationInclude,
    }),
    prisma.automation.findMany({
      where: { userId, enabled: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      take: DASHBOARD_AUTOMATION_LIMIT,
      select: dashboardAutomationSelect,
    }),
    prisma.saleQueue.findFirst({
      where: { userId, status: 'pending' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { createdAt: true },
    }),
  ]);

  const countDeviationStatus = (status: 'review' | 'scheduled' | 'failed') =>
    deviationStatusCounts.find((entry) => entry.status === status)?._count._all ?? 0;
  const countSaleStatus = (status: 'pending' | 'processing' | 'failed') =>
    saleStatusCounts.find((entry) => entry.status === status)?._count._all ?? 0;

  const response: DashboardOverviewResponse = {
    counts: {
      review: countDeviationStatus('review'),
      uncurated,
      curatedDrafts,
      scheduled: countDeviationStatus('scheduled'),
      failed: countDeviationStatus('failed'),
      published24Hours,
      published7Days,
      salePending: countSaleStatus('pending'),
      saleProcessing: countSaleStatus('processing'),
      saleFailed: countSaleStatus('failed'),
    },
    recentIntake: recentIntake.slice(0, DASHBOARD_LIST_LIMIT).map(serializeDashboardDeviation),
    upcoming: upcoming.slice(0, DASHBOARD_LIST_LIMIT).map(serializeDashboardDeviation),
    automations: automations.slice(0, DASHBOARD_AUTOMATION_LIMIT).map((automation) => {
      const lastExecution = automation.executionLogs[0];
      return {
        id: automation.id,
        name: automation.name,
        color: automation.color,
        icon: automation.icon,
        enabled: automation.enabled,
        isExecuting:
          automation.isExecuting &&
          automation.lastExecutionLock !== null &&
          automation.lastExecutionLock >= activeAutomationLockCutoff,
        scheduleRules: automation.scheduleRules.map(serializeScheduleRule),
        lastExecution: lastExecution
          ? {
              executedAt: lastExecution.executedAt.toISOString(),
              scheduledCount: lastExecution.scheduledCount,
              errorMessage: lastExecution.errorMessage,
            }
          : null,
      };
    }),
    oldestPendingSaleAt: oldestPendingSale?.createdAt.toISOString() ?? null,
    generatedAt: now.toISOString(),
  };

  res.set('Cache-Control', 'private, no-store');
  res.json(response);
});

export { router as dashboardRouter };
