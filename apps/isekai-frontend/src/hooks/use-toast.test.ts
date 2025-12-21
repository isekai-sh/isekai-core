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

import { describe, it, expect } from 'vitest';
import { reducer } from './use-toast';

describe('toast reducer', () => {
  const initialState = { toasts: [] };

  describe('ADD_TOAST', () => {
    it('should add a toast to empty state', () => {
      const toast = { id: '1', title: 'Test', open: true };
      const newState = reducer(initialState, {
        type: 'ADD_TOAST',
        toast,
      });

      expect(newState.toasts).toHaveLength(1);
      expect(newState.toasts[0]).toEqual(toast);
    });

    it('should add toast to beginning and respect limit', () => {
      const existingState = {
        toasts: [{ id: '1', title: 'First', open: true }],
      };
      const newToast = { id: '2', title: 'Second', open: true };

      const newState = reducer(existingState, {
        type: 'ADD_TOAST',
        toast: newToast,
      });

      // Since TOAST_LIMIT is 1, only the new toast should remain
      expect(newState.toasts).toHaveLength(1);
      expect(newState.toasts[0]).toEqual(newToast);
    });

    it('should respect TOAST_LIMIT of 1', () => {
      const existingState = {
        toasts: [{ id: '1', title: 'First', open: true }],
      };
      const newToast = { id: '2', title: 'Second', open: true };

      const newState = reducer(existingState, {
        type: 'ADD_TOAST',
        toast: newToast,
      });

      expect(newState.toasts).toHaveLength(1);
      expect(newState.toasts[0].id).toBe('2');
    });
  });

  describe('UPDATE_TOAST', () => {
    it('should update existing toast', () => {
      const state = {
        toasts: [
          { id: '1', title: 'Original', open: true },
          { id: '2', title: 'Other', open: true },
        ],
      };

      const newState = reducer(state, {
        type: 'UPDATE_TOAST',
        toast: { id: '1', title: 'Updated' },
      });

      expect(newState.toasts[0].title).toBe('Updated');
      expect(newState.toasts[1].title).toBe('Other');
    });

    it('should not modify other toasts', () => {
      const state = {
        toasts: [
          { id: '1', title: 'First', open: true },
          { id: '2', title: 'Second', open: true },
        ],
      };

      const newState = reducer(state, {
        type: 'UPDATE_TOAST',
        toast: { id: '1', description: 'New desc' },
      });

      expect(newState.toasts[1]).toEqual(state.toasts[1]);
    });
  });

  describe('DISMISS_TOAST', () => {
    it('should mark specific toast as closed', () => {
      const state = {
        toasts: [
          { id: '1', title: 'First', open: true },
          { id: '2', title: 'Second', open: true },
        ],
      };

      const newState = reducer(state, {
        type: 'DISMISS_TOAST',
        toastId: '1',
      });

      expect(newState.toasts[0].open).toBe(false);
      expect(newState.toasts[1].open).toBe(true);
    });

    it('should mark all toasts as closed when no toastId provided', () => {
      const state = {
        toasts: [
          { id: '1', title: 'First', open: true },
          { id: '2', title: 'Second', open: true },
        ],
      };

      const newState = reducer(state, {
        type: 'DISMISS_TOAST',
      });

      expect(newState.toasts[0].open).toBe(false);
      expect(newState.toasts[1].open).toBe(false);
    });
  });

  describe('REMOVE_TOAST', () => {
    it('should remove specific toast', () => {
      const state = {
        toasts: [
          { id: '1', title: 'First', open: true },
          { id: '2', title: 'Second', open: true },
        ],
      };

      const newState = reducer(state, {
        type: 'REMOVE_TOAST',
        toastId: '1',
      });

      expect(newState.toasts).toHaveLength(1);
      expect(newState.toasts[0].id).toBe('2');
    });

    it('should remove all toasts when no toastId provided', () => {
      const state = {
        toasts: [
          { id: '1', title: 'First', open: true },
          { id: '2', title: 'Second', open: true },
        ],
      };

      const newState = reducer(state, {
        type: 'REMOVE_TOAST',
      });

      expect(newState.toasts).toHaveLength(0);
    });

    it('should not modify state if toast not found', () => {
      const state = {
        toasts: [{ id: '1', title: 'First', open: true }],
      };

      const newState = reducer(state, {
        type: 'REMOVE_TOAST',
        toastId: '999',
      });

      expect(newState.toasts).toHaveLength(1);
    });
  });
});
