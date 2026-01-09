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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@/test-helpers/test-utils';
import { AutomationDetail } from './AutomationDetail';
import { useParams } from 'react-router-dom';
import {
  automations,
  automationScheduleRules,
  automationDefaultValues,
  pricePresets,
} from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: vi.fn(),
    Link: ({ children, to, ...props }: any) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
  };
});
vi.mock('@/lib/api');
vi.mock('@/hooks/use-toast');
vi.mock('use-debounce', () => ({
  useDebouncedCallback: (fn: any) => {
    const debouncedFn = fn;
    debouncedFn.flush = vi.fn();
    return debouncedFn;
  },
}));
vi.mock('@/components/DefaultValuesList', () => ({
  DefaultValuesList: ({ values, onDelete, deletingId }: any) => (
    <div data-testid="default-values-list">
      {values.map((v: any) => (
        <div key={v.id}>
          <span>{v.fieldName}</span>
        </div>
      ))}
    </div>
  ),
}));
vi.mock('@/components/AddDefaultValueDialog', () => ({
  AddDefaultValueDialog: ({ open, onOpenChange, onSubmit }: any) =>
    open ? <div data-testid="add-default-dialog">Add Default Dialog</div> : null,
}));

describe('AutomationDetail', () => {
  const mockToast = vi.fn();
  const mockAutomation = {
    id: 'auto1',
    name: 'Daily Posts',
    description: 'Post daily at 9 AM',
    enabled: true,
    draftSelectionMethod: 'fifo',
    stashOnlyByDefault: false,
    jitterMinSeconds: 0,
    jitterMaxSeconds: 300,
    autoAddToSaleQueue: false,
    saleQueuePresetId: null,
  };

  const mockRules = [
    {
      id: 'rule1',
      type: 'fixed_time',
      timeOfDay: '09:00',
      enabled: true,
      priority: 0,
      daysOfWeek: ['monday', 'wednesday', 'friday'],
    },
  ];

  const mockDefaultValues = [
    {
      id: 'dv1',
      fieldName: 'tags',
      value: 'digital art',
      applyIfEmpty: true,
    },
  ];

  const mockLogs = [
    {
      id: 'log1',
      scheduledCount: 2,
      executedAt: '2025-01-15T09:00:00Z',
    },
  ];

  const mockPresets = [
    {
      id: 'preset1',
      name: 'Standard Price',
      price: 500,
      minPrice: null,
      maxPrice: null,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
    vi.mocked(useParams).mockReturnValue({ id: 'auto1' });
    vi.mocked(useToast).mockReturnValue({
      toast: mockToast,
      toasts: [],
      dismiss: vi.fn(),
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  it('should render loading state', () => {
    vi.mocked(automations.get).mockImplementation(() => new Promise(() => {}));
    vi.mocked(automationScheduleRules.list).mockImplementation(() => new Promise(() => {}));
    vi.mocked(automationDefaultValues.list).mockImplementation(() => new Promise(() => {}));
    vi.mocked(pricePresets.list).mockImplementation(() => new Promise(() => {}));

    const { container } = render(<AutomationDetail />);

    const skeletons = container.querySelectorAll('[class*="animate-pulse"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('should render automation not found state', async () => {
    vi.mocked(automations.get).mockResolvedValue({ automation: null });
    vi.mocked(automationScheduleRules.list).mockResolvedValue({ rules: [] });
    vi.mocked(automationDefaultValues.list).mockResolvedValue({ values: [] });
    vi.mocked(pricePresets.list).mockResolvedValue({ presets: [] });
    vi.mocked(automations.getLogs).mockResolvedValue({ logs: [] });

    const { unmount } = render(<AutomationDetail />);

    await waitFor(
      () => {
        expect(screen.getByText('Workflow Not Found')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    expect(
      screen.getByText(/The automation workflow you're looking for doesn't exist/)
    ).toBeInTheDocument();

    unmount();
  });

  it('should render automation details successfully', async () => {
    vi.mocked(automations.get).mockResolvedValue({ automation: mockAutomation });
    vi.mocked(automationScheduleRules.list).mockResolvedValue({ rules: mockRules });
    vi.mocked(automationDefaultValues.list).mockResolvedValue({
      values: mockDefaultValues,
    });
    vi.mocked(pricePresets.list).mockResolvedValue({ presets: mockPresets });
    vi.mocked(automations.getLogs).mockResolvedValue({ logs: mockLogs });

    const { unmount } = render(<AutomationDetail />);

    await waitFor(
      () => {
        expect(screen.getByText('Daily Posts')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    expect(screen.getByText('Post daily at 9 AM')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    unmount();
  });

  it('should display schedule rules', async () => {
    vi.mocked(automations.get).mockResolvedValue({ automation: mockAutomation });
    vi.mocked(automationScheduleRules.list).mockResolvedValue({ rules: mockRules });
    vi.mocked(automationDefaultValues.list).mockResolvedValue({
      values: mockDefaultValues,
    });
    vi.mocked(pricePresets.list).mockResolvedValue({ presets: mockPresets });
    vi.mocked(automations.getLogs).mockResolvedValue({ logs: mockLogs });

    const { unmount } = render(<AutomationDetail />);

    await waitFor(
      () => {
        expect(screen.getByText('Daily Posts')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    expect(screen.getByText('09:00')).toBeInTheDocument();
    expect(screen.getByText('Mon, Wed, Fri')).toBeInTheDocument();
    unmount();
  });

  it('should display default values', async () => {
    vi.mocked(automations.get).mockResolvedValue({ automation: mockAutomation });
    vi.mocked(automationScheduleRules.list).mockResolvedValue({ rules: mockRules });
    vi.mocked(automationDefaultValues.list).mockResolvedValue({
      values: mockDefaultValues,
    });
    vi.mocked(pricePresets.list).mockResolvedValue({ presets: mockPresets });
    vi.mocked(automations.getLogs).mockResolvedValue({ logs: mockLogs });

    const { unmount } = render(<AutomationDetail />);

    await waitFor(
      () => {
        expect(screen.getByText('Daily Posts')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    expect(screen.getByText('tags')).toBeInTheDocument();
    unmount();
  });

  it('should display activity logs', async () => {
    vi.mocked(automations.get).mockResolvedValue({ automation: mockAutomation });
    vi.mocked(automationScheduleRules.list).mockResolvedValue({ rules: mockRules });
    vi.mocked(automationDefaultValues.list).mockResolvedValue({
      values: mockDefaultValues,
    });
    vi.mocked(pricePresets.list).mockResolvedValue({ presets: mockPresets });
    vi.mocked(automations.getLogs).mockResolvedValue({ logs: mockLogs });

    const { unmount } = render(<AutomationDetail />);

    await waitFor(
      () => {
        expect(screen.getByText('Daily Posts')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    expect(screen.getByText('2 posts')).toBeInTheDocument();
    unmount();
  });

  it('should handle errors when loading automation', async () => {
    vi.mocked(automations.get).mockRejectedValue(new Error('Failed to load'));
    vi.mocked(automationScheduleRules.list).mockResolvedValue({ rules: [] });
    vi.mocked(automationDefaultValues.list).mockResolvedValue({ values: [] });
    vi.mocked(pricePresets.list).mockResolvedValue({ presets: [] });

    const { unmount } = render(<AutomationDetail />);

    await waitFor(
      () => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Error',
          description: 'Failed to load',
          variant: 'destructive',
        });
      },
      { timeout: 3000 }
    );
    unmount();
  });

  it('should show back to workflows link', async () => {
    vi.mocked(automations.get).mockResolvedValue({ automation: mockAutomation });
    vi.mocked(automationScheduleRules.list).mockResolvedValue({ rules: mockRules });
    vi.mocked(automationDefaultValues.list).mockResolvedValue({
      values: mockDefaultValues,
    });
    vi.mocked(pricePresets.list).mockResolvedValue({ presets: mockPresets });
    vi.mocked(automations.getLogs).mockResolvedValue({ logs: mockLogs });

    const { unmount } = render(<AutomationDetail />);

    await waitFor(
      () => {
        expect(screen.getByText('Daily Posts')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    const backLink = screen.getByText('Back to Workflows');
    expect(backLink).toBeInTheDocument();
    expect(backLink.closest('a')).toHaveAttribute('href', '/automation');
    unmount();
  });

  it('should display price presets when sale queue enabled', async () => {
    const automationWithSaleQueue = {
      ...mockAutomation,
      autoAddToSaleQueue: true,
      saleQueuePresetId: 'preset1',
      saleQueuePreset: mockPresets[0],
    };

    vi.mocked(automations.get).mockResolvedValue({ automation: automationWithSaleQueue });
    vi.mocked(automationScheduleRules.list).mockResolvedValue({ rules: mockRules });
    vi.mocked(automationDefaultValues.list).mockResolvedValue({
      values: mockDefaultValues,
    });
    vi.mocked(pricePresets.list).mockResolvedValue({ presets: mockPresets });
    vi.mocked(automations.getLogs).mockResolvedValue({ logs: mockLogs });

    const { unmount } = render(<AutomationDetail />);

    await waitFor(
      () => {
        expect(screen.getByText('Daily Posts')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    expect(screen.getAllByText('Standard Price').length).toBeGreaterThan(0);
    unmount();
  });

  it('should show no rules message when no rules exist', async () => {
    vi.mocked(automations.get).mockResolvedValue({ automation: mockAutomation });
    vi.mocked(automationScheduleRules.list).mockResolvedValue({ rules: [] });
    vi.mocked(automationDefaultValues.list).mockResolvedValue({
      values: mockDefaultValues,
    });
    vi.mocked(pricePresets.list).mockResolvedValue({ presets: mockPresets });
    vi.mocked(automations.getLogs).mockResolvedValue({ logs: mockLogs });

    const { unmount } = render(<AutomationDetail />);

    await waitFor(
      () => {
        expect(screen.getByText('Daily Posts')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    expect(screen.getByText('No rules yet')).toBeInTheDocument();
    unmount();
  });

  it('should show no activity message when no logs exist', async () => {
    vi.mocked(automations.get).mockResolvedValue({ automation: mockAutomation });
    vi.mocked(automationScheduleRules.list).mockResolvedValue({ rules: mockRules });
    vi.mocked(automationDefaultValues.list).mockResolvedValue({
      values: mockDefaultValues,
    });
    vi.mocked(pricePresets.list).mockResolvedValue({ presets: mockPresets });
    vi.mocked(automations.getLogs).mockResolvedValue({ logs: [] });

    const { unmount } = render(<AutomationDetail />);

    await waitFor(
      () => {
        expect(screen.getByText('Daily Posts')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    expect(screen.getByText('No activity yet')).toBeInTheDocument();
    unmount();
  });
});
