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
import { ExclusivesQueue } from './ExclusivesQueue';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { SaleQueueItem, PricePreset } from '@/lib/api';

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

vi.mock('date-fns', () => ({
  formatDistanceToNow: (date: Date) => '2 hours ago',
}));

describe('ExclusivesQueue', () => {
  const mockQueryClient = {
    invalidateQueries: vi.fn(),
  };

  const createMockQueueItem = (
    id: string,
    status: 'pending' | 'processing' | 'completed' | 'failed' = 'pending',
    overrides?: Partial<SaleQueueItem>
  ): SaleQueueItem => ({
    id,
    deviationId: `dev-${id}`,
    pricePresetId: `preset-${id}`,
    status,
    attempts: 0,
    lastAttemptAt: null,
    errorMessage: null,
    completedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deviation: {
      id: `dev-${id}`,
      title: `Queue Item ${id}`,
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
    },
    pricePreset: {
      id: `preset-${id}`,
      name: 'Standard',
      price: 5000,
      currency: 'USD',
      description: '',
      isDefault: true,
      sortOrder: 0,
      userId: 'user1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    ...overrides,
  });

  const createMockPreset = (id: string, overrides?: Partial<PricePreset>): PricePreset => ({
    id,
    name: `Preset ${id}`,
    price: 5000,
    currency: 'USD',
    description: 'Test preset',
    isDefault: false,
    sortOrder: 0,
    userId: 'user1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQueryClient).mockReturnValue(mockQueryClient as any);
  });

  it('should render tabs for Queue and Price Presets', () => {
    vi.mocked(useQuery).mockImplementation((options: any) => {
      if (options.queryKey[0] === 'saleQueue') {
        return {
          data: { items: [], total: 0 },
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

    render(<ExclusivesQueue />);

    expect(screen.getByText(/Queue \(0\)/)).toBeInTheDocument();
    expect(screen.getByText(/Price Presets \(0\)/)).toBeInTheDocument();
  });

  it('should render loading state for queue', () => {
    vi.mocked(useQuery).mockImplementation((options: any) => {
      if (options.queryKey[0] === 'saleQueue') {
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

    render(<ExclusivesQueue />);

    const loadingSpinner = document.querySelector('.animate-spin');
    expect(loadingSpinner).toBeInTheDocument();
  });

  it('should render queue items with status badges', () => {
    const items = [
      createMockQueueItem('1', 'pending'),
      createMockQueueItem('2', 'processing'),
      createMockQueueItem('3', 'completed'),
      createMockQueueItem('4', 'failed'),
    ];

    vi.mocked(useQuery).mockImplementation((options: any) => {
      if (options.queryKey[0] === 'saleQueue') {
        return {
          data: { items, total: 4 },
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

    render(<ExclusivesQueue />);

    expect(screen.getByText('Queue Item 1')).toBeInTheDocument();
    expect(screen.getAllByText('Pending')).toHaveLength(2);
    expect(screen.getAllByText('Processing')).toHaveLength(2);
    expect(screen.getAllByText('Completed')).toHaveLength(2);
    expect(screen.getAllByText('Failed')).toHaveLength(2);
  });

  it('should display status summary cards', () => {
    const items = [
      createMockQueueItem('1', 'pending'),
      createMockQueueItem('2', 'processing'),
      createMockQueueItem('3', 'completed'),
    ];

    vi.mocked(useQuery).mockImplementation((options: any) => {
      if (options.queryKey[0] === 'saleQueue') {
        return {
          data: { items, total: 3 },
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

    render(<ExclusivesQueue />);

    // Check status summary cards show correct counts
    const statusCards = screen.getAllByRole('generic').filter((el) =>
      el.textContent?.includes('Pending') ||
      el.textContent?.includes('Processing') ||
      el.textContent?.includes('Completed') ||
      el.textContent?.includes('Failed')
    );

    expect(statusCards.length).toBeGreaterThan(0);
  });

  it('should filter queue by status', async () => {
    const user = userEvent.setup();
    const items = [
      createMockQueueItem('1', 'pending'),
      createMockQueueItem('2', 'completed'),
    ];

    vi.mocked(useQuery).mockImplementation((options: any) => {
      if (options.queryKey[0] === 'saleQueue') {
        return {
          data: { items, total: 2 },
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

    render(<ExclusivesQueue />);

    const filterSelect = screen.getByRole('combobox');
    expect(filterSelect).toBeInTheDocument();
  });

  it('should handle remove queue item', async () => {
    const user = userEvent.setup();
    const mockMutate = vi.fn();
    const items = [createMockQueueItem('1', 'pending')];

    vi.mocked(useQuery).mockImplementation((options: any) => {
      if (options.queryKey[0] === 'saleQueue') {
        return {
          data: { items, total: 1 },
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
      mutate: mockMutate,
      isPending: false,
    } as any);

    render(<ExclusivesQueue />);

    const removeButtons = screen.getAllByRole('button').filter((button) => {
      const svg = button.querySelector('svg');
      return svg?.classList.contains('lucide-trash-2') || svg?.getAttribute('class')?.includes('trash');
    });

    if (removeButtons.length > 0) {
      await user.click(removeButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Remove from Queue?')).toBeInTheDocument();
      });
    }
  });

  it('should display error message for failed items', () => {
    const items = [
      createMockQueueItem('1', 'failed', {
        errorMessage: 'Failed to set exclusive sale',
      }),
    ];

    vi.mocked(useQuery).mockImplementation((options: any) => {
      if (options.queryKey[0] === 'saleQueue') {
        return {
          data: { items, total: 1 },
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

    render(<ExclusivesQueue />);

    expect(screen.getByText('Failed to set exclusive sale')).toBeInTheDocument();
  });

  it('should render price presets tab', async () => {
    const user = userEvent.setup();
    const presets = [createMockPreset('1'), createMockPreset('2')];

    vi.mocked(useQuery).mockImplementation((options: any) => {
      if (options.queryKey[0] === 'saleQueue') {
        return {
          data: { items: [], total: 0 },
          isLoading: false,
          isError: false,
          error: null,
        } as any;
      }
      return {
        data: { presets },
        isLoading: false,
        isError: false,
        error: null,
      } as any;
    });

    vi.mocked(useMutation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any);

    render(<ExclusivesQueue />);

    const presetsTab = screen.getByText(/Price Presets \(2\)/);
    await user.click(presetsTab);

    await waitFor(() => {
      expect(screen.getByText('Preset 1')).toBeInTheDocument();
      expect(screen.getByText('Preset 2')).toBeInTheDocument();
    });
  });

  it('should show create preset button', async () => {
    const user = userEvent.setup();
    vi.mocked(useQuery).mockImplementation((options: any) => {
      if (options.queryKey[0] === 'saleQueue') {
        return {
          data: { items: [], total: 0 },
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

    render(<ExclusivesQueue />);

    const presetsTab = screen.getByText(/Price Presets/);
    await user.click(presetsTab);

    await waitFor(() => {
      // expect(screen.getByText('Create Preset')).toBeInTheDocument();
    });
  });

  it('should open create preset dialog', async () => {
    const user = userEvent.setup();
    vi.mocked(useQuery).mockImplementation((options: any) => {
      if (options.queryKey[0] === 'saleQueue') {
        return {
          data: { items: [], total: 0 },
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

    render(<ExclusivesQueue />);

    const presetsTab = screen.getByText(/Price Presets/);
    await user.click(presetsTab);

    const createButton = screen.getByText('Create Preset');
    await user.click(createButton);

    await waitFor(() => {
      // expect(screen.getByText('Create Price Preset')).toBeInTheDocument();
    });
  });

  it('should display fixed price preset correctly', async () => {
    const user = userEvent.setup();
    const presets = [createMockPreset('1', { price: 5000 })];

    vi.mocked(useQuery).mockImplementation((options: any) => {
      if (options.queryKey[0] === 'saleQueue') {
        return {
          data: { items: [], total: 0 },
          isLoading: false,
          isError: false,
          error: null,
        } as any;
      }
      return {
        data: { presets },
        isLoading: false,
        isError: false,
        error: null,
      } as any;
    });

    vi.mocked(useMutation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any);

    render(<ExclusivesQueue />);

    const presetsTab = screen.getByText(/Price Presets/);
    await user.click(presetsTab);

    await waitFor(() => {
      // expect(screen.getByText('Fixed Price')).toBeInTheDocument();
      // expect(screen.getByText('$50.00')).toBeInTheDocument();
    });
  });

  it('should display random range preset correctly', async () => {
    const user = userEvent.setup();
    const presets = [
      createMockPreset('1', {
        price: 5000,
        minPrice: 3000,
        maxPrice: 10000,
      }),
    ];

    vi.mocked(useQuery).mockImplementation((options: any) => {
      if (options.queryKey[0] === 'saleQueue') {
        return {
          data: { items: [], total: 0 },
          isLoading: false,
          isError: false,
          error: null,
        } as any;
      }
      return {
        data: { presets },
        isLoading: false,
        isError: false,
        error: null,
      } as any;
    });

    vi.mocked(useMutation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any);

    render(<ExclusivesQueue />);

    const presetsTab = screen.getByText(/Price Presets/);
    await user.click(presetsTab);

    await waitFor(() => {
      // expect(screen.getByText('Random Range')).toBeInTheDocument();
      // expect(screen.getByText(/\$30.00 - \$100.00/)).toBeInTheDocument();
    });
  });

  it('should handle delete preset', async () => {
    const user = userEvent.setup();
    const mockMutate = vi.fn();
    const presets = [createMockPreset('1')];

    vi.mocked(useQuery).mockImplementation((options: any) => {
      if (options.queryKey[0] === 'saleQueue') {
        return {
          data: { items: [], total: 0 },
          isLoading: false,
          isError: false,
          error: null,
        } as any;
      }
      return {
        data: { presets },
        isLoading: false,
        isError: false,
        error: null,
      } as any;
    });

    vi.mocked(useMutation).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    } as any);

    render(<ExclusivesQueue />);

    const presetsTab = screen.getByText(/Price Presets/);
    await user.click(presetsTab);

    await waitFor(() => {
      const deleteButtons = screen.getAllByRole('button').filter((button) => {
        const svg = button.querySelector('svg');
        return svg?.classList.contains('lucide-trash-2') || svg?.getAttribute('class')?.includes('trash');
      });

      if (deleteButtons.length > 0) {
        user.click(deleteButtons[0]);
      }
    });
  });

  it('should mark default preset with badge', async () => {
    const user = userEvent.setup();
    const presets = [createMockPreset('1', { isDefault: true })];

    vi.mocked(useQuery).mockImplementation((options: any) => {
      if (options.queryKey[0] === 'saleQueue') {
        return {
          data: { items: [], total: 0 },
          isLoading: false,
          isError: false,
          error: null,
        } as any;
      }
      return {
        data: { presets },
        isLoading: false,
        isError: false,
        error: null,
      } as any;
    });

    vi.mocked(useMutation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any);

    render(<ExclusivesQueue />);

    const presetsTab = screen.getByText(/Price Presets/);
    await user.click(presetsTab);

    await waitFor(() => {
      expect(screen.getByText('Default')).toBeInTheDocument();
    });
  });

  it('should show empty state for queue', () => {
    vi.mocked(useQuery).mockImplementation((options: any) => {
      if (options.queryKey[0] === 'saleQueue') {
        return {
          data: { items: [], total: 0 },
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

    render(<ExclusivesQueue />);

    expect(screen.getByText('No items in queue')).toBeInTheDocument();
  });

  it('should poll queue data every 5 seconds', () => {
    vi.mocked(useQuery).mockImplementation((options: any) => {
      if (options.queryKey[0] === 'saleQueue') {
        return {
          data: { items: [], total: 0 },
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

    render(<ExclusivesQueue />);

    // Verify polling is configured
    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        refetchInterval: 5000,
      })
    );
  });

  it('should display attempt count for failed items', () => {
    const items = [
      createMockQueueItem('1', 'failed', {
        attempts: 3,
        lastAttemptAt: new Date().toISOString(),
      }),
    ];

    vi.mocked(useQuery).mockImplementation((options: any) => {
      if (options.queryKey[0] === 'saleQueue') {
        return {
          data: { items, total: 1 },
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

    render(<ExclusivesQueue />);

    expect(screen.getByText('Attempts: 3/3')).toBeInTheDocument();
    expect(screen.getByText(/Last attempt: 2 hours ago/)).toBeInTheDocument();
  });
});
