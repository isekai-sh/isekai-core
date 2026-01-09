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

import { create } from 'zustand';
import type { User } from '@isekai/shared';
import { auth } from '@/lib/api';

// Extended user type with instance role
interface ExtendedUser extends User {
  instanceRole?: 'admin' | 'member';
  isAdmin?: boolean;
}

interface AuthState {
  user: ExtendedUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isAdmin: boolean;
  error: string | null;
  fetchUser: () => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: ExtendedUser | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  isAdmin: false,
  error: null,

  fetchUser: async () => {
    try {
      set({ isLoading: true, error: null });
      const user = (await auth.getMe()) as ExtendedUser;
      set({
        user,
        isAuthenticated: true,
        isAdmin: user.isAdmin === true,
        isLoading: false,
      });
    } catch {
      set({ user: null, isAuthenticated: false, isAdmin: false, isLoading: false });
    }
  },

  logout: async () => {
    try {
      await auth.logout();
    } finally {
      set({ user: null, isAuthenticated: false, isAdmin: false });
    }
  },

  setUser: (user) => {
    set({
      user,
      isAuthenticated: !!user,
      isAdmin: user?.isAdmin === true,
      isLoading: false,
    });
  },
}));

// Initialize auth on app load
useAuthStore.getState().fetchUser();
