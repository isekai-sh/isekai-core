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

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test-helpers/test-utils';
import { ReviewGridItem } from './ReviewGridItem';
import type { Deviation } from '@isekai/shared';

describe('ReviewGridItem', () => {
  const mockDeviation: Deviation = {
    id: 'dev-1',
    userId: 'user-1',
    deviantartId: 'da-1',
    title: 'Test Deviation',
    description: 'Test description',
    tags: ['tag1', 'tag2', 'tag3'],
    isAiGenerated: false,
    isMature: false,
    allowComments: true,
    visibility: 'public',
    status: 'review',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    publishedAt: null,
    files: [
      {
        id: 'file-1',
        deviationId: 'dev-1',
        filename: 'test.jpg',
        storageKey: 'test-key',
        storageUrl: 'https://storage.isekai.sh/test.jpg',
        size: 1024,
        mimeType: 'image/jpeg',
        position: 0,
        createdAt: '2025-01-01T00:00:00Z',
      },
    ],
  };

  const mockOnToggleSelect = vi.fn();
  const mockOnFocus = vi.fn();

  it('should render in grid view mode', () => {
    render(
      <ReviewGridItem
        deviation={mockDeviation}
        isSelected={false}
        isFocused={false}
        viewMode="grid"
        onToggleSelect={mockOnToggleSelect}
        onFocus={mockOnFocus}
      />
    );

    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://storage.isekai.sh/test.jpg');
  });

  it('should render in list view mode', () => {
    render(
      <ReviewGridItem
        deviation={mockDeviation}
        isSelected={false}
        isFocused={false}
        viewMode="list"
        onToggleSelect={mockOnToggleSelect}
        onFocus={mockOnFocus}
      />
    );

    expect(screen.getByText('Test Deviation')).toBeInTheDocument();
  });

  it('should pluralize tags correctly with multiple tags', () => {
    render(
      <ReviewGridItem
        deviation={mockDeviation}
        isSelected={false}
        isFocused={false}
        viewMode="grid"
        onToggleSelect={mockOnToggleSelect}
        onFocus={mockOnFocus}
      />
    );

    expect(screen.getByText('3 tags')).toBeInTheDocument();
  });

  it('should singularize tag count for one tag', () => {
    const singleTagDeviation = {
      ...mockDeviation,
      tags: ['tag1'],
    };

    render(
      <ReviewGridItem
        deviation={singleTagDeviation}
        isSelected={false}
        isFocused={false}
        viewMode="grid"
        onToggleSelect={mockOnToggleSelect}
        onFocus={mockOnFocus}
      />
    );

    expect(screen.getByText('1 tag')).toBeInTheDocument();
  });

  it('should call onFocus when clicked', () => {
    const { container } = render(
      <ReviewGridItem
        deviation={mockDeviation}
        isSelected={false}
        isFocused={false}
        viewMode="grid"
        onToggleSelect={mockOnToggleSelect}
        onFocus={mockOnFocus}
      />
    );

    const gridItem = container.firstChild as HTMLElement;
    gridItem.click();

    expect(mockOnFocus).toHaveBeenCalled();
  });

  it('should call onToggleSelect when checkbox is clicked', () => {
    render(
      <ReviewGridItem
        deviation={mockDeviation}
        isSelected={false}
        isFocused={false}
        viewMode="grid"
        onToggleSelect={mockOnToggleSelect}
        onFocus={mockOnFocus}
      />
    );

    const checkbox = screen.getByRole('checkbox');
    checkbox.click();

    expect(mockOnToggleSelect).toHaveBeenCalled();
  });

  it('should show selected state', () => {
    render(
      <ReviewGridItem
        deviation={mockDeviation}
        isSelected={true}
        isFocused={false}
        viewMode="grid"
        onToggleSelect={mockOnToggleSelect}
        onFocus={mockOnFocus}
      />
    );

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeChecked();
  });

  it('should show focused state in list mode', () => {
    const { container } = render(
      <ReviewGridItem
        deviation={mockDeviation}
        isSelected={false}
        isFocused={true}
        viewMode="list"
        onToggleSelect={mockOnToggleSelect}
        onFocus={mockOnFocus}
      />
    );

    const listItem = container.querySelector('.bg-primary\\/20');
    expect(listItem).toBeInTheDocument();
  });

  it('should show placeholder when no file is available', () => {
    const noFileDeviation = {
      ...mockDeviation,
      files: [],
    };

    render(
      <ReviewGridItem
        deviation={noFileDeviation}
        isSelected={false}
        isFocused={false}
        viewMode="grid"
        onToggleSelect={mockOnToggleSelect}
        onFocus={mockOnFocus}
      />
    );

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('should not show tag badge when no tags', () => {
    const noTagDeviation = {
      ...mockDeviation,
      tags: [],
    };

    render(
      <ReviewGridItem
        deviation={noTagDeviation}
        isSelected={false}
        isFocused={false}
        viewMode="grid"
        onToggleSelect={mockOnToggleSelect}
        onFocus={mockOnFocus}
      />
    );

    expect(screen.queryByText(/tags?/)).not.toBeInTheDocument();
  });
});
