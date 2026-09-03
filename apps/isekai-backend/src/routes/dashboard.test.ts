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

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db/index.js', () => ({
  prisma: {
    deviation: {
      groupBy: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
    },
    saleQueue: {
      groupBy: vi.fn(),
      findFirst: vi.fn(),
    },
    automation: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('../lib/upload-service.js', () => ({
  getPublicUrl: vi.fn((key: string) => `https://media.example/${key}`),
}));

import { prisma } from '../db/index.js';
import { curationScopeFilter } from '../lib/curation-status.js';
import { dashboardRouter } from './dashboard.js';

const mockDeviationGroupBy = vi.mocked(prisma.deviation.groupBy);
const mockDeviationCount = vi.mocked(prisma.deviation.count);
const mockDeviationFindMany = vi.mocked(prisma.deviation.findMany);
const mockSaleQueueGroupBy = vi.mocked(prisma.saleQueue.groupBy);
const mockSaleQueueFindFirst = vi.mocked(prisma.saleQueue.findFirst);
const mockAutomationFindMany = vi.mocked(prisma.automation.findMany);

const NOW = new Date('2026-09-03T08:00:00.000Z');
const USER_ID = 'user-123';

function dashboardDeviation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'deviation-1',
    userId: USER_ID,
    status: 'draft',
    ingestSource: 'manual',
    curationStatus: null,
    curatedAt: null,
    discardedAt: null,
    purgeAfter: null,
    purgeStartedAt: null,
    title: 'Dashboard item',
    description: null,
    tags: [],
    categoryPath: null,
    galleryIds: [],
    automationId: null,
    isMature: false,
    matureLevel: null,
    allowComments: true,
    allowFreeDownload: false,
    isAiGenerated: false,
    noAi: false,
    stashOnly: false,
    addWatermark: false,
    displayResolution: 0,
    uploadMode: 'single',
    scheduledAt: null,
    jitterSeconds: 0,
    actualPublishAt: null,
    publishedAt: null,
    stashItemId: null,
    deviationId: null,
    deviationUrl: null,
    errorMessage: null,
    retryCount: 0,
    lastRetryAt: null,
    executionLockId: null,
    executionLockedAt: null,
    executionVersion: 0,
    postCountIncremented: false,
    createdAt: new Date('2026-09-03T07:00:00.000Z'),
    updatedAt: new Date('2026-09-03T07:00:00.000Z'),
    files: [
      {
        id: 'file-1',
        deviationId: 'deviation-1',
        originalFilename: 'private-name.png',
        storageKey: 'private/original.png',
        storageUrl: 'https://media.example/original.png',
        mimeType: 'image/png',
        fileSize: 123,
        width: 2048,
        height: 1024,
        duration: null,
        sortOrder: 0,
        thumbnailStatus: 'ready',
        thumbnailVersion: 1,
        thumbnailAttempts: 0,
        thumbnailError: null,
        thumbnailUpdatedAt: null,
        thumbnailNextAttemptAt: null,
        thumbnailLeaseId: null,
        thumbnailLeaseExpiresAt: null,
        createdAt: new Date('2026-09-03T07:00:00.000Z'),
        variants: [
          {
            id: 'variant-1',
            deviationFileId: 'file-1',
            kind: 'thumbnail',
            version: 1,
            width: 400,
            height: 200,
            format: 'webp',
            storageKey: 'private/thumbnail.webp',
            fileSize: 45,
            createdAt: new Date('2026-09-03T07:01:00.000Z'),
          },
        ],
      },
    ],
    ...overrides,
  };
}

function automation(index: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `automation-${index}`,
    name: `Automation ${index}`,
    color: '#6366f1',
    icon: null,
    enabled: true,
    isExecuting: false,
    lastExecutionLock: null,
    scheduleRules: [],
    executionLogs: [],
    ...overrides,
  };
}

