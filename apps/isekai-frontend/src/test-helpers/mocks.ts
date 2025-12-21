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

import { vi } from 'vitest';
import type { User } from '@isekai/shared';

// Mock user data
export const mockUser: User = {
  id: 'user-123',
  deviantartId: 'da-123',
  username: 'testuser',
  avatarUrl: 'https://example.com/avatar.jpg',
  email: 'test@example.com',
  createdAt: '2025-01-01T00:00:00Z',
};

// Mock auth store
export const mockAuthStore = {
  user: mockUser,
  isAuthenticated: true,
  isLoading: false,
  error: null,
  fetchUser: vi.fn(),
  logout: vi.fn(),
  setUser: vi.fn(),
};

// Mock React Router's useNavigate
export const mockNavigate = vi.fn();

// Mock API responses
export const mockDeviations = [
  {
    id: 'dev-1',
    title: 'Test Deviation 1',
    status: 'review',
    tags: ['tag1', 'tag2'],
    files: [],
  },
  {
    id: 'dev-2',
    title: 'Test Deviation 2',
    status: 'published',
    tags: ['tag3'],
    files: [],
  },
];
