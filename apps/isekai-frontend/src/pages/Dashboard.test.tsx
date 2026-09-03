/*
 * Copyright (C) 2025 Isekai
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import type { DashboardOverviewResponse } from '@isekai/shared';
import { render, screen, waitFor } from '@/test-helpers/test-utils';
import { Dashboard } from './Dashboard';

const api = vi.hoisted(() => ({ overview: vi.fn() }));

vi.mock('@/lib/api', () => ({ dashboard: { overview: api.overview } }));

vi.mock('date-fns', () => ({
  formatDistanceToNow: () => '2 hours ago',
}));

vi.mock('@/lib/timezone', () => ({
  formatScheduleDateTimeShort: (value: string) => `EXACT:${value}`,
}));

function makeOverview(): DashboardOverviewResponse {
  return {
    generatedAt: '2026-09-03T05:00:00.000Z',
    counts: {
      review: 3,
      uncurated: 7,
      curatedDrafts: 23,
      scheduled: 11,
      failed: 2,
      published24Hours: 5,
      published7Days: 29,
      salePending: 4,
      saleProcessing: 1,
      saleFailed: 2,
    },
    recentIntake: [
      {
        id: 'recent-1',
        title: 'Fresh wallpaper',
        status: 'draft',
        ingestSource: 'direct_to_draft',
        curationStatus: 'uncurated',
        curatedAt: null,
        scheduledAt: null,
        actualPublishAt: null,
        createdAt: '2026-09-03T04:00:00.000Z',
        files: [
          {
            storageUrl: 'https://storage.example/original.webp',
            variants: [
              {
                width: 128,
                format: 'webp',
                storageUrl: 'https://storage.example/thumb.webp',
              },
            ],
          },
        ],
      },
    ],
    upcoming: [
      {
        id: 'upcoming-1',
        title: 'Tomorrow post',
        status: 'scheduled',
        ingestSource: 'manual',
        curationStatus: 'curated',
        curatedAt: '2026-09-03T01:00:00.000Z',
        scheduledAt: '2026-09-04T01:00:00.000Z',
        actualPublishAt: '2026-09-04T01:05:00.000Z',
        createdAt: '2026-09-02T01:00:00.000Z',
        files: [],
      },
    ],
    automations: [
      {
        id: 'automation-enabled',
        name: 'Morning queue',
        color: '#6366f1',
        icon: null,
        enabled: true,
        isExecuting: false,
        scheduleRules: [
          {
            id: 'rule-1',
            type: 'fixed_time',
            timeOfDay: '09:30',
            intervalMinutes: null,
            deviationsPerInterval: null,
            dailyQuota: null,
            daysOfWeek: ['monday', 'wednesday'],
            priority: 0,
            enabled: true,
          },
        ],
        lastExecution: {
          executedAt: '2026-09-03T03:00:00.000Z',
          scheduledCount: 2,
          errorMessage: null,
        },
      },
      {
        id: 'automation-running',
        name: 'Live queue',
        color: '#6366f1',
        icon: null,
        enabled: true,
        isExecuting: true,
        scheduleRules: [],
        lastExecution: null,
      },
    ],
    oldestPendingSaleAt: '2026-09-03T03:00:00.000Z',
  };
}

describe('Dashboard', () => {
  beforeEach(() => {
    api.overview.mockReset();
  });

  it('renders the overview contract as actionable attention and pipeline metrics', async () => {
    api.overview.mockResolvedValue(makeOverview());

    render(<Dashboard />);

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getAllByText('Review')).not.toHaveLength(0);
    expect(screen.getAllByText('Uncurated')).not.toHaveLength(0);
    expect(screen.getByText('Curated drafts')).toBeInTheDocument();
    expect(screen.getByText('Published · 24h')).toBeInTheDocument();
    expect(screen.getByText('Fresh wallpaper')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Exclusive jobs/i })).toHaveAttribute(
      'href',
      '/exclusives-queue'
    );
    expect(api.overview).toHaveBeenCalledTimes(1);
  });

  it('shows the actual publish time rather than the unjittered scheduled time', async () => {
    api.overview.mockResolvedValue(makeOverview());

    render(<Dashboard />);

    expect(await screen.findByText('EXACT:2026-09-04T01:05:00.000Z')).toBeInTheDocument();
    expect(screen.queryByText('EXACT:2026-09-04T01:00:00.000Z')).not.toBeInTheDocument();
  });

  it('distinguishes enabled and currently executing automations', async () => {
    api.overview.mockResolvedValue(makeOverview());

    render(<Dashboard />);

    expect(await screen.findByText('Morning queue')).toBeInTheDocument();
    expect(screen.getByText('Enabled')).toBeInTheDocument();
    expect(screen.getByText('Running now')).toBeInTheDocument();
    expect(screen.queryByText('Paused')).not.toBeInTheDocument();
    expect(screen.getByText('Fixed time · 09:30 account time · mon, wed')).toBeInTheDocument();
  });

  it('offers a retry after an overview error', async () => {
    const user = userEvent.setup();
    api.overview.mockRejectedValueOnce(new Error('Overview unavailable'));
    api.overview.mockResolvedValueOnce(makeOverview());

    render(<Dashboard />);

    expect(await screen.findByText('Dashboard could not be loaded')).toBeInTheDocument();
    expect(screen.getByText('Overview unavailable')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(screen.getByText('Fresh wallpaper')).toBeInTheDocument());
    expect(api.overview).toHaveBeenCalledTimes(2);
  });

  it('renders an accessible loading skeleton while the overview is pending', () => {
    api.overview.mockReturnValue(new Promise(() => undefined));

    render(<Dashboard />);

    expect(screen.getByRole('status', { name: 'Loading dashboard' })).toBeInTheDocument();
  });
});
