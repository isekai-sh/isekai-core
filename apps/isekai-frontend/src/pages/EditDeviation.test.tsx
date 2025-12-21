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
import { EditDeviation } from './EditDeviation';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: vi.fn(),
    useNavigate: vi.fn(),
  };
});

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual('@tanstack/react-query');
  return {
    ...actual,
    useQuery: vi.fn(),
    useMutation: vi.fn(),
    useQueryClient: vi.fn(),
  };
});

vi.mock('@/lib/api', () => ({
  deviations: {
    get: vi.fn(),
    update: vi.fn(),
    schedule: vi.fn(),
    publishNow: vi.fn(),
    cancel: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
}));

vi.mock('@/lib/timezone', () => ({
  formatScheduleDateTime: vi.fn((date) => new Date(date).toLocaleString()),
}));

describe('EditDeviation', () => {
  const mockNavigate = vi.fn();
  const mockInvalidateQueries = vi.fn();
  const mockMutate = vi.fn();

  const mockDeviation = {
    id: 'dev-1',
    title: 'Test Deviation',
    description: 'Test description',
    status: 'draft',
    scheduledAt: null,
    files: [
      {
        id: 'file-1',
        r2Url: 'https://example.com/image.jpg',
        originalFilename: 'image.jpg',
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useParams).mockReturnValue({ id: 'dev-1' });
    vi.mocked(useNavigate).mockReturnValue(mockNavigate);
    vi.mocked(useQueryClient).mockReturnValue({
      invalidateQueries: mockInvalidateQueries,
    } as any);
  });

  const setupMocks = (deviation = mockDeviation, isLoading = false) => {
    vi.mocked(useQuery).mockReturnValue({
      data: deviation,
      isLoading,
      error: null,
      refetch: vi.fn(),
    } as any);

    vi.mocked(useMutation).mockImplementation((options: any) => ({
      mutate: mockMutate,
      mutateAsync: vi.fn(),
      isPending: false,
      isError: false,
      error: null,
    })) as any;
  };

  it('should display loading state', () => {
    setupMocks(null, true);
    render(<EditDeviation />);

    expect(screen.getByRole('status', { hidden: true })).toBeInTheDocument();
  });

  it('should display not found message when deviation does not exist', () => {
    setupMocks(null, false);
    render(<EditDeviation />);

    expect(screen.getByText('Deviation not found')).toBeInTheDocument();
  });

  it('should render deviation details when loaded', () => {
    setupMocks();
    render(<EditDeviation />);

    expect(screen.getByLabelText('Title')).toHaveValue('Test Deviation');
    expect(screen.getByLabelText('Description')).toHaveValue('Test description');
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  it('should display character count for title', () => {
    setupMocks();
    render(<EditDeviation />);

    expect(screen.getByText('14/50 characters')).toBeInTheDocument();
  });

  it('should update title when typing', async () => {
    setupMocks();
    const user = userEvent.setup();
    render(<EditDeviation />);

    const titleInput = screen.getByLabelText('Title');
    await user.clear(titleInput);
    await user.type(titleInput, 'Updated Title');

    expect(titleInput).toHaveValue('Updated Title');
    expect(screen.getByText('13/50 characters')).toBeInTheDocument();
  });

  it('should update description when typing', async () => {
    setupMocks();
    const user = userEvent.setup();
    render(<EditDeviation />);

    const descriptionInput = screen.getByLabelText('Description');
    await user.clear(descriptionInput);
    await user.type(descriptionInput, 'Updated description');

    expect(descriptionInput).toHaveValue('Updated description');
  });

  it('should disable save button when title is empty', async () => {
    setupMocks();
    const user = userEvent.setup();
    render(<EditDeviation />);

    const titleInput = screen.getByLabelText('Title');
    await user.clear(titleInput);

    const saveButton = screen.getByRole('button', { name: /save changes/i });
    expect(saveButton).toBeDisabled();
  });

  it('should call update mutation when save is clicked', async () => {
    setupMocks();
    const user = userEvent.setup();
    render(<EditDeviation />);

    const saveButton = screen.getByRole('button', { name: /save changes/i });
    await user.click(saveButton);

    expect(mockMutate).toHaveBeenCalled();
  });

  it('should disable editing when status is published', () => {
    setupMocks({ ...mockDeviation, status: 'published' });
    render(<EditDeviation />);

    const titleInput = screen.getByLabelText('Title');
    const descriptionInput = screen.getByLabelText('Description');

    expect(titleInput).toBeDisabled();
    expect(descriptionInput).toBeDisabled();
  });

  it('should show schedule button for draft with files', () => {
    setupMocks();
    render(<EditDeviation />);

    expect(screen.getByRole('button', { name: /schedule for later/i })).toBeInTheDocument();
  });

  it('should show publish now button for draft with files', () => {
    setupMocks();
    render(<EditDeviation />);

    expect(screen.getByRole('button', { name: /publish now/i })).toBeInTheDocument();
  });

  it('should not show schedule button when no files', () => {
    setupMocks({ ...mockDeviation, files: [] });
    render(<EditDeviation />);

    expect(screen.queryByRole('button', { name: /schedule for later/i })).not.toBeInTheDocument();
  });

  it('should show cancel schedule button for scheduled deviation', () => {
    setupMocks({
      ...mockDeviation,
      status: 'scheduled',
      scheduledAt: '2025-12-25T12:00:00Z',
    });
    render(<EditDeviation />);

    expect(screen.getByRole('button', { name: /cancel schedule/i })).toBeInTheDocument();
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
  });

  it('should open schedule dialog when schedule button is clicked', async () => {
    setupMocks();
    const user = userEvent.setup();
    render(<EditDeviation />);

    const scheduleButton = screen.getByRole('button', { name: /schedule for later/i });
    await user.click(scheduleButton);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getAllByText('Schedule Deviation').length).toBeGreaterThan(0);
    });
  });

  it('should close schedule dialog when cancel is clicked', async () => {
    setupMocks();
    const user = userEvent.setup();
    render(<EditDeviation />);

    const scheduleButton = screen.getByRole('button', { name: /schedule for later/i });
    await user.click(scheduleButton);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    const cancelButton = screen.getByRole('button', { name: /^cancel$/i });
    await user.click(cancelButton);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('should disable schedule button when date or time is missing', async () => {
    setupMocks();
    const user = userEvent.setup();
    render(<EditDeviation />);

    const scheduleButton = screen.getByRole('button', { name: /schedule for later/i });
    await user.click(scheduleButton);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    const dateInput = screen.getByLabelText('Date');
    await user.clear(dateInput);

    const submitButton = screen.getByRole('button', { name: /schedule deviation/i });
    expect(submitButton).toBeDisabled();
  });

  it('should display uploaded files', () => {
    setupMocks();
    render(<EditDeviation />);

    expect(screen.getByAltText('image.jpg')).toBeInTheDocument();
    expect(screen.getByText('Files')).toBeInTheDocument();
  });

  it('should show error message for failed deviation', () => {
    setupMocks({
      ...mockDeviation,
      status: 'failed',
      errorMessage: 'Upload failed due to network error',
    });
    render(<EditDeviation />);

    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('Error:')).toBeInTheDocument();
    expect(screen.getByText('Upload failed due to network error')).toBeInTheDocument();
  });

  it('should show DeviantArt link for published deviation', () => {
    setupMocks({
      ...mockDeviation,
      status: 'published',
      deviationUrl: 'https://deviantart.com/deviation/123',
    });
    render(<EditDeviation />);

    const link = screen.getByRole('link', { name: /view on deviantart/i });
    expect(link).toHaveAttribute('href', 'https://deviantart.com/deviation/123');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('should show delete confirmation dialog', async () => {
    setupMocks();
    const user = userEvent.setup();
    render(<EditDeviation />);

    const deleteButton = screen.getByRole('button', { name: /delete deviation/i });
    await user.click(deleteButton);

    await waitFor(() => {
      expect(screen.getByText('Are you sure?')).toBeInTheDocument();
      expect(screen.getByText(/permanently delete your deviation/i)).toBeInTheDocument();
    });
  });

  it('should call delete mutation when confirmed', async () => {
    setupMocks();
    const user = userEvent.setup();
    render(<EditDeviation />);

    const deleteButton = screen.getByRole('button', { name: /delete deviation/i });
    await user.click(deleteButton);

    await waitFor(() => {
      expect(screen.getByText('Are you sure?')).toBeInTheDocument();
    });

    const confirmButton = screen.getByRole('button', { name: /^delete$/i });
    await user.click(confirmButton);

    expect(mockMutate).toHaveBeenCalled();
  });

  it('should navigate back when close button is clicked', async () => {
    setupMocks();
    const user = userEvent.setup();
    render(<EditDeviation />);

    const closeButton = screen.getAllByRole('button')[0]; // First button is the X close button
    await user.click(closeButton);

    expect(mockNavigate).toHaveBeenCalledWith('/schedule');
  });

  it('should show status badge based on deviation status', () => {
    setupMocks({ ...mockDeviation, status: 'uploading' });
    render(<EditDeviation />);

    expect(screen.getByText('Publishing')).toBeInTheDocument();
  });

  it('should populate schedule fields when deviation has scheduled time', () => {
    setupMocks({
      ...mockDeviation,
      status: 'scheduled',
      scheduledAt: '2025-12-25T14:30:00Z',
    });
    render(<EditDeviation />);

    expect(screen.getByText('Scheduled')).toBeInTheDocument();
  });
});
