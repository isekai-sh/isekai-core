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
import { Callback } from './Callback';
import { useAuthStore } from '@/stores/auth';
import { useNavigate, useSearchParams } from 'react-router-dom';

vi.mock('@/stores/auth');
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: vi.fn(),
    useSearchParams: vi.fn(),
  };
});

describe('Callback', () => {
  const mockNavigate = vi.fn();
  const mockFetchUser = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useNavigate).mockReturnValue(mockNavigate);
    mockFetchUser.mockResolvedValue(undefined); // Always return a promise
    vi.mocked(useAuthStore).mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      fetchUser: mockFetchUser,
      logout: vi.fn(),
      setUser: vi.fn(),
    });
  });

  it('should display loading state', () => {
    vi.mocked(useSearchParams).mockReturnValue([new URLSearchParams(), vi.fn()]);

    render(<Callback />);

    expect(screen.getByText('Connecting to DeviantArt...')).toBeInTheDocument();
  });

  it('should navigate to login with error when error param exists', async () => {
    const searchParams = new URLSearchParams({ error: 'access_denied' });
    vi.mocked(useSearchParams).mockReturnValue([searchParams, vi.fn()]);

    render(<Callback />);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/login?error=access_denied');
    });
  });

  it('should fetch user and navigate to browse on success', async () => {
    vi.mocked(useSearchParams).mockReturnValue([new URLSearchParams(), vi.fn()]);
    mockFetchUser.mockResolvedValue(undefined);

    render(<Callback />);

    await waitFor(() => {
      expect(mockFetchUser).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/browse');
    });
  });

  it('should encode error message in URL', async () => {
    const searchParams = new URLSearchParams({
      error: 'Invalid OAuth token',
    });
    vi.mocked(useSearchParams).mockReturnValue([searchParams, vi.fn()]);

    render(<Callback />);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        '/login?error=Invalid%20OAuth%20token'
      );
    });
  });
});
