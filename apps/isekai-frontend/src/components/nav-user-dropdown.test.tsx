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
import { NavUserDropdown } from './nav-user-dropdown';
import { useAuthStore } from '@/stores/auth';

vi.mock('@/stores/auth');

describe('NavUserDropdown', () => {
  const mockLogout = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    delete (window as any).location;
    (window as any).location = { href: '' };
  });

  it('should display user information', async () => {
    vi.mocked(useAuthStore).mockReturnValue({
      user: {
        id: 'user-1',
        deviantartId: 'da-1',
        username: 'testuser',
        email: 'test@example.com',
        avatarUrl: 'https://example.com/avatar.jpg',
        createdAt: '2025-01-01T00:00:00Z',
      },
      logout: mockLogout,
      isAuthenticated: true,
      isLoading: false,
      error: null,
      fetchUser: vi.fn(),
      setUser: vi.fn(),
    });

    const user = userEvent.setup();
    render(<NavUserDropdown />);

    // Open dropdown to see user info
    const dropdownTrigger = screen.getByRole('button');
    await user.click(dropdownTrigger);

    expect(await screen.findByText('testuser')).toBeInTheDocument();
    expect(await screen.findByText('test@example.com')).toBeInTheDocument();
  });

  it('should compute initials from username', async () => {
    vi.mocked(useAuthStore).mockReturnValue({
      user: {
        id: 'user-1',
        deviantartId: 'da-1',
        username: 'John Doe',
        email: 'john@example.com',
        avatarUrl: '',
        createdAt: '2025-01-01T00:00:00Z',
      },
      logout: mockLogout,
      isAuthenticated: true,
      isLoading: false,
      error: null,
      fetchUser: vi.fn(),
      setUser: vi.fn(),
    });

    const user = userEvent.setup();
    render(<NavUserDropdown />);

    // Open dropdown to see both avatar instances
    const dropdownTrigger = screen.getByRole('button');
    await user.click(dropdownTrigger);

    await waitFor(() => {
      expect(screen.getAllByText('JD')).toHaveLength(2);
    });
  });

  it('should handle single word username', async () => {
    vi.mocked(useAuthStore).mockReturnValue({
      user: {
        id: 'user-1',
        deviantartId: 'da-1',
        username: 'Alice',
        email: 'alice@example.com',
        avatarUrl: '',
        createdAt: '2025-01-01T00:00:00Z',
      },
      logout: mockLogout,
      isAuthenticated: true,
      isLoading: false,
      error: null,
      fetchUser: vi.fn(),
      setUser: vi.fn(),
    });

    const user = userEvent.setup();
    render(<NavUserDropdown />);

    // Open dropdown to see both avatar instances
    const dropdownTrigger = screen.getByRole('button');
    await user.click(dropdownTrigger);

    await waitFor(() => {
      // Single word username should produce single letter initial
      expect(screen.getAllByText('A')).toHaveLength(2);
    });
  });

  it('should show DeviantArt link when username exists', () => {
    vi.mocked(useAuthStore).mockReturnValue({
      user: {
        id: 'user-1',
        deviantartId: 'da-1',
        username: 'testuser',
        email: 'test@example.com',
        avatarUrl: '',
        createdAt: '2025-01-01T00:00:00Z',
      },
      logout: mockLogout,
      isAuthenticated: true,
      isLoading: false,
      error: null,
      fetchUser: vi.fn(),
      setUser: vi.fn(),
    });

    render(<NavUserDropdown />);

    const daLink = screen.getByText('Open DeviantArt').closest('a');
    expect(daLink).toHaveAttribute('href', 'https://www.deviantart.com/testuser');
    expect(daLink).toHaveAttribute('target', '_blank');
  });

  it('should call logout and redirect when logout is clicked', async () => {
    vi.mocked(useAuthStore).mockReturnValue({
      user: {
        id: 'user-1',
        deviantartId: 'da-1',
        username: 'testuser',
        email: 'test@example.com',
        avatarUrl: '',
        createdAt: '2025-01-01T00:00:00Z',
      },
      logout: mockLogout,
      isAuthenticated: true,
      isLoading: false,
      error: null,
      fetchUser: vi.fn(),
      setUser: vi.fn(),
    });

    const user = userEvent.setup();
    render(<NavUserDropdown />);

    // Open dropdown first
    const dropdownTrigger = screen.getByRole('button');
    await user.click(dropdownTrigger);

    const logoutButton = await screen.findByText('Log out');
    await user.click(logoutButton);

    expect(mockLogout).toHaveBeenCalled();
    await waitFor(() => {
      expect(window.location.href).toBe('/login');
    });
  });

  it('should default to "User" when username is missing', async () => {
    vi.mocked(useAuthStore).mockReturnValue({
      user: {
        id: 'user-1',
        deviantartId: 'da-1',
        username: '',
        email: '',
        avatarUrl: '',
        createdAt: '2025-01-01T00:00:00Z',
      },
      logout: mockLogout,
      isAuthenticated: true,
      isLoading: false,
      error: null,
      fetchUser: vi.fn(),
      setUser: vi.fn(),
    });

    const user = userEvent.setup();
    render(<NavUserDropdown />);

    // Open dropdown to see username
    const dropdownTrigger = screen.getByRole('button');
    await user.click(dropdownTrigger);

    expect(await screen.findByText('User')).toBeInTheDocument();
  });

  it('should show Settings link', async () => {
    vi.mocked(useAuthStore).mockReturnValue({
      user: {
        id: 'user-1',
        deviantartId: 'da-1',
        username: 'testuser',
        email: 'test@example.com',
        avatarUrl: '',
        createdAt: '2025-01-01T00:00:00Z',
      },
      logout: mockLogout,
      isAuthenticated: true,
      isLoading: false,
      error: null,
      fetchUser: vi.fn(),
      setUser: vi.fn(),
    });

    const user = userEvent.setup();
    render(<NavUserDropdown />);

    // Open dropdown first
    const dropdownTrigger = screen.getByRole('button');
    await user.click(dropdownTrigger);

    const settingsLink = (await screen.findByText('Settings')).closest('a');
    expect(settingsLink).toHaveAttribute('href', '/settings');
  });

  it('should show API Keys link', async () => {
    vi.mocked(useAuthStore).mockReturnValue({
      user: {
        id: 'user-1',
        deviantartId: 'da-1',
        username: 'testuser',
        email: 'test@example.com',
        avatarUrl: '',
        createdAt: '2025-01-01T00:00:00Z',
      },
      logout: mockLogout,
      isAuthenticated: true,
      isLoading: false,
      error: null,
      fetchUser: vi.fn(),
      setUser: vi.fn(),
    });

    const user = userEvent.setup();
    render(<NavUserDropdown />);

    // Open dropdown first
    const dropdownTrigger = screen.getByRole('button');
    await user.click(dropdownTrigger);

    const apiKeysLink = (await screen.findByText('API Keys')).closest('a');
    expect(apiKeysLink).toHaveAttribute('href', '/api-keys');
  });
});
