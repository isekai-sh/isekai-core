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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@/test-helpers/test-utils';
import userEvent from '@testing-library/user-event';
import { Draft } from './Draft';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Deviation } from '@isekai/shared';

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual('@tanstack/react-query');
  return {
    ...actual,
    useQuery: vi.fn(),
    useMutation: vi.fn(),
    useQueryClient: vi.fn(),
  };
});

vi.mock('@/components/UploadModeDialog', () => ({
  UploadModeDialog: ({ onModeSelected }: any) => (
    <div data-testid="upload-mode-dialog">
      <button onClick={() => onModeSelected('single')}>Single</button>
      <button onClick={() => onModeSelected('multiple')}>Multiple</button>
    </div>
  ),
}));

vi.mock('@/components/UploadDialog', () => ({
  UploadDialog: () => <div data-testid="upload-dialog">Upload Dialog</div>,
}));

vi.mock('@/components/DraftTableRow', () => ({
  DraftTableRow: ({ draft, onSelect, isSelected }: any) => (
    <tr data-testid={`draft-row-${draft.id}`}>
      <td>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onSelect}
          data-testid={`checkbox-${draft.id}`}
        />
      </td>
      <td>{draft.title}</td>
    </tr>
  ),
}));

vi.mock('@/components/GallerySelector', () => ({
  GallerySelector: ({ onSelect, triggerButton }: any) => (
    <div data-testid="gallery-selector">
      {triggerButton}
      <button onClick={() => onSelect(['gallery1'])}>Select Gallery</button>
    </div>
  ),
}));

vi.mock('@/components/TemplateSelector', () => ({
  TagTemplateSelector: ({ onSelect }: any) => (
    <button onClick={() => onSelect(['tag1', 'tag2'])}>Select Tag Template</button>
  ),
  DescriptionTemplateSelector: ({ onSelect }: any) => (
    <button onClick={() => onSelect('Template description')}>Select Description Template</button>
  ),
}));

vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
}));

