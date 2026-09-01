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
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import { describe, expect, it } from 'vitest';
import { fallbackImageToOriginal, selectImageVariant } from './image';

describe('selectImageVariant', () => {
  const original = 'https://storage.example/original.png';

  it('falls back to storageUrl when variants are absent', () => {
    expect(selectImageVariant({ storageUrl: original }, 400)).toBe(original);
    expect(selectImageVariant({ storageUrl: original, variants: null }, 400)).toBe(original);
  });

  it('selects the smallest variant that satisfies the target width', () => {
    const source = {
      storageUrl: original,
      variants: [
        { width: 1200, format: 'webp', storageUrl: 'https://storage.example/1200.webp' },
        { width: 128, format: 'webp', storageUrl: 'https://storage.example/128.webp' },
        { width: 400, format: 'webp', storageUrl: 'https://storage.example/400.webp' },
      ],
    };

    expect(selectImageVariant(source, 256)).toBe('https://storage.example/400.webp');
  });

  it('selects the largest variant when every variant is narrower than the target', () => {
    const source = {
      storageUrl: original,
      variants: [
        { width: 128, format: 'webp', storageUrl: 'https://storage.example/128.webp' },
        { width: 400, format: 'webp', storageUrl: 'https://storage.example/400.webp' },
      ],
    };

    expect(selectImageVariant(source, 1200)).toBe('https://storage.example/400.webp');
  });

  it('prefers modern formats when variants have the same width', () => {
    const source = {
      storageUrl: original,
      variants: [
        { width: 400, format: 'png', storageUrl: 'https://storage.example/400.png' },
        { width: 400, format: 'webp', storageUrl: 'https://storage.example/400.webp' },
        { width: 400, format: 'avif', storageUrl: 'https://storage.example/400.avif' },
      ],
    };

    expect(selectImageVariant(source, 400)).toBe('https://storage.example/400.avif');
  });

  it('ignores unusable variants and safely handles invalid targets', () => {
    const source = {
      storageUrl: original,
      variants: [
        { width: 0, format: 'webp', storageUrl: 'https://storage.example/zero.webp' },
        { width: 400, format: 'webp', storageUrl: '' },
      ],
    };

    expect(selectImageVariant(source, 400)).toBe(original);
    expect(selectImageVariant({ ...source, variants: [] }, Number.NaN)).toBe(original);
  });

  it('returns an empty URL when no source is available', () => {
    expect(selectImageVariant(undefined, 400)).toBe('');
    expect(selectImageVariant(null, 400)).toBe('');
  });
});

describe('fallbackImageToOriginal', () => {
  it('swaps a failed variant to the original URL only once', () => {
    const image = document.createElement('img');
    let assignedSrc = 'https://storage.example/400.webp';
    let assignments = 0;

    image.setAttribute('src', assignedSrc);
    Object.defineProperty(image, 'src', {
      configurable: true,
      get: () => assignedSrc,
      set: (value: string) => {
        assignments += 1;
        assignedSrc = value;
        image.setAttribute('src', value);
      },
    });

    fallbackImageToOriginal(image, 'https://storage.example/original.png');
    fallbackImageToOriginal(image, 'https://storage.example/original.png');

    expect(assignments).toBe(1);
    expect(image.getAttribute('src')).toBe('https://storage.example/original.png');
    expect(image.dataset.originalFallbackUrl).toBe('https://storage.example/original.png');
  });

  it('allows a reused image element to retry a different file original', () => {
    const image = document.createElement('img');
    image.setAttribute('src', 'https://storage.example/first-variant.webp');

    fallbackImageToOriginal(image, 'https://storage.example/first-original.png');
    image.setAttribute('src', 'https://storage.example/second-variant.webp');
    fallbackImageToOriginal(image, 'https://storage.example/second-original.png');

    expect(image.getAttribute('src')).toBe('https://storage.example/second-original.png');
    expect(image.dataset.originalFallbackUrl).toBe('https://storage.example/second-original.png');
  });
});
