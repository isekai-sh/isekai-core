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
import { render, screen, waitFor } from '@/test-helpers/test-utils';
import { Draft } from './Draft';
import type { Deviation } from '@isekai/shared';

const api = vi.hoisted(() => ({
  list: vi.fn(),
  markSelected: vi.fn(),
  markAllMatching: vi.fn(),
}));

vi.mock('@/components/CurationWorkspace', () => ({
  CurationWorkspace: ({ onExit }: { onExit: () => void }) => (
    <div>
      <p>Curation workspace active</p>
      <button onClick={onExit}>Exit test workspace</button>
    </div>
  ),
}));

vi.mock('@/lib/api', () => ({
  deviations: {
    list: api.list,
    delete: vi.fn(),
    batchDelete: vi.fn(),
    update: vi.fn(),
    batchSchedule: vi.fn(),
  },
  curation: {
    markSelected: api.markSelected,
    markAllMatching: api.markAllMatching,
  },
}));

function makeDraft(id: string): Deviation {
  return {
    id,
    userId: 'user-1',
    status: 'draft',
    ingestSource: null,
    curationStatus: null,
    curatedAt: null,
    discardedAt: null,
    purgeAfter: null,
    purgeStartedAt: null,
    title: `Draft ${id}`,
    description: null,
    tags: [],
    categoryPath: null,
    galleryIds: [],
    isMature: false,
    matureLevel: null,
    allowComments: true,
    allowFreeDownload: false,
    isAiGenerated: false,
    noAi: false,
    addWatermark: false,
    displayResolution: 0,
    uploadMode: 'single',
    scheduledAt: null,
    jitterSeconds: 0,
    actualPublishAt: null,
    publishedAt: null,
    deviationId: null,
    deviationUrl: null,
    errorMessage: null,
    retryCount: 0,
    lastRetryAt: null,
    files: [],
    createdAt: '2026-09-03T00:00:00.000Z',
    updatedAt: '2026-09-03T00:00:00.000Z',
  };
}

describe('Draft Curation mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.list.mockResolvedValue({ deviations: [], total: 0 });
    api.markSelected.mockResolvedValue({ updatedCount: 1, state: 'curated' });
    api.markAllMatching.mockResolvedValue({ updatedCount: 5, state: 'uncurated' });
  });

  it('enters and exits the dedicated workspace from the Draft toolbar', async () => {
    const user = userEvent.setup();
    render(<Draft />);

    await user.click(screen.getByRole('button', { name: 'Curation mode' }));
    expect(screen.getByText('Curation workspace active')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Exit test workspace' }));
    expect(screen.getByRole('button', { name: 'Curation mode' })).toBeInTheDocument();
  });

  it('filters by curation status and can mark every filtered draft uncurated', async () => {
    api.list.mockResolvedValue({ deviations: [makeDraft('1'), makeDraft('2')], total: 5 });
    const user = userEvent.setup();
    render(<Draft />);

    await waitFor(() =>
      expect(api.list).toHaveBeenCalledWith({
        status: 'draft',
        curation: 'all',
        page: 1,
        limit: 50,
      })
    );
    const checkboxes = await screen.findAllByRole('checkbox');
    await user.click(checkboxes[0]);
    await user.click(screen.getByRole('button', { name: 'Select all 5 filtered drafts' }));
    await user.click(screen.getByRole('button', { name: 'Mark uncurated' }));
    expect(
      screen.getByRole('heading', { name: 'Mark all 5 filtered drafts as uncurated?' })
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(api.markAllMatching).toHaveBeenCalledWith('all', 'uncurated'));
  });

  it('marks only explicitly selected drafts curated', async () => {
    api.list.mockResolvedValue({ deviations: [makeDraft('1'), makeDraft('2')], total: 2 });
    const user = userEvent.setup();
    render(<Draft />);

    const rowCheckboxes = await screen.findAllByRole('checkbox');
    await user.click(rowCheckboxes[1]);
    await user.click(screen.getByRole('button', { name: 'Mark curated' }));

    await waitFor(() => expect(api.markSelected).toHaveBeenCalledWith(['1'], 'curated'));
  });
});
