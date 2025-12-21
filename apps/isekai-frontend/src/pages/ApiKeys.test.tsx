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
import { ApiKeys } from './ApiKeys';
import { useAuthStore } from '@/stores/auth';
import { apiKeys } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

vi.mock('@/stores/auth');
vi.mock('@/lib/api');
vi.mock('@/hooks/use-toast');

describe('ApiKeys', () => {
  const mockToast = vi.fn();
  const mockUser = {
    id: 'user1',
    username: 'testuser',
    deviantartId: '12345',
    avatarUrl: 'https://example.com/avatar.png',
  };

  const mockApiKeys = [
    {
      id: 'key1',
      name: 'ComfyUI Desktop',
      keyPrefix: 'isk_abc',
      revokedAt: null,
      lastUsedAt: '2025-01-15T10:00:00Z',
      createdAt: '2025-01-01T10:00:00Z',
    },
    {
      id: 'key2',
      name: 'ComfyUI Laptop',
      keyPrefix: 'isk_xyz',
      revokedAt: null,
      lastUsedAt: null,
      createdAt: '2025-01-10T10:00:00Z',
    },
    {
      id: 'key3',
      name: 'Old Key',
      keyPrefix: 'isk_old',
      revokedAt: '2025-01-14T10:00:00Z',
      lastUsedAt: '2025-01-12T10:00:00Z',
      createdAt: '2024-12-01T10:00:00Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuthStore).mockReturnValue({
      user: mockUser,
      isAuthenticated: true,
      isLoading: false,
      error: null,
      fetchUser: vi.fn(),
      logout: vi.fn(),
      setUser: vi.fn(),
    });
    vi.mocked(useToast).mockReturnValue({
      toast: mockToast,
      toasts: [],
      dismiss: vi.fn(),
    });
  });

  it('should render loading state', () => {
    vi.mocked(apiKeys.list).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    const { container } = render(<ApiKeys />);

    expect(screen.getByRole('heading', { name: 'API Keys' })).toBeInTheDocument();
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('should render empty state when no API keys exist', async () => {
    vi.mocked(apiKeys.list).mockResolvedValue({ apiKeys: [] });

    render(<ApiKeys />);

    await waitFor(() => {
      expect(screen.getByText('No API keys yet')).toBeInTheDocument();
    });

    expect(screen.getByText('Create your first API key to get started')).toBeInTheDocument();
  });

  it('should render API keys list with correct data', async () => {
    vi.mocked(apiKeys.list).mockResolvedValue({ apiKeys: mockApiKeys });

    render(<ApiKeys />);

    await waitFor(() => {
      expect(screen.getByText('ComfyUI Desktop')).toBeInTheDocument();
    });

    expect(screen.getByText('ComfyUI Laptop')).toBeInTheDocument();
    expect(screen.getByText('Old Key')).toBeInTheDocument();
    expect(screen.getAllByText('Active')).toHaveLength(2);
    expect(screen.getByText('Revoked')).toBeInTheDocument();
  });

  it('should display active key count in header', async () => {
    vi.mocked(apiKeys.list).mockResolvedValue({ apiKeys: mockApiKeys });

    render(<ApiKeys />);

    await waitFor(() => {
      expect(screen.getByText(/2 active/)).toBeInTheDocument();
    });
  });

  it('should display last used timestamps correctly', async () => {
    vi.mocked(apiKeys.list).mockResolvedValue({ apiKeys: mockApiKeys });

    render(<ApiKeys />);

    await waitFor(() => {
      expect(screen.getByText('Never')).toBeInTheDocument();
    });
  });

  it('should open create dialog when Create API Key button is clicked', async () => {
    const user = userEvent.setup();
    vi.mocked(apiKeys.list).mockResolvedValue({ apiKeys: [] });

    render(<ApiKeys />);

    await waitFor(() => {
      expect(screen.getByText('No API keys yet')).toBeInTheDocument();
    });

    const createButton = screen.getByRole('button', { name: /Create API Key/i });
    await user.click(createButton);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Give your API key a descriptive name to help identify it later')).toBeInTheDocument();
  });

  it('should create new API key successfully', async () => {
    const user = userEvent.setup();
    const newKey = {
      id: 'key4',
      name: 'New Key',
      key: 'isk_newapikey123456789',
      keyPrefix: 'isk_new',
      revokedAt: null,
      lastUsedAt: null,
      createdAt: new Date().toISOString(),
    };

    vi.mocked(apiKeys.list)
      .mockResolvedValueOnce({ apiKeys: [] })
      .mockResolvedValueOnce({ apiKeys: [newKey] });
    vi.mocked(apiKeys.create).mockResolvedValue(newKey);

    render(<ApiKeys />);

    await waitFor(() => {
      expect(screen.getByText('No API keys yet')).toBeInTheDocument();
    });

    // Open create dialog
    const createButton = screen.getByRole('button', { name: /Create API Key/i });
    await user.click(createButton);

    // Fill in name
    const nameInput = screen.getByPlaceholderText('e.g., ComfyUI Desktop');
    await user.type(nameInput, 'New Key');

    // Submit
    const submitButton = screen.getByRole('button', { name: 'Create' });
    await user.click(submitButton);

    await waitFor(() => {
      expect(apiKeys.create).toHaveBeenCalledWith({ name: 'New Key' });
    });

    // Should show the key display dialog
    await waitFor(() => {
      expect(screen.getByText('Copy this key now - it will never be shown again')).toBeInTheDocument();
    });

    expect(screen.getByDisplayValue('isk_newapikey123456789')).toBeInTheDocument();
    expect(mockToast).toHaveBeenCalledWith({
      title: 'API Key Created',
      description: 'Save it now - it will not be shown again',
    });
  });

  it('should disable create button when name is empty', async () => {
    const user = userEvent.setup();
    vi.mocked(apiKeys.list).mockResolvedValue({ apiKeys: [] });

    render(<ApiKeys />);

    await waitFor(() => {
      expect(screen.getByText('No API keys yet')).toBeInTheDocument();
    });

    const createButton = screen.getByRole('button', { name: /Create API Key/i });
    await user.click(createButton);

    const submitButton = screen.getByRole('button', { name: 'Create' });
    expect(submitButton).toBeDisabled();
  });

  it('should copy API key to clipboard', async () => {
    const user = userEvent.setup();
    const newKey = {
      id: 'key4',
      name: 'New Key',
      key: 'isk_newapikey123456789',
      keyPrefix: 'isk_new',
      revokedAt: null,
      lastUsedAt: null,
      createdAt: new Date().toISOString(),
    };

    vi.mocked(apiKeys.list).mockResolvedValue({ apiKeys: [] });
    vi.mocked(apiKeys.create).mockResolvedValue(newKey);

    // Mock clipboard API
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: writeTextMock,
      },
      writable: true,
      configurable: true,
    });

    render(<ApiKeys />);

    await waitFor(() => {
      expect(screen.getByText('No API keys yet')).toBeInTheDocument();
    });

    // Create a key
    const createButton = screen.getByRole('button', { name: /Create API Key/i });
    await user.click(createButton);

    const nameInput = screen.getByPlaceholderText('e.g., ComfyUI Desktop');
    await user.type(nameInput, 'New Key');

    const submitButton = screen.getByRole('button', { name: 'Create' });
    await user.click(submitButton);

    // Wait for key display dialog
    await waitFor(() => {
      expect(screen.getByText('Copy this key now - it will never be shown again')).toBeInTheDocument();
    });

    // Click copy button
    const copyButtons = screen.getAllByRole('button');
    const copyButton = copyButtons.find(btn => btn.querySelector('.lucide-copy'));
    await user.click(copyButton!);

    expect(writeTextMock).toHaveBeenCalledWith('isk_newapikey123456789');
    expect(mockToast).toHaveBeenCalledWith({
      title: 'Copied',
      description: 'API key copied to clipboard',
    });
  });

  it('should show error toast when create fails', async () => {
    const user = userEvent.setup();
    vi.mocked(apiKeys.list).mockResolvedValue({ apiKeys: [] });
    vi.mocked(apiKeys.create).mockRejectedValue(new Error('Failed to create API key'));

    render(<ApiKeys />);

    await waitFor(() => {
      expect(screen.getByText('No API keys yet')).toBeInTheDocument();
    });

    const createButton = screen.getByRole('button', { name: /Create API Key/i });
    await user.click(createButton);

    const nameInput = screen.getByPlaceholderText('e.g., ComfyUI Desktop');
    await user.type(nameInput, 'New Key');

    const submitButton = screen.getByRole('button', { name: 'Create' });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        title: 'Error',
        description: 'Failed to create API key',
        variant: 'destructive',
      });
    });
  });

  it('should render delete button for active keys', async () => {
    vi.mocked(apiKeys.list).mockResolvedValue({ apiKeys: mockApiKeys });

    render(<ApiKeys />);

    await waitFor(() => {
      expect(screen.getByText('ComfyUI Desktop')).toBeInTheDocument();
    });

    // Check that delete buttons exist for active keys
    const deleteButtons = screen.getAllByRole('button', { name: 'Delete API key' });

    // Should have 2 delete buttons (for 2 active keys)
    expect(deleteButtons.length).toBe(2);
  });

  it('should not show delete button for revoked keys', async () => {
    vi.mocked(apiKeys.list).mockResolvedValue({ apiKeys: mockApiKeys });

    render(<ApiKeys />);

    await waitFor(() => {
      expect(screen.getByText('Old Key')).toBeInTheDocument();
    });

    // Find the row with "Old Key" and check it doesn't have a delete button
    const rows = screen.getAllByRole('row');
    const revokedRow = rows.find((row) => row.textContent?.includes('Old Key'));

    expect(revokedRow).toBeDefined();
    const deleteButtonsInRow = revokedRow?.querySelectorAll('.lucide-trash-2');
    expect(deleteButtonsInRow).toHaveLength(0);
  });

  it('should close dialogs when cancel is clicked', async () => {
    const user = userEvent.setup();
    vi.mocked(apiKeys.list).mockResolvedValue({ apiKeys: [] });

    render(<ApiKeys />);

    await waitFor(() => {
      expect(screen.getByText('No API keys yet')).toBeInTheDocument();
    });

    // Open and close create dialog
    const createButton = screen.getByRole('button', { name: /Create API Key/i });
    await user.click(createButton);

    expect(screen.getByRole('dialog')).toBeInTheDocument();

    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    await user.click(cancelButton);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('should close key display dialog when Done is clicked', async () => {
    const user = userEvent.setup();
    const newKey = {
      id: 'key4',
      name: 'New Key',
      key: 'isk_newapikey123456789',
      keyPrefix: 'isk_new',
      revokedAt: null,
      lastUsedAt: null,
      createdAt: new Date().toISOString(),
    };

    vi.mocked(apiKeys.list).mockResolvedValue({ apiKeys: [] });
    vi.mocked(apiKeys.create).mockResolvedValue(newKey);

    render(<ApiKeys />);

    await waitFor(() => {
      expect(screen.getByText('No API keys yet')).toBeInTheDocument();
    });

    // Create a key
    const createButton = screen.getByRole('button', { name: /Create API Key/i });
    await user.click(createButton);

    const nameInput = screen.getByPlaceholderText('e.g., ComfyUI Desktop');
    await user.type(nameInput, 'New Key');

    const submitButton = screen.getByRole('button', { name: 'Create' });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Copy this key now - it will never be shown again')).toBeInTheDocument();
    });

    // Click Done
    const doneButton = screen.getByRole('button', { name: 'Done' });
    await user.click(doneButton);

    await waitFor(() => {
      expect(screen.queryByText('Copy this key now - it will never be shown again')).not.toBeInTheDocument();
    });
  });
});
