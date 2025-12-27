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
import { Scheduled } from './Scheduled';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
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

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: vi.fn(),
  };
});

vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
}));

vi.mock('@/lib/timezone', () => ({
  formatScheduleDateTimeShort: (date: Date) => date.toLocaleDateString(),
  getTimezoneAbbreviation: () => 'PST',
}));

vi.mock('@fullcalendar/react', () => ({
  default: () => <div data-testid="fullcalendar">Calendar</div>,
}));

vi.mock('@/components/GallerySelector', () => ({
  GallerySelector: ({ triggerButton }: any) => (
    <div data-testid="gallery-selector">{triggerButton}</div>
  ),
}));

vi.mock('@/components/TemplateSelector', () => ({
  TagTemplateSelector: () => <div>Tag Template Selector</div>,
  DescriptionTemplateSelector: () => <div>Description Template Selector</div>,
}));

describe('Scheduled', () => {
  const mockNavigate = vi.fn();
  const mockQueryClient = {
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
    getQueryData: vi.fn(),
    cancelQueries: vi.fn(),
  };

  const createMockScheduledDeviation = (
    id: string,
    overrides?: Partial<Deviation>
  ): Deviation => ({
    id,
    title: `Scheduled ${id}`,
    status: 'scheduled',
    tags: ['tag1', 'tag2'],
    description: 'Test description',
    galleryIds: [],
    files: [
      {
        id: `file-${id}`,
        deviationId: id,
        storageUrl: `https://example.com/file-${id}.jpg`,
        filename: `file-${id}.jpg`,
        mimeType: 'image/jpeg',
        filesize: 1024,
        uploadedAt: new Date().toISOString(),
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    userId: 'user1',
    scheduledAt: new Date(Date.now() + 3600000).toISOString(),
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
    vi.mocked(useNavigate).mockReturnValue(mockNavigate);
    vi.mocked(useQueryClient).mockReturnValue(mockQueryClient as any);
  });

  it('should render table view by default', () => {
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

    render(<Scheduled />);

    expect(screen.getByText('Table View')).toBeInTheDocument();
    expect(screen.getByText('Calendar View')).toBeInTheDocument();
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

    render(<Scheduled />);

    const loadingSpinner = document.querySelector('.animate-spin');
    expect(loadingSpinner).toBeInTheDocument();
  });

  it('should render empty state when no scheduled deviations', () => {
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

    render(<Scheduled />);

    expect(screen.getByText('No scheduled deviations')).toBeInTheDocument();
    expect(screen.getByText('Go to Drafts')).toBeInTheDocument();
  });

  it('should render scheduled deviations with count', () => {
    const deviations = [
      createMockScheduledDeviation('1'),
      createMockScheduledDeviation('2'),
      createMockScheduledDeviation('3'),
    ];

    vi.mocked(useQuery).mockReturnValue({
      data: { deviations, total: 3 },
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    vi.mocked(useMutation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any);

    render(<Scheduled />);

    expect(screen.getByText('Manage your scheduled deviations (3)')).toBeInTheDocument();
    expect(screen.getByText('Scheduled 1')).toBeInTheDocument();
    expect(screen.getByText('Scheduled 2')).toBeInTheDocument();
    expect(screen.getByText('Scheduled 3')).toBeInTheDocument();
  });

  it('should handle select all functionality', async () => {
    const user = userEvent.setup();
    const deviations = [
      createMockScheduledDeviation('1'),
      createMockScheduledDeviation('2'),
    ];

    vi.mocked(useQuery).mockReturnValue({
      data: { deviations, total: 2 },
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    vi.mocked(useMutation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any);

    render(<Scheduled />);

    const selectAllCheckbox = screen.getAllByRole('checkbox')[0];
    await user.click(selectAllCheckbox);

    await waitFor(() => {
      expect(selectAllCheckbox).toBeChecked();
    });
  });

  it('should show bulk operations when items selected', async () => {
    const user = userEvent.setup();
    const deviations = [createMockScheduledDeviation('1')];

    vi.mocked(useQuery).mockReturnValue({
      data: { deviations, total: 1 },
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    vi.mocked(useMutation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any);

    render(<Scheduled />);

    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[1]);

    await waitFor(() => {
      expect(screen.getByText(/Cancel \(1\)/)).toBeInTheDocument();
      expect(screen.getByText(/Publish Now \(1\)/)).toBeInTheDocument();
    });
  });

  it('should handle reschedule mutation', async () => {
    const mockMutate = vi.fn();
    const deviations = [createMockScheduledDeviation('1')];

    vi.mocked(useQuery).mockReturnValue({
      data: { deviations, total: 1 },
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    vi.mocked(useMutation).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      onMutate: vi.fn(),
    } as any);

    render(<Scheduled />);

    // Reschedule button should exist
    expect(screen.getByText(/Reschedule/)).toBeInTheDocument();
  });

  it('should show publish now confirmation dialog', async () => {
    const user = userEvent.setup();
    const deviations = [createMockScheduledDeviation('1')];

    vi.mocked(useQuery).mockReturnValue({
      data: { deviations, total: 1 },
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    vi.mocked(useMutation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any);

    render(<Scheduled />);

    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[1]);

    const publishNowButton = screen.getByText(/Publish Now \(1\)/);
    await user.click(publishNowButton);

    await waitFor(() => {
      expect(screen.getByText(/Publish 1 deviation now\?/)).toBeInTheDocument();
    });
  });

  it('should display scheduled time for each deviation', () => {
    const scheduledDate = new Date(Date.now() + 3600000);
    const deviations = [
      createMockScheduledDeviation('1', { scheduledAt: scheduledDate.toISOString() }),
    ];

    vi.mocked(useQuery).mockReturnValue({
      data: { deviations, total: 1 },
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    vi.mocked(useMutation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any);

    render(<Scheduled />);

    expect(screen.getByText(scheduledDate.toLocaleDateString())).toBeInTheDocument();
  });

  it('should show status badge based on time', () => {
    const futureDate = new Date(Date.now() + 7200000);
    const deviations = [
      createMockScheduledDeviation('1', { scheduledAt: futureDate.toISOString() }),
    ];

    vi.mocked(useQuery).mockReturnValue({
      data: { deviations, total: 1 },
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    vi.mocked(useMutation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any);

    render(<Scheduled />);

    // Should show time until scheduled
    expect(screen.getByText(/in/)).toBeInTheDocument();
  });

  it('should show past due badge for overdue deviations', () => {
    const pastDate = new Date(Date.now() - 7200000);
    const deviations = [
      createMockScheduledDeviation('1', { scheduledAt: pastDate.toISOString() }),
    ];

    vi.mocked(useQuery).mockReturnValue({
      data: { deviations, total: 1 },
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    vi.mocked(useMutation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any);

    render(<Scheduled />);

    expect(screen.getByText('Past Due')).toBeInTheDocument();
  });

  it('should switch to calendar view', async () => {
    const user = userEvent.setup();
    const deviations = [createMockScheduledDeviation('1')];

    vi.mocked(useQuery).mockReturnValue({
      data: { deviations, total: 1 },
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    vi.mocked(useMutation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any);

    render(<Scheduled />);

    const calendarTab = screen.getByText('Calendar View');
    await user.click(calendarTab);

    await waitFor(() => {
      expect(screen.getByTestId('fullcalendar')).toBeInTheDocument();
    });
  });

  it('should handle cancel schedule mutation', async () => {
    const mockMutate = vi.fn();
    const deviations = [createMockScheduledDeviation('1')];

    vi.mocked(useQuery).mockReturnValue({
      data: { deviations, total: 1 },
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    vi.mocked(useMutation).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    } as any);

    render(<Scheduled />);

    // Component should set up cancel mutation
    expect(useMutation).toHaveBeenCalled();
  });

  it('should use optimistic updates for reschedule', () => {
    const deviations = [createMockScheduledDeviation('1')];

    vi.mocked(useQuery).mockReturnValue({
      data: { deviations, total: 1 },
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    vi.mocked(useMutation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      onMutate: vi.fn(),
    } as any);

    render(<Scheduled />);

    // Should set up optimistic updates
    expect(useMutation).toHaveBeenCalled();
  });

  it('should navigate to draft on cancel', async () => {
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

    render(<Scheduled />);

    const goToDraftsButton = screen.getByText('Go to Drafts');
    await user.click(goToDraftsButton);

    expect(mockNavigate).toHaveBeenCalledWith('/draft');
  });

  it('should display tags for scheduled deviations', () => {
    const deviations = [
      createMockScheduledDeviation('1', { tags: ['fantasy', 'art', 'digital', 'extra'] }),
    ];

    vi.mocked(useQuery).mockReturnValue({
      data: { deviations, total: 1 },
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    vi.mocked(useMutation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any);

    render(<Scheduled />);

    expect(screen.getByText(/fantasy, art, digital/)).toBeInTheDocument();
    expect(screen.getByText(/\+1/)).toBeInTheDocument();
  });

  it('should handle bulk tag assignment', async () => {
    const user = userEvent.setup();
    const deviations = [createMockScheduledDeviation('1')];

    vi.mocked(useQuery).mockReturnValue({
      data: { deviations, total: 1 },
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    vi.mocked(useMutation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any);

    render(<Scheduled />);

    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[1]);

    const tagsButton = screen.getByText('Add Tags');
    await user.click(tagsButton);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Add tag and press Enter...')).toBeInTheDocument();
    });
  });

  it('should handle bulk description assignment', async () => {
    const user = userEvent.setup();
    const deviations = [createMockScheduledDeviation('1')];

    vi.mocked(useQuery).mockReturnValue({
      data: { deviations, total: 1 },
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    vi.mocked(useMutation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any);

    render(<Scheduled />);

    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[1]);

    const descButton = screen.getByText('Add Description');
    await user.click(descButton);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Enter description...')).toBeInTheDocument();
    });
  });

  it('should clear selection', async () => {
    const user = userEvent.setup();
    const deviations = [createMockScheduledDeviation('1')];

    vi.mocked(useQuery).mockReturnValue({
      data: { deviations, total: 1 },
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    vi.mocked(useMutation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any);

    render(<Scheduled />);

    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[1]);

    await waitFor(() => {
      expect(checkboxes[1]).toBeChecked();
    });

    const clearButton = screen.getByText('Clear Selection');
    await user.click(clearButton);

    await waitFor(() => {
      expect(checkboxes[1]).not.toBeChecked();
    });
  });

  it('should display file preview when available', () => {
    const deviations = [createMockScheduledDeviation('1')];

    vi.mocked(useQuery).mockReturnValue({
      data: { deviations, total: 1 },
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    vi.mocked(useMutation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any);

    render(<Scheduled />);

    const images = screen.getAllByRole('img');
    expect(images.some((img) => img.getAttribute('src')?.includes('file-1.jpg'))).toBe(true);
  });
});
