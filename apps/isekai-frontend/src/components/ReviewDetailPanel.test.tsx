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

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@/test-helpers/test-utils';
import { ReviewDetailPanel } from './ReviewDetailPanel';
import type { Deviation } from '@isekai/shared';

describe('ReviewDetailPanel images', () => {
  const deviation = {
    id: 'deviation-1',
    title: 'Variant-aware artwork',
    description: '',
    tags: [],
    files: [
      {
        storageUrl: 'https://storage.example/original.png',
        variants: [
          {
            width: 400,
            format: 'webp',
            storageUrl: 'https://storage.example/400.webp',
          },
          {
            width: 1200,
            format: 'webp',
            storageUrl: 'https://storage.example/1200.webp',
          },
        ],
      },
    ],
  } as Deviation;

  it('uses an XL variant inline and keeps the original for the deliberate lightbox', () => {
    render(
      <ReviewDetailPanel
        deviation={deviation}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onUpdate={vi.fn()}
      />
    );

    const inlineImage = screen.getByAltText(deviation.title);
    expect(inlineImage).toHaveAttribute('src', 'https://storage.example/1200.webp');

    fireEvent.click(inlineImage);

    const images = screen.getAllByAltText(deviation.title);
    expect(images).toHaveLength(2);
    expect(images[0]).toHaveAttribute('src', 'https://storage.example/1200.webp');
    expect(images[1]).toHaveAttribute('src', 'https://storage.example/original.png');
  });
});