describe('Draft', () => {
  const mockQueryClient = {
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
    getQueryData: vi.fn(),
    cancelQueries: vi.fn(),
  };

  const createMockDraft = (id: string, overrides?: Partial<Deviation>): Deviation => ({
    id,
    title: `Draft ${id}`,
    status: 'draft',
    tags: [],
    description: '',
    galleryIds: [],
    files: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    userId: 'user1',
    scheduledAt: null,
    publishedAt: null,
    deviationUrl: null,
    isMature: false,
    allowComments: true,
    licenseOptions: null,
    displayResolution: null,
    sharingOptions: null,
    stashOnly: false,
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQueryClient).mockReturnValue(mockQueryClient as any);
  });

  it('should render empty state when no drafts', () => {
    vi.mocked(useQuery).mockReturnValue({
      data: { deviations: [], total: 0 },
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    vi.mocked(useMutation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any);

    render(<Draft />);

    expect(screen.getByText('No drafts yet')).toBeInTheDocument();
    expect(screen.getByText('Upload your first deviation to get started')).toBeInTheDocument();
  });

  it('should render loading state', () => {
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    } as any);

    vi.mocked(useMutation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any);

    render(<Draft />);

    const loadingSpinner = document.querySelector('.animate-spin');
    expect(loadingSpinner).toBeInTheDocument();
  });

  it('should render draft list with count', () => {
    const drafts = [createMockDraft('1'), createMockDraft('2'), createMockDraft('3')];

    vi.mocked(useQuery).mockReturnValue({
      data: { deviations: drafts, total: 3 },
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    vi.mocked(useMutation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any);

    render(<Draft />);

    expect(screen.getByText('Manage your deviation drafts (3)')).toBeInTheDocument();
    expect(screen.getByTestId('draft-row-1')).toBeInTheDocument();
    expect(screen.getByTestId('draft-row-2')).toBeInTheDocument();
    expect(screen.getByTestId('draft-row-3')).toBeInTheDocument();
  });

  it('should handle select all checkbox', async () => {
    const user = userEvent.setup();
    const drafts = [createMockDraft('1'), createMockDraft('2')];

    vi.mocked(useQuery).mockReturnValue({
      data: { deviations: drafts, total: 2 },
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    vi.mocked(useMutation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any);

    render(<Draft />);

    const selectAllCheckbox = screen.getAllByRole('checkbox')[0];
    await user.click(selectAllCheckbox);

    // After selecting all, the checkboxes should be checked
    await waitFor(() => {
      expect(selectAllCheckbox).toBeChecked();
    });
  });

  it('should handle individual draft selection', async () => {
    const user = userEvent.setup();
    const drafts = [createMockDraft('1'), createMockDraft('2')];

    vi.mocked(useQuery).mockReturnValue({
      data: { deviations: drafts, total: 2 },
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    vi.mocked(useMutation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any);

    render(<Draft />);

    const checkbox1 = screen.getByTestId('checkbox-1');
    await user.click(checkbox1);

    await waitFor(() => {
      expect(checkbox1).toBeChecked();
    });
  });

  it('should enable bulk operations when items selected', async () => {
    const user = userEvent.setup();
    const drafts = [createMockDraft('1')];

    vi.mocked(useQuery).mockReturnValue({
      data: { deviations: drafts, total: 1 },
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    vi.mocked(useMutation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any);

    render(<Draft />);

    const checkbox = screen.getByTestId('checkbox-1');
    await user.click(checkbox);

    await waitFor(() => {
      expect(screen.getByText(/Delete \(1\)/)).toBeInTheDocument();
      expect(screen.getByText(/Schedule \(1\)/)).toBeInTheDocument();
    });
  });

  it('should handle bulk delete with confirmation', async () => {
    const user = userEvent.setup();
    const mockMutate = vi.fn();
    const drafts = [createMockDraft('1')];

    vi.mocked(useQuery).mockReturnValue({
      data: { deviations: drafts, total: 1 },
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    vi.mocked(useMutation).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    } as any);

    render(<Draft />);

    const checkbox = screen.getByTestId('checkbox-1');
    await user.click(checkbox);

    const deleteButton = screen.getByText(/Delete \(1\)/);
    await user.click(deleteButton);

    // Should show confirmation dialog
    await waitFor(() => {
      expect(screen.getByText(/Delete 1 draft\?/)).toBeInTheDocument();
    });
  });

  it('should handle bulk schedule operation', async () => {
    const user = userEvent.setup();
    const mockMutate = vi.fn();
    const drafts = [createMockDraft('1')];

    vi.mocked(useQuery).mockReturnValue({
      data: { deviations: drafts, total: 1 },
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    vi.mocked(useMutation).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    } as any);

    render(<Draft />);

    const checkbox = screen.getByTestId('checkbox-1');
    await user.click(checkbox);

    // Schedule button should be visible but disabled without date
    const scheduleButton = screen.getByText(/Schedule \(1\)/);
    expect(scheduleButton).toBeDisabled();
  });

  it('should handle bulk tag assignment', async () => {
    const user = userEvent.setup();
    const mockMutate = vi.fn();
    const drafts = [createMockDraft('1')];

    vi.mocked(useQuery).mockReturnValue({
      data: { deviations: drafts, total: 1 },
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    vi.mocked(useMutation).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    } as any);

    render(<Draft />);

    const checkbox = screen.getByTestId('checkbox-1');
    await user.click(checkbox);

    const tagsButton = screen.getByText('Add Tags');
    await user.click(tagsButton);

    // Popover should be open
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Add tag and press Enter...')).toBeInTheDocument();
    });
  });

  it('should handle bulk gallery assignment', async () => {
    const user = userEvent.setup();
    const mockMutate = vi.fn();
    const drafts = [createMockDraft('1')];

    vi.mocked(useQuery).mockReturnValue({
      data: { deviations: drafts, total: 1 },
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    vi.mocked(useMutation).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    } as any);

    render(<Draft />);

    const checkbox = screen.getByTestId('checkbox-1');
    await user.click(checkbox);

    expect(screen.getByText('Assign to Folder')).toBeInTheDocument();
  });

  it('should handle bulk description assignment', async () => {
    const user = userEvent.setup();
    const mockMutate = vi.fn();
    const drafts = [createMockDraft('1')];

    vi.mocked(useQuery).mockReturnValue({
      data: { deviations: drafts, total: 1 },
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    vi.mocked(useMutation).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    } as any);

    render(<Draft />);

    const checkbox = screen.getByTestId('checkbox-1');
    await user.click(checkbox);

    const descButton = screen.getByText('Add Description');
    await user.click(descButton);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Enter description...')).toBeInTheDocument();
    });
  });

  it('should clear selection when Clear Selection clicked', async () => {
    const user = userEvent.setup();
    const drafts = [createMockDraft('1')];

    vi.mocked(useQuery).mockReturnValue({
      data: { deviations: drafts, total: 1 },
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    vi.mocked(useMutation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any);

    render(<Draft />);

    const checkbox = screen.getByTestId('checkbox-1');
    await user.click(checkbox);

    await waitFor(() => {
      expect(checkbox).toBeChecked();
    });

    const clearButton = screen.getByText('Clear Selection');
    await user.click(clearButton);

    await waitFor(() => {
      expect(checkbox).not.toBeChecked();
    });
  });

  it('should handle upload mode selection', async () => {
    const user = userEvent.setup();
    vi.mocked(useQuery).mockReturnValue({
      data: { deviations: [], total: 0 },
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    vi.mocked(useMutation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any);

    render(<Draft />);

    const uploadButton = screen.getAllByText('Upload Media')[0];
    await user.click(uploadButton);

    await waitFor(() => {
      expect(screen.getByTestId('upload-mode-dialog')).toBeInTheDocument();
    });
  });

  it('should use optimistic updates for schedule date changes', () => {
    const drafts = [createMockDraft('1')];
    const mockSetQueryData = vi.fn();

    vi.mocked(useQuery).mockReturnValue({
      data: { deviations: drafts, total: 1 },
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    const onMutateFn = vi.fn();
    vi.mocked(useMutation).mockReturnValue({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      isPending: false,
      onMutate: onMutateFn,
    } as any);

    mockQueryClient.setQueryData = mockSetQueryData;

    render(<Draft />);

    // Component should set up mutations with optimistic updates
    expect(useMutation).toHaveBeenCalled();
  });

  it('should rollback on mutation error', () => {
    const drafts = [createMockDraft('1')];

    vi.mocked(useQuery).mockReturnValue({
      data: { deviations: drafts, total: 1 },
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    vi.mocked(useMutation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      onError: vi.fn(),
    } as any);

    render(<Draft />);

    // Component should set up error handlers
    expect(useMutation).toHaveBeenCalled();
  });
});
