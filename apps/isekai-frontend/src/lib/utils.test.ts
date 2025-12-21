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
import { cn, calculateCardSize } from './utils';

describe('cn', () => {
  it('should merge class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('should handle conditional classes', () => {
    expect(cn('foo', false && 'bar', 'baz')).toBe('foo baz');
  });

  it('should merge tailwind classes correctly', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4');
  });

  it('should handle empty input', () => {
    expect(cn()).toBe('');
  });

  it('should handle array of classes', () => {
    expect(cn(['foo', 'bar'])).toBe('foo bar');
  });
});

describe('calculateCardSize', () => {
  describe('regular size', () => {
    it('should return regular for low engagement', () => {
      expect(calculateCardSize(0, 0)).toBe('regular');
      expect(calculateCardSize(100, 50)).toBe('regular');
    });

    it('should return regular for score below 300', () => {
      expect(calculateCardSize(200, 40)).toBe('regular');
      expect(calculateCardSize(100, 99)).toBe('regular');
    });
  });

  describe('medium size', () => {
    it('should return medium for score >= 300 and < 1000', () => {
      expect(calculateCardSize(300, 0)).toBe('medium');
      expect(calculateCardSize(100, 100)).toBe('medium');
      expect(calculateCardSize(200, 149)).toBe('medium');
    });

    it('should return medium at boundary', () => {
      expect(calculateCardSize(298, 1)).toBe('medium');
    });
  });

  describe('large size', () => {
    it('should return large for score >= 1000', () => {
      expect(calculateCardSize(1000, 0)).toBe('large');
      expect(calculateCardSize(500, 250)).toBe('large');
      expect(calculateCardSize(2000, 500)).toBe('large');
    });

    it('should return large at boundary', () => {
      expect(calculateCardSize(998, 1)).toBe('large');
    });
  });

  describe('comments weighting', () => {
    it('should weight comments 2x', () => {
      // 100 favourites + (50 comments * 2) = 200 total
      expect(calculateCardSize(100, 50)).toBe('regular');

      // 100 favourites + (100 comments * 2) = 300 total
      expect(calculateCardSize(100, 100)).toBe('medium');

      // 100 favourites + (450 comments * 2) = 1000 total
      expect(calculateCardSize(100, 450)).toBe('large');
    });
  });
});
