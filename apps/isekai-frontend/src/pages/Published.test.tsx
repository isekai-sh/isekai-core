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
import { Published } from './Published';
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

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

describe('Published', () => {
  const mockQueryClient = {
    invalidateQueries: vi.fn(),
  };

  const createMockPublishedDeviation = (
    id: string,
    overrides?: Partial<Deviation>
  ): Deviation => ({
    id,
    title: `Published Deviation ${id}`,
    status: 'published',
    tags: [],
    description: '',
    galleryIds: [],
    files: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    userId: 'user1',
    scheduledAt: null,
    publishedAt: new Date().toISOString(),
    deviationUrl: `https://deviantart.com/deviation/${id}`,
    isMature: false,
    allowComments: true,
    licenseOptions: null,
    displayResolution: null,
    sharingOptions: null,
    stashOnly: false,
    ...overrides,
  });

  const mockPreset = {
    id: 'preset1',
    name: 'Standard',
    price: 5000,
    currency: 'USD',
    description: 'Standard pricing',
    isDefault: true,
    sortOrder: 0,
    userId: 'user1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQueryClient).mockReturnValue(mockQueryClient as any);
  });

  it('should render loading state', () => {
    vi.mocked(useQuery).mockImplementation((options: any) => {
      if (options.queryKey[0] === 'deviations') {
        return {
          data: undefined,
          isLoading: true,
          isError: false,
          error: null,
        } as any;
      }
      return {
        data: { presets: [] },
        isLoading: false,
        isError: false,
        error: null,
      } as any;
    });

    vi.mocked(useMutation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any);

    render(<Published />);

    const loadingSpinner = document.querySelector('.animate-spin');
    expect(loadingSpinner).toBeInTheDocument();
  });

  it('should render empty state when no published deviations', () => {
    vi.mocked(useQuery).mockImplementation((options: any) => {
      if (options.queryKey[0] === 'deviations') {
        return {
          data: { deviations: [], total: 0 },
          isLoading: false,
          isError: false,
          error: null,
        } as any;
      }
      return {
        data: { presets: [] },
        isLoading: false,
        isError: false,
        error: null,
      } as any;
    });

    vi.mocked(useMutation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any);

    render(<Published />);

    expect(screen.getByText('No published deviations yet')).toBeInTheDocument();
  });

  it('should render published deviations list', () => {
    const deviations = [
      createMockPublishedDeviation('1'),
      createMockPublishedDeviation('2'),
      createMockPublishedDeviation('3'),
    ];

    vi.mocked(useQuery).mockImplementation((options: any) => {
      if (options.queryKey[0] === 'deviations') {
        return {
          data: { deviations, total: 3 },
          isLoading: false,
          isError: false,
          error: null,
        } as any;
      }
      return {
        data: { presets: [mockPreset] },
        isLoading: false,
        isError: false,
        error: null,
      } as any;
    });

    vi.mocked(useMutation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any);

    render(<Published />);

    expect(screen.getByText('Published Deviation 1')).toBeInTheDocument();
    expect(screen.getByText('Published Deviation 2')).toBeInTheDocument();
    expect(screen.getByText('Published Deviation 3')).toBeInTheDocument();
  });

  it('should show select all checkbox', () => {
    const deviations = [
      createMockPublishedDeviation('1'),
      createMockPublishedDeviation('2'),
    ];

    vi.mocked(useQuery).mockImplementation((options: any) => {
      if (options.queryKey[0] === 'deviations') {
        return {
          data: { deviations, total: 2 },
          isLoading: false,
          isError: false,
          error: null,
        } as any;
      }
      return {
        data: { presets: [mockPreset] },
        isLoading: false,
        isError: false,
        error: null,
      } as any;
    });

    vi.mocked(useMutation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any);

    render(<Published />);

    expect(screen.getByText(/Select all \(2 deviations\)/)).toBeInTheDocument();
  });

  it('should handle individual selection', async () => {
    const user = userEvent.setup();
    const deviations = [createMockPublishedDeviation('1')];

    vi.mocked(useQuery).mockImplementation((options: any) => {
      if (options.queryKey[0] === 'deviations') {
        return {
          data: { deviations, total: 1 },
          isLoading: false,
          isError: false,
          error: null,
        } as any;
      }
      return {
        data: { presets: [mockPreset] },
        isLoading: false,
        isError: false,
        error: null,
      } as any;
    });

    vi.mocked(useMutation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any);

    render(<Published />);

    const checkboxes = screen.getAllByRole('checkbox');
    const deviationCheckbox = checkboxes.find(
      (cb) => cb !== screen.getByLabelText(/Select all/)
    );

    await user.click(deviationCheckbox!);

    await waitFor(() => {
      expect(screen.getByText(/1 selected/)).toBeInTheDocument();
    });
  });

  it('should handle select all toggle', async () => {
    const user = userEvent.setup();
    const deviations = [
      createMockPublishedDeviation('1'),
      createMockPublishedDeviation('2'),
    ];

    vi.mocked(useQuery).mockImplementation((options: any) => {
      if (options.queryKey[0] === 'deviations') {
        return {
          data: { deviations, total: 2 },
          isLoading: false,
          isError: false,
          error: null,
        } as any;
      }
      return {
        data: { presets: [mockPreset] },
        isLoading: false,
        isError: false,
        error: null,
      } as any;
    });

    vi.mocked(useMutation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any);

    render(<Published />);

    const selectAllCheckbox = screen.getByLabelText(/Select all/);
    await user.click(selectAllCheckbox);

    await waitFor(() => {
      expect(screen.getByText(/2 selected/)).toBeInTheDocument();
    });
  });

  it('should show Set as Exclusive button when items selected', async () => {
    const user = userEvent.setup();
    const deviations = [createMockPublishedDeviation('1')];

    vi.mocked(useQuery).mockImplementation((options: any) => {
      if (options.queryKey[0] === 'deviations') {
        return {
          data: { deviations, total: 1 },
          isLoading: false,
          isError: false,
          error: null,
        } as any;
      }
      return {
        data: { presets: [mockPreset] },
        isLoading: false,
        isError: false,
        error: null,
      } as any;
    });

    vi.mocked(useMutation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any);

    render(<Published />);

    const checkboxes = screen.getAllByRole('checkbox');
    const deviationCheckbox = checkboxes[1];

    await user.click(deviationCheckbox);

    await waitFor(() => {
      expect(screen.getByText(/Set as Exclusive \(1\)/)).toBeInTheDocument();
    });
  });

  it('should open preset dialog when Set as Exclusive clicked', async () => {
    const user = userEvent.setup();
    const deviations = [createMockPublishedDeviation('1')];

    vi.mocked(useQuery).mockImplementation((options: any) => {
      if (options.queryKey[0] === 'deviations') {
        return {
          data: { deviations, total: 1 },
          isLoading: false,
          isError: false,
          error: null,
        } as any;
      }
      return {
        data: { presets: [mockPreset] },
        isLoading: false,
        isError: false,
        error: null,
      } as any;
    });

    vi.mocked(useMutation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any);

    render(<Published />);

    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[1]);

    const setExclusiveButton = screen.getByText(/Set as Exclusive \(1\)/);
    await user.click(setExclusiveButton);

    await waitFor(() => {
      expect(screen.getByText('Select Price Preset')).toBeInTheDocument();
    });
  });

  it('should display price presets in dialog', async () => {
    const user = userEvent.setup();
    const deviations = [createMockPublishedDeviation('1')];

    vi.mocked(useQuery).mockImplementation((options: any) => {
      if (options.queryKey[0] === 'deviations') {
        return {
          data: { deviations, total: 1 },
          isLoading: false,
          isError: false,
          error: null,
        } as any;
      }
      return {
        data: { presets: [mockPreset] },
        isLoading: false,
        isError: false,
        error: null,
      } as any;
    });

    vi.mocked(useMutation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any);

    render(<Published />);

    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[1]);

    const setExclusiveButton = screen.getByText(/Set as Exclusive \(1\)/);
    await user.click(setExclusiveButton);

    await waitFor(() => {
      expect(screen.getByText(/Standard - \$50.00/)).toBeInTheDocument();
    });
  });

  it('should handle add to queue mutation', async () => {
    const user = userEvent.setup();
    const mockMutate = vi.fn();
    const deviations = [createMockPublishedDeviation('1')];

    vi.mocked(useQuery).mockImplementation((options: any) => {
      if (options.queryKey[0] === 'deviations') {
        return {
          data: { deviations, total: 1 },
          isLoading: false,
          isError: false,
          error: null,
        } as any;
      }
      return {
        data: { presets: [mockPreset] },
        isLoading: false,
        isError: false,
        error: null,
      } as any;
    });

    vi.mocked(useMutation).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    } as any);

    render(<Published />);

    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[1]);

    const setExclusiveButton = screen.getByText(/Set as Exclusive \(1\)/);
    await user.click(setExclusiveButton);

    await waitFor(() => {
      const addToQueueButton = screen.getByText('Add to Queue');
      expect(addToQueueButton).toBeInTheDocument();
    });
  });

  it('should show error when no preset selected', async () => {
    const user = userEvent.setup();
    const mockMutate = vi.fn();
    const deviations = [createMockPublishedDeviation('1')];
    // Create a preset without isDefault to test the disabled state
    const nonDefaultPreset = { ...mockPreset, isDefault: false };

    vi.mocked(useQuery).mockImplementation((options: any) => {
      if (options.queryKey[0] === 'deviations') {
        return {
          data: { deviations, total: 1 },
          isLoading: false,
          isError: false,
          error: null,
        } as any;
      }
      return {
        data: { presets: [nonDefaultPreset] },
        isLoading: false,
        isError: false,
        error: null,
      } as any;
    });

    vi.mocked(useMutation).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    } as any);

    render(<Published />);

    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[1]);

    const setExclusiveButton = screen.getByText(/Set as Exclusive \(1\)/);
    await user.click(setExclusiveButton);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Button should be disabled when no preset is selected (no default preset)
    const addButton = screen.getByText('Add to Queue');
    expect(addButton).toBeDisabled();
  });

  it('should show message when no presets available', async () => {
    const user = userEvent.setup();
    const deviations = [createMockPublishedDeviation('1')];

    vi.mocked(useQuery).mockImplementation((options: any) => {
      if (options.queryKey[0] === 'deviations') {
        return {
          data: { deviations, total: 1 },
          isLoading: false,
          isError: false,
          error: null,
        } as any;
      }
      return {
        data: { presets: [] },
        isLoading: false,
        isError: false,
        error: null,
      } as any;
    });

    vi.mocked(useMutation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any);

    render(<Published />);

    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[1]);

    const setExclusiveButton = screen.getByText(/Set as Exclusive \(1\)/);
    await user.click(setExclusiveButton);

    await waitFor(() => {
      expect(screen.getByText('No price presets available')).toBeInTheDocument();
      expect(
        screen.getByText('Create a price preset first in the Price Presets page')
      ).toBeInTheDocument();
    });
  });

  it('should display external links for deviations with URLs', () => {
    const deviations = [createMockPublishedDeviation('1')];

    vi.mocked(useQuery).mockImplementation((options: any) => {
      if (options.queryKey[0] === 'deviations') {
        return {
          data: { deviations, total: 1 },
          isLoading: false,
          isError: false,
          error: null,
        } as any;
      }
      return {
        data: { presets: [mockPreset] },
        isLoading: false,
        isError: false,
        error: null,
      } as any;
    });

    vi.mocked(useMutation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any);

    render(<Published />);

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'https://deviantart.com/deviation/1');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('should format published date correctly', () => {
    const publishedDate = new Date('2025-01-15T10:00:00Z');
    const deviations = [
      createMockPublishedDeviation('1', { publishedAt: publishedDate.toISOString() }),
    ];

    vi.mocked(useQuery).mockImplementation((options: any) => {
      if (options.queryKey[0] === 'deviations') {
        return {
          data: { deviations, total: 1 },
          isLoading: false,
          isError: false,
          error: null,
        } as any;
      }
      return {
        data: { presets: [mockPreset] },
        isLoading: false,
        isError: false,
        error: null,
      } as any;
    });

    vi.mocked(useMutation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any);

    render(<Published />);

    // Check that the page title is present
    expect(screen.getByRole('heading', { name: 'Published' })).toBeInTheDocument();
    // Check that the date is formatted and displayed
    expect(screen.getByText(/1\/15\/2025/)).toBeInTheDocument();
  });

  it('should pre-select default preset when opening dialog', async () => {
    const user = userEvent.setup();
    const defaultPreset = { ...mockPreset, isDefault: true };
    const deviations = [createMockPublishedDeviation('1')];

    vi.mocked(useQuery).mockImplementation((options: any) => {
      if (options.queryKey[0] === 'deviations') {
        return {
          data: { deviations, total: 1 },
          isLoading: false,
          isError: false,
          error: null,
        } as any;
      }
      return {
        data: { presets: [defaultPreset] },
        isLoading: false,
        isError: false,
        error: null,
      } as any;
    });

    vi.mocked(useMutation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any);

    render(<Published />);

    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[1]);

    const setExclusiveButton = screen.getByText(/Set as Exclusive \(1\)/);
    await user.click(setExclusiveButton);

    await waitFor(() => {
      expect(screen.getByText(/Standard - \$50.00 \(Default\)/)).toBeInTheDocument();
    });
  });
});