async function callOverview() {
  const layer = dashboardRouter.stack.find((candidate) => candidate.route?.path === '/overview');
  if (!layer?.route) throw new Error('Dashboard overview route not found');

  const handler = layer.route.stack[layer.route.stack.length - 1].handle;
  const response = { json: vi.fn(), set: vi.fn() };
  await handler({ user: { id: USER_ID } }, response, vi.fn());
  expect(response.set).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
  return response.json.mock.calls[0][0];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);

  mockDeviationGroupBy.mockResolvedValue([]);
  mockDeviationCount.mockResolvedValue(0);
  mockDeviationFindMany.mockResolvedValue([]);
  mockSaleQueueGroupBy.mockResolvedValue([]);
  mockSaleQueueFindFirst.mockResolvedValue(null);
  mockAutomationFindMany.mockResolvedValue([]);
});

describe('GET /api/dashboard/overview', () => {
  it('returns scoped operational counts with rolling publication windows', async () => {
    mockDeviationGroupBy.mockResolvedValue([
      { status: 'review', _count: { _all: 3 } },
      { status: 'scheduled', _count: { _all: 5 } },
      { status: 'failed', _count: { _all: 2 } },
    ] as never);
    mockDeviationCount
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce(11)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(16);
    mockSaleQueueGroupBy.mockResolvedValue([
      { status: 'pending', _count: { _all: 6 } },
      { status: 'processing', _count: { _all: 1 } },
      { status: 'failed', _count: { _all: 8 } },
    ] as never);
    mockSaleQueueFindFirst.mockResolvedValue({
      createdAt: new Date('2026-09-01T10:00:00.000Z'),
    } as never);

    const body = await callOverview();

    expect(body.counts).toEqual({
      review: 3,
      uncurated: 7,
      curatedDrafts: 11,
      scheduled: 5,
      failed: 2,
      published24Hours: 4,
      published7Days: 16,
      salePending: 6,
      saleProcessing: 1,
      saleFailed: 8,
    });
    expect(body.oldestPendingSaleAt).toBe('2026-09-01T10:00:00.000Z');
    expect(body.generatedAt).toBe(NOW.toISOString());

    const allCalls = [
      ...mockDeviationGroupBy.mock.calls,
      ...mockDeviationCount.mock.calls,
      ...mockDeviationFindMany.mock.calls,
      ...mockSaleQueueGroupBy.mock.calls,
      ...mockSaleQueueFindFirst.mock.calls,
      ...mockAutomationFindMany.mock.calls,
    ];
    expect(allCalls).not.toHaveLength(0);
    for (const [query] of allCalls) {
      expect(query).toEqual(
        expect.objectContaining({ where: expect.objectContaining({ userId: USER_ID }) })
      );
    }

    expect(mockDeviationCount).toHaveBeenNthCalledWith(1, {
      where: { userId: USER_ID, status: 'draft', ...curationScopeFilter('uncurated') },
    });
    expect(mockDeviationCount).toHaveBeenNthCalledWith(2, {
      where: { userId: USER_ID, status: 'draft', ...curationScopeFilter('curated') },
    });
    expect(mockDeviationCount).toHaveBeenNthCalledWith(3, {
      where: {
        userId: USER_ID,
        status: 'published',
        publishedAt: { gte: new Date('2026-09-02T08:00:00.000Z'), lte: NOW },
      },
    });
    expect(mockDeviationCount).toHaveBeenNthCalledWith(4, {
      where: {
        userId: USER_ID,
        status: 'published',
        publishedAt: { gte: new Date('2026-08-27T08:00:00.000Z'), lte: NOW },
      },
    });
  });

  it('preserves source ordering and resolves legacy curation without exposing storage internals', async () => {
    const recent = [
      dashboardDeviation({ id: 'newest', curationStatus: 'curated' }),
      dashboardDeviation({
        id: 'legacy-direct',
        ingestSource: 'direct_to_draft',
        curationStatus: null,
        curatedAt: null,
      }),
      dashboardDeviation({
        id: 'legacy-manual',
        ingestSource: null,
        curationStatus: null,
        curatedAt: null,
      }),
    ];
    const upcoming = [
      dashboardDeviation({
        id: 'soon',
        status: 'scheduled',
        actualPublishAt: new Date('2026-09-03T09:00:00.000Z'),
      }),
      dashboardDeviation({
        id: 'later',
        status: 'scheduled',
        actualPublishAt: new Date('2026-09-03T10:00:00.000Z'),
      }),
    ];
    mockDeviationFindMany
      .mockResolvedValueOnce(recent as never)
      .mockResolvedValueOnce(upcoming as never);

    const body = await callOverview();

    expect(body.recentIntake.map((item: { id: string }) => item.id)).toEqual([
      'newest',
      'legacy-direct',
      'legacy-manual',
    ]);
    expect(
      body.recentIntake.map((item: { curationStatus: string }) => item.curationStatus)
    ).toEqual(['curated', 'uncurated', 'curated']);
    expect(body.upcoming.map((item: { id: string }) => item.id)).toEqual(['soon', 'later']);
    expect(body.recentIntake[0].files).toEqual([
      {
        storageUrl: 'https://media.example/original.png',
        variants: [
          {
            width: 400,
            format: 'webp',
            storageUrl: 'https://media.example/private/thumbnail.webp',
          },
        ],
      },
    ]);
    expect(JSON.stringify(body.recentIntake)).not.toContain('storageKey');
    expect(JSON.stringify(body.recentIntake)).not.toContain('originalFilename');

    expect(mockDeviationFindMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { userId: USER_ID, status: { in: ['review', 'draft'] } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 6,
        include: expect.objectContaining({
          files: expect.objectContaining({
            take: 1,
            include: {
              variants: expect.objectContaining({
                where: { version: 1 },
                take: 12,
              }),
            },
          }),
        }),
      })
    );
    expect(mockDeviationFindMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { userId: USER_ID, status: 'scheduled', actualPublishAt: { gt: NOW } },
        orderBy: [{ actualPublishAt: 'asc' }, { id: 'asc' }],
        take: 6,
      })
    );
  });

  it('bounds lists and reports only fresh automation execution locks as running', async () => {
    mockDeviationFindMany
      .mockResolvedValueOnce(
        Array.from({ length: 8 }, (_, index) =>
          dashboardDeviation({ id: `recent-${index}` })
        ) as never
      )
      .mockResolvedValueOnce(
        Array.from({ length: 8 }, (_, index) =>
          dashboardDeviation({
            id: `upcoming-${index}`,
            status: 'scheduled',
            actualPublishAt: new Date(NOW.getTime() + (index + 1) * 60_000),
          })
        ) as never
      );
    mockAutomationFindMany.mockResolvedValue([
      automation(0, {
        isExecuting: true,
        lastExecutionLock: new Date('2026-09-03T07:58:00.000Z'),
        scheduleRules: [
          {
            id: 'rule-1',
            type: 'fixed_interval',
            timeOfDay: null,
            intervalMinutes: 30,
            deviationsPerInterval: 2,
            dailyQuota: null,
            daysOfWeek: ['monday', 'friday'],
            priority: 1,
            enabled: true,
          },
        ],
        executionLogs: [
          {
            executedAt: new Date('2026-09-03T07:59:00.000Z'),
            scheduledCount: 2,
            errorMessage: null,
          },
        ],
      }),
      automation(1, {
        isExecuting: true,
        lastExecutionLock: new Date('2026-09-03T07:54:59.000Z'),
      }),
      ...Array.from({ length: 4 }, (_, index) => automation(index + 2)),
    ] as never);

    const body = await callOverview();

    expect(body.recentIntake).toHaveLength(6);
    expect(body.upcoming).toHaveLength(6);
    expect(body.automations).toHaveLength(4);
    expect(body.automations[0]).toEqual(
      expect.objectContaining({
        isExecuting: true,
        scheduleRules: [
          expect.objectContaining({
            type: 'fixed_interval',
            intervalMinutes: 30,
            daysOfWeek: ['monday', 'friday'],
          }),
        ],
        lastExecution: {
          executedAt: '2026-09-03T07:59:00.000Z',
          scheduledCount: 2,
          errorMessage: null,
        },
      })
    );
    expect(body.automations[1].isExecuting).toBe(false);
    expect(mockAutomationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: USER_ID, enabled: true },
        take: 4,
        select: expect.objectContaining({
          lastExecutionLock: true,
          scheduleRules: expect.objectContaining({ where: { enabled: true } }),
          executionLogs: expect.objectContaining({ take: 1 }),
        }),
      })
    );
  });
});
