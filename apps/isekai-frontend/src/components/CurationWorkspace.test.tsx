/*
 * Copyright (C) 2025 Isekai
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@/test-helpers/test-utils';
import userEvent from '@testing-library/user-event';
import { CurationWorkspace } from './CurationWorkspace';
import type { Deviation } from '@isekai/shared';

const api = vi.hoisted(() => ({
  list: vi.fn(),
  trash: vi.fn(),
  keep: vi.fn(),
  discard: vi.fn(),
  restore: vi.fn(),
  uncurate: vi.fn(),
  update: vi.fn(),
}));
const toast = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  curation: {
    list: api.list,
    trash: api.trash,
    keep: api.keep,
    discard: api.discard,
    restore: api.restore,
    uncurate: api.uncurate,
  },
  deviations: { update: api.update },
}));

vi.mock('@/hooks/use-toast', () => ({ toast }));

function makeDraft(id: string, title: string): Deviation {
  const timestamp = `2026-09-03T00:00:0${id}Z`;
  return {
    id,
    userId: 'user-1',
    status: 'draft',
    ingestSource: 'direct_to_draft',
    curationStatus: 'uncurated',
    curatedAt: null,
    discardedAt: null,
    purgeAfter: null,
    purgeStartedAt: null,
    title,
    description: '',
    tags: [],
    categoryPath: null,
    galleryIds: [],
    isMature: false,
    matureLevel: null,
    allowComments: true,
    allowFreeDownload: false,
    isAiGenerated: true,
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
    files: [
      {
        id: `file-${id}`,
        deviationId: id,
        originalFilename: `${id}.png`,
        storageKey: `${id}.png`,
        storageUrl: `https://storage.example/${id}.png`,
        mimeType: 'image/png',
        fileSize: 1024,
        width: 100,
        height: 100,
        duration: null,
        sortOrder: 0,
        createdAt: timestamp,
      },
    ],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

const first = makeDraft('1', 'First draft');
const second = makeDraft('2', 'Second draft');

describe('CurationWorkspace', () => {
  beforeEach(() => {
    api.list.mockResolvedValue({ deviations: [second, first], total: 2 });
    api.trash.mockResolvedValue({ deviations: [], total: 0 });
    api.keep.mockImplementation(async () => ({
      deviation: { ...second, curatedAt: new Date().toISOString() },
    }));
    api.discard.mockImplementation(async () => ({ deviation: { ...second, status: 'trashed' } }));
    api.restore.mockImplementation(async () => ({ deviation: second }));
    api.uncurate.mockImplementation(async () => ({ deviation: second }));
    api.update.mockImplementation(async (_id, data) => ({ ...second, ...data }));
  });

  it('renders the dedicated decision workspace with accessible actions and mobile progress', async () => {
    render(<CurationWorkspace onExit={vi.fn()} />);

    expect(await screen.findByRole('heading', { name: 'Curation mode' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Keep draft' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Discard to Trash' })).toBeInTheDocument();
    expect(screen.getByText('1 of 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Details' })).toBeInTheDocument();
  });

  it('keeps with Enter, advances optimistically, and undoes Keep with Ctrl+Z', async () => {
    render(<CurationWorkspace onExit={vi.fn()} />);
    await screen.findByRole('button', { name: 'Open full image for Second draft' });

    fireEvent.keyDown(document.body, { key: 'Enter' });
    await waitFor(() => expect(api.keep).toHaveBeenCalledWith('2'));
    expect(
      screen.getByRole('button', { name: 'Open full image for First draft' })
    ).toBeInTheDocument();

    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
    await waitFor(() => expect(api.uncurate).toHaveBeenCalledWith('2'));
    expect(
      await screen.findByRole('button', { name: 'Open full image for Second draft' })
    ).toBeInTheDocument();
  });

  it('discards with Backspace, prevents browser navigation, and can undo the discard', async () => {
    render(<CurationWorkspace onExit={vi.fn()} />);
    await screen.findByRole('button', { name: 'Open full image for Second draft' });

    const allowed = fireEvent.keyDown(document.body, { key: 'Backspace', cancelable: true });
    expect(allowed).toBe(false);
    await waitFor(() => expect(api.discard).toHaveBeenCalledWith('2'));

    const undoButtons = await screen.findAllByRole('button', { name: /undo/i });
    await userEvent.click(undoButtons[0]);
    await waitFor(() => expect(api.restore).toHaveBeenCalledWith('2'));
  });

  it('does not run hotkeys while typing or in the lightbox', async () => {
    render(<CurationWorkspace onExit={vi.fn()} />);
    await screen.findByRole('button', { name: 'Open full image for Second draft' });

    const editor = document.querySelector('[contenteditable="true"]') as HTMLElement;
    fireEvent.keyDown(editor, { key: 'Enter' });
    expect(api.keep).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Open full image for Second draft' }));
    const lightbox = screen.getByRole('dialog', { name: 'Full image for Second draft' });
    fireEvent.keyDown(lightbox, { key: 'Backspace' });
    fireEvent.keyDown(document.body, { key: 'Backspace' });
    expect(api.discard).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close full image' }));
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Full image for Second draft' })
      ).not.toBeInTheDocument()
    );
  });

  it('ignores repeated, composing, and modified decision hotkeys', async () => {
    render(<CurationWorkspace onExit={vi.fn()} />);
    await screen.findByRole('button', { name: 'Keep draft' });

    fireEvent.keyDown(document.body, { key: 'Enter', repeat: true });
    fireEvent.keyDown(document.body, { key: 'Enter', isComposing: true });
    fireEvent.keyDown(document.body, { key: 'Enter', altKey: true });
    fireEvent.keyDown(document.body, { key: 'Backspace', metaKey: true });

    expect(api.keep).not.toHaveBeenCalled();
    expect(api.discard).not.toHaveBeenCalled();
  });

  it('does not Keep when Enter activates a control or selector', async () => {
    render(<CurationWorkspace onExit={vi.fn()} />);
    const detailsButton = await screen.findByRole('button', { name: 'Details' });
    const queueSelector = screen.getByRole('combobox', { name: 'Curation queue' });

    fireEvent.keyDown(detailsButton, { key: 'Enter' });
    fireEvent.keyDown(queueSelector, { key: 'Enter' });

    expect(api.keep).not.toHaveBeenCalled();
    fireEvent.keyDown(queueSelector, { key: 'Escape' });
  });

  it('blocks additional decisions while a mutation is running', async () => {
    let resolveKeep: ((value: unknown) => void) | undefined;
    api.keep.mockReturnValue(
      new Promise((resolve) => {
        resolveKeep = resolve;
      })
    );
    const user = userEvent.setup();
    render(<CurationWorkspace onExit={vi.fn()} />);
    const keepButton = await screen.findByRole('button', { name: 'Keep draft' });

    await user.click(keepButton);
    fireEvent.keyDown(document.body, { key: 'Backspace' });
    expect(api.keep).toHaveBeenCalledTimes(1);
    expect(api.discard).not.toHaveBeenCalled();
    await act(async () => resolveKeep?.({ deviation: second }));
  });

  it('rolls back an optimistic decision when the server rejects it', async () => {
    api.keep.mockRejectedValueOnce(new Error('Already scheduled'));
    render(<CurationWorkspace onExit={vi.fn()} />);
    await screen.findByRole('button', { name: 'Open full image for Second draft' });

    fireEvent.keyDown(document.body, { key: 'Enter' });

    expect(
      await screen.findByRole('button', { name: 'Open full image for Second draft' })
    ).toBeInTheDocument();
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Decision not saved', variant: 'destructive' })
    );
  });

  it('opens mobile details and exposes Trash as a persistent restore queue', async () => {
    const user = userEvent.setup();
    render(<CurationWorkspace onExit={vi.fn()} />);
    await screen.findByRole('button', { name: 'Details' });

    await user.click(screen.getByRole('button', { name: 'Details' }));
    expect(await screen.findByRole('heading', { name: 'Edit draft details' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close' }));

    await user.click(screen.getByRole('combobox', { name: 'Curation queue' }));
    await user.click(screen.getByRole('option', { name: 'Trash' }));
    await waitFor(() => expect(api.trash).toHaveBeenCalled());
    expect(await screen.findByText('Trash is empty')).toBeInTheDocument();
  });

  it('uses arrow keys to navigate and Escape to exit', async () => {
    const onExit = vi.fn();
    render(<CurationWorkspace onExit={onExit} />);
    await screen.findByRole('button', { name: 'Open full image for Second draft' });

    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(
      screen.getByRole('button', { name: 'Open full image for First draft' })
    ).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onExit).toHaveBeenCalledOnce();
  });

  it('loads another page before a mobile queue is exhausted', async () => {
    api.list.mockImplementation(async ({ page }: { page?: number }) =>
      page === 1 ? { deviations: [first], total: 2 } : { deviations: [second], total: 2 }
    );
    render(<CurationWorkspace onExit={vi.fn()} />);

    await waitFor(() =>
      expect(api.list).toHaveBeenCalledWith({ scope: 'uncurated', page: 2, limit: 50 })
    );
    expect(await screen.findByRole('button', { name: 'Previous draft' })).toBeEnabled();
  });
});
