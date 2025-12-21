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
import { AutomationList } from './AutomationList';
import { automations } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

vi.mock('@/lib/api');
vi.mock('@/hooks/use-toast');
vi.mock('@/components/AutomationCard', () => ({
  AutomationCard: ({ automation, onDuplicate, onDelete }: any) => (
    <div data-testid={`automation-${automation.id}`}>
      <h3>{automation.name}</h3>
      <p>{automation.description}</p>
      <button onClick={() => onDuplicate(automation)}>Duplicate</button>
      <button onClick={() => onDelete(automation)}>Delete</button>
    </div>
  ),
}));
vi.mock('@/components/CreateAutomationDialog', () => ({
  CreateAutomationDialog: ({ open, onOpenChange, onSubmit }: any) =>
    open ? (
      <div data-testid="create-dialog">
        <button
          onClick={() => {
            onSubmit({ name: 'New Automation', description: 'Test description' });
          }}
        >
          Submit
        </button>
        <button onClick={() => onOpenChange(false)}>Cancel</button>
      </div>
    ) : null,
}));

describe('AutomationList', () => {
  const mockToast = vi.fn();
  const mockAutomations = [
    {
      id: 'auto1',
      name: 'Daily Posts',
      description: 'Post daily at 9 AM',
      enabled: true,
      draftSelectionMethod: 'fifo',
      stashOnlyByDefault: false,
      jitterMinSeconds: 0,
      jitterMaxSeconds: 300,
    },
    {
      id: 'auto2',
      name: 'Weekend Posts',
      description: 'Post on weekends',
      enabled: false,
      draftSelectionMethod: 'random',
      stashOnlyByDefault: true,
      jitterMinSeconds: 60,
      jitterMaxSeconds: 600,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useToast).mockReturnValue({
      toast: mockToast,
      toasts: [],
      dismiss: vi.fn(),
    });
  });

  it('should render loading state', () => {
    vi.mocked(automations.list).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    const { container } = render(<AutomationList />);

    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('should render empty state when no automations exist', async () => {
    vi.mocked(automations.list).mockResolvedValue({ automations: [] });

    render(<AutomationList />);

    await waitFor(() => {
      expect(screen.getByText('Get Started with Automation')).toBeInTheDocument();
    });

    expect(
      screen.getByText(
        'Create your first automated workflow to schedule drafts automatically based on your preferences.'
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create Your First Workflow/i })).toBeInTheDocument();
  });

  it('should render automations list', async () => {
    vi.mocked(automations.list).mockResolvedValue({ automations: mockAutomations });

    render(<AutomationList />);

    await waitFor(() => {
      expect(screen.getByText('Daily Posts')).toBeInTheDocument();
    });

    expect(screen.getByText('Weekend Posts')).toBeInTheDocument();
    expect(screen.getByText('Post daily at 9 AM')).toBeInTheDocument();
    expect(screen.getByText('Post on weekends')).toBeInTheDocument();
  });

  it('should display page header correctly', async () => {
    vi.mocked(automations.list).mockResolvedValue({ automations: mockAutomations });

    render(<AutomationList />);

    await waitFor(() => {
      expect(screen.getByText('Automation Workflows')).toBeInTheDocument();
    });

    expect(screen.getByText('Manage your publishing schedules')).toBeInTheDocument();
  });

  it('should open create dialog when New Workflow button is clicked', async () => {
    const user = userEvent.setup();
    vi.mocked(automations.list).mockResolvedValue({ automations: mockAutomations });

    render(<AutomationList />);

    await waitFor(() => {
      expect(screen.getByText('Daily Posts')).toBeInTheDocument();
    });

    const newWorkflowButton = screen.getByRole('button', { name: /New Workflow/i });
    await user.click(newWorkflowButton);

    expect(screen.getByTestId('create-dialog')).toBeInTheDocument();
  });

  it('should open create dialog when clicking create card', async () => {
    const user = userEvent.setup();
    vi.mocked(automations.list).mockResolvedValue({ automations: mockAutomations });

    const { container } = render(<AutomationList />);

    await waitFor(() => {
      expect(screen.getByText('Create New Workflow')).toBeInTheDocument();
    });

    const createCard = container.querySelector('.border-dashed');
    await user.click(createCard!);

    await waitFor(() => {
      expect(screen.getByTestId('create-dialog')).toBeInTheDocument();
    });
  });

  it('should create new automation successfully', async () => {
    const user = userEvent.setup();
    const newAutomation = {
      id: 'auto3',
      name: 'New Automation',
      description: 'Test description',
      enabled: false,
      draftSelectionMethod: 'fifo',
      stashOnlyByDefault: false,
      jitterMinSeconds: 0,
      jitterMaxSeconds: 300,
    };

    vi.mocked(automations.list)
      .mockResolvedValueOnce({ automations: mockAutomations })
      .mockResolvedValueOnce({ automations: [...mockAutomations, newAutomation] });
    vi.mocked(automations.create).mockResolvedValue({ automation: newAutomation });

    render(<AutomationList />);

    await waitFor(() => {
      expect(screen.getByText('Daily Posts')).toBeInTheDocument();
    });

    // Open create dialog
    const newWorkflowButton = screen.getByRole('button', { name: /New Workflow/i });
    await user.click(newWorkflowButton);

    // Submit form
    const submitButton = screen.getByRole('button', { name: 'Submit' });
    await user.click(submitButton);

    await waitFor(() => {
      expect(automations.create).toHaveBeenCalledWith({
        name: 'New Automation',
        description: 'Test description',
        draftSelectionMethod: 'fifo',
        stashOnlyByDefault: false,
        jitterMinSeconds: 0,
        jitterMaxSeconds: 300,
      });
    });

    expect(mockToast).toHaveBeenCalledWith({
      title: 'Success',
      description: 'Workflow created successfully',
    });
  });

  it('should show error toast when create fails', async () => {
    const user = userEvent.setup();
    vi.mocked(automations.list).mockResolvedValue({ automations: mockAutomations });
    vi.mocked(automations.create).mockRejectedValue(new Error('Failed to create'));

    render(<AutomationList />);

    await waitFor(() => {
      expect(screen.getByText('Daily Posts')).toBeInTheDocument();
    });

    const newWorkflowButton = screen.getByRole('button', { name: /New Workflow/i });
    await user.click(newWorkflowButton);

    const submitButton = screen.getByRole('button', { name: 'Submit' });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        title: 'Error',
        description: 'Failed to create',
        variant: 'destructive',
      });
    });
  });

  it('should duplicate automation successfully', async () => {
    const user = userEvent.setup();
    const duplicatedAutomation = {
      ...mockAutomations[0],
      id: 'auto3',
      name: 'Daily Posts (Copy)',
    };

    vi.mocked(automations.list)
      .mockResolvedValueOnce({ automations: mockAutomations })
      .mockResolvedValueOnce({ automations: [...mockAutomations, duplicatedAutomation] });
    vi.mocked(automations.create).mockResolvedValue({ automation: duplicatedAutomation });

    render(<AutomationList />);

    await waitFor(() => {
      expect(screen.getByText('Daily Posts')).toBeInTheDocument();
    });

    // Click duplicate button
    const duplicateButtons = screen.getAllByRole('button', { name: 'Duplicate' });
    await user.click(duplicateButtons[0]);

    await waitFor(() => {
      expect(automations.create).toHaveBeenCalledWith({
        name: 'Daily Posts (Copy)',
        description: 'Post daily at 9 AM',
        draftSelectionMethod: 'fifo',
        stashOnlyByDefault: false,
        jitterMinSeconds: 0,
        jitterMaxSeconds: 300,
      });
    });

    expect(mockToast).toHaveBeenCalledWith({
      title: 'Success',
      description: 'Workflow duplicated successfully',
    });
  });

  it('should show error toast when duplicate fails', async () => {
    const user = userEvent.setup();
    vi.mocked(automations.list).mockResolvedValue({ automations: mockAutomations });
    vi.mocked(automations.create).mockRejectedValue(new Error('Failed to duplicate'));

    render(<AutomationList />);

    await waitFor(() => {
      expect(screen.getByText('Daily Posts')).toBeInTheDocument();
    });

    const duplicateButtons = screen.getAllByRole('button', { name: 'Duplicate' });
    await user.click(duplicateButtons[0]);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        title: 'Error',
        description: 'Failed to duplicate',
        variant: 'destructive',
      });
    });
  });

  it('should open delete confirmation dialog when delete button is clicked', async () => {
    const user = userEvent.setup();
    vi.mocked(automations.list).mockResolvedValue({ automations: mockAutomations });

    render(<AutomationList />);

    await waitFor(() => {
      expect(screen.getByText('Daily Posts')).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByRole('button', { name: 'Delete' });
    await user.click(deleteButtons[0]);

    expect(screen.getByText('Delete Workflow?')).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to delete "Daily Posts"/)).toBeInTheDocument();
  });

  it('should delete automation successfully', async () => {
    const user = userEvent.setup();
    vi.mocked(automations.list)
      .mockResolvedValueOnce({ automations: mockAutomations })
      .mockResolvedValueOnce({ automations: [mockAutomations[1]] });
    vi.mocked(automations.delete).mockResolvedValue(undefined);

    render(<AutomationList />);

    await waitFor(() => {
      expect(screen.getByText('Daily Posts')).toBeInTheDocument();
    });

    // Click delete button
    const deleteButtons = screen.getAllByRole('button', { name: 'Delete' });
    await user.click(deleteButtons[0]);

    // Confirm delete
    const confirmButton = screen.getByRole('button', { name: 'Delete' });
    await user.click(confirmButton);

    await waitFor(() => {
      expect(automations.delete).toHaveBeenCalledWith('auto1');
    });

    expect(mockToast).toHaveBeenCalledWith({
      title: 'Success',
      description: 'Workflow deleted successfully',
    });
  });

  it('should show error toast when delete fails', async () => {
    const user = userEvent.setup();
    vi.mocked(automations.list).mockResolvedValue({ automations: mockAutomations });
    vi.mocked(automations.delete).mockRejectedValue(new Error('Failed to delete'));

    render(<AutomationList />);

    await waitFor(() => {
      expect(screen.getByText('Daily Posts')).toBeInTheDocument();
    });

    // Click delete button
    const deleteButtons = screen.getAllByRole('button', { name: 'Delete' });
    await user.click(deleteButtons[0]);

    // Confirm delete
    const confirmButton = screen.getByRole('button', { name: 'Delete' });
    await user.click(confirmButton);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        title: 'Error',
        description: 'Failed to delete',
        variant: 'destructive',
      });
    });
  });

  it('should cancel delete when cancel button is clicked', async () => {
    const user = userEvent.setup();
    vi.mocked(automations.list).mockResolvedValue({ automations: mockAutomations });

    render(<AutomationList />);

    await waitFor(() => {
      expect(screen.getByText('Daily Posts')).toBeInTheDocument();
    });

    // Click delete button
    const deleteButtons = screen.getAllByRole('button', { name: 'Delete' });
    await user.click(deleteButtons[0]);

    expect(screen.getByText('Delete Workflow?')).toBeInTheDocument();

    // Cancel
    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    await user.click(cancelButton);

    await waitFor(() => {
      expect(screen.queryByText('Delete Workflow?')).not.toBeInTheDocument();
    });

    expect(automations.delete).not.toHaveBeenCalled();
  });

  it('should show error toast when load fails', async () => {
    vi.mocked(automations.list).mockRejectedValue(new Error('Failed to load automations'));

    render(<AutomationList />);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        title: 'Error',
        description: 'Failed to load automations',
        variant: 'destructive',
      });
    });
  });

  it('should render create new card alongside existing automations', async () => {
    vi.mocked(automations.list).mockResolvedValue({ automations: mockAutomations });

    render(<AutomationList />);

    await waitFor(() => {
      expect(screen.getByText('Daily Posts')).toBeInTheDocument();
    });

    expect(screen.getByText('Create New Workflow')).toBeInTheDocument();
    expect(screen.getByText('Set up a new automated schedule')).toBeInTheDocument();
  });
});
