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
import { render, screen } from '@/test-helpers/test-utils';
import { Settings } from './Settings';
import { useAuthStore } from '@/stores/auth';

vi.mock('@/stores/auth');

describe('Settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render page title', () => {
    vi.mocked(useAuthStore).mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      fetchUser: vi.fn(),
      logout: vi.fn(),
      setUser: vi.fn(),
    });

    render(<Settings />);

    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('should render Connected Account section', () => {
    vi.mocked(useAuthStore).mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      fetchUser: vi.fn(),
      logout: vi.fn(),
      setUser: vi.fn(),
    });

    render(<Settings />);

    expect(screen.getByText('Connected Account')).toBeInTheDocument();
    expect(screen.getByText('Your connected DeviantArt account')).toBeInTheDocument();
  });

  it('should display user information with avatar', () => {
    const mockUser = {
      id: 'user1',
      username: 'testuser',
      deviantartId: '12345',
      avatarUrl: 'https://example.com/avatar.png',
    };

    vi.mocked(useAuthStore).mockReturnValue({
      user: mockUser,
      isAuthenticated: true,
      isLoading: false,
      error: null,
      fetchUser: vi.fn(),
      logout: vi.fn(),
      setUser: vi.fn(),
    });

    render(<Settings />);

    const avatar = screen.getByAltText('testuser');
    expect(avatar).toBeInTheDocument();
    expect(avatar).toHaveAttribute('src', 'https://example.com/avatar.png');
    expect(avatar).toHaveClass('h-16', 'w-16', 'rounded-full');

    expect(screen.getByText('testuser')).toBeInTheDocument();
    expect(screen.getByText('DeviantArt ID: 12345')).toBeInTheDocument();
  });

  it('should display user information without avatar', () => {
    const mockUser = {
      id: 'user1',
      username: 'testuser',
      deviantartId: '12345',
      avatarUrl: null,
    };

    vi.mocked(useAuthStore).mockReturnValue({
      user: mockUser,
      isAuthenticated: true,
      isLoading: false,
      error: null,
      fetchUser: vi.fn(),
      logout: vi.fn(),
      setUser: vi.fn(),
    });

    render(<Settings />);

    expect(screen.queryByAltText('testuser')).not.toBeInTheDocument();
    expect(screen.getByText('T')).toBeInTheDocument(); // First letter of username
    expect(screen.getByText('testuser')).toBeInTheDocument();
    expect(screen.getByText('DeviantArt ID: 12345')).toBeInTheDocument();
  });

  it('should display user information with empty avatar URL', () => {
    const mockUser = {
      id: 'user1',
      username: 'testuser',
      deviantartId: '12345',
      avatarUrl: '',
    };

    vi.mocked(useAuthStore).mockReturnValue({
      user: mockUser,
      isAuthenticated: true,
      isLoading: false,
      error: null,
      fetchUser: vi.fn(),
      logout: vi.fn(),
      setUser: vi.fn(),
    });

    render(<Settings />);

    expect(screen.queryByAltText('testuser')).not.toBeInTheDocument();
    expect(screen.getByText('T')).toBeInTheDocument(); // First letter of username
  });

  it('should display fallback avatar for lowercase username', () => {
    const mockUser = {
      id: 'user1',
      username: 'lowercaseuser',
      deviantartId: '12345',
      avatarUrl: null,
    };

    vi.mocked(useAuthStore).mockReturnValue({
      user: mockUser,
      isAuthenticated: true,
      isLoading: false,
      error: null,
      fetchUser: vi.fn(),
      logout: vi.fn(),
      setUser: vi.fn(),
    });

    render(<Settings />);

    expect(screen.getByText('L')).toBeInTheDocument(); // First letter uppercased
  });

  it('should handle user with undefined username', () => {
    const mockUser = {
      id: 'user1',
      username: undefined,
      deviantartId: '12345',
      avatarUrl: null,
    };

    vi.mocked(useAuthStore).mockReturnValue({
      user: mockUser as any,
      isAuthenticated: true,
      isLoading: false,
      error: null,
      fetchUser: vi.fn(),
      logout: vi.fn(),
      setUser: vi.fn(),
    });

    render(<Settings />);

    expect(screen.getByText('DeviantArt ID: 12345')).toBeInTheDocument();
  });

  it('should handle user with undefined deviantartId', () => {
    const mockUser = {
      id: 'user1',
      username: 'testuser',
      deviantartId: undefined,
      avatarUrl: 'https://example.com/avatar.png',
    };

    vi.mocked(useAuthStore).mockReturnValue({
      user: mockUser as any,
      isAuthenticated: true,
      isLoading: false,
      error: null,
      fetchUser: vi.fn(),
      logout: vi.fn(),
      setUser: vi.fn(),
    });

    render(<Settings />);

    expect(screen.getByText('testuser')).toBeInTheDocument();
  });

  it('should render correctly when user is null', () => {
    vi.mocked(useAuthStore).mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      fetchUser: vi.fn(),
      logout: vi.fn(),
      setUser: vi.fn(),
    });

    render(<Settings />);

    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Connected Account')).toBeInTheDocument();
    // Should not crash when user is null
  });

  it('should have proper card structure', () => {
    const mockUser = {
      id: 'user1',
      username: 'testuser',
      deviantartId: '12345',
      avatarUrl: 'https://example.com/avatar.png',
    };

    vi.mocked(useAuthStore).mockReturnValue({
      user: mockUser,
      isAuthenticated: true,
      isLoading: false,
      error: null,
      fetchUser: vi.fn(),
      logout: vi.fn(),
      setUser: vi.fn(),
    });

    const { container } = render(<Settings />);

    const card = container.querySelector('.space-y-6 > div');
    expect(card).toBeInTheDocument();
  });

  it('should display avatar with correct styling', () => {
    const mockUser = {
      id: 'user1',
      username: 'testuser',
      deviantartId: '12345',
      avatarUrl: 'https://example.com/avatar.png',
    };

    vi.mocked(useAuthStore).mockReturnValue({
      user: mockUser,
      isAuthenticated: true,
      isLoading: false,
      error: null,
      fetchUser: vi.fn(),
      logout: vi.fn(),
      setUser: vi.fn(),
    });

    render(<Settings />);

    const avatar = screen.getByAltText('testuser');
    expect(avatar.className).toContain('h-16');
    expect(avatar.className).toContain('w-16');
    expect(avatar.className).toContain('rounded-full');
  });

  it('should display fallback avatar with correct styling', () => {
    const mockUser = {
      id: 'user1',
      username: 'testuser',
      deviantartId: '12345',
      avatarUrl: null,
    };

    vi.mocked(useAuthStore).mockReturnValue({
      user: mockUser,
      isAuthenticated: true,
      isLoading: false,
      error: null,
      fetchUser: vi.fn(),
      logout: vi.fn(),
      setUser: vi.fn(),
    });

    const { container } = render(<Settings />);

    const fallbackAvatar = container.querySelector('.h-16.w-16.rounded-full.bg-muted');
    expect(fallbackAvatar).toBeInTheDocument();
  });

  it('should display username with correct styling', () => {
    const mockUser = {
      id: 'user1',
      username: 'testuser',
      deviantartId: '12345',
      avatarUrl: 'https://example.com/avatar.png',
    };

    vi.mocked(useAuthStore).mockReturnValue({
      user: mockUser,
      isAuthenticated: true,
      isLoading: false,
      error: null,
      fetchUser: vi.fn(),
      logout: vi.fn(),
      setUser: vi.fn(),
    });

    const { container } = render(<Settings />);

    const username = container.querySelector('.text-lg.font-medium');
    expect(username).toHaveTextContent('testuser');
  });
});
