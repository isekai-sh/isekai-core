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
import { render, screen, fireEvent, waitFor } from '@/test-helpers/test-utils';
import userEvent from '@testing-library/user-event';
import { ReviewHeader } from './ReviewHeader';

vi.mock('@/components/TemplateSelector', () => ({
  TagTemplateSelector: ({ onSelect }: { onSelect: (tags: string[]) => void }) => (
    <button onClick={() => onSelect(['tag1', 'tag2'])}>
      Select Template
    </button>
  ),
}));

describe('ReviewHeader', () => {
  const mockProps = {
    count: 10,
    selectedCount: 3,
    bulkTags: [],
    setBulkTags: vi.fn(),
    onBulkApprove: vi.fn(),
    onBulkReject: vi.fn(),
  };

  it('should render bulk action buttons', () => {
    render(<ReviewHeader {...mockProps} />);

    expect(screen.getByText('Bulk Tag')).toBeInTheDocument();
    expect(screen.getByText('Reject')).toBeInTheDocument();
    expect(screen.getByText('Approve')).toBeInTheDocument();
  });

  it('should call onBulkApprove when approve is clicked', () => {
    render(<ReviewHeader {...mockProps} />);

    const approveButton = screen.getByText('Approve');
    approveButton.click();

    expect(mockProps.onBulkApprove).toHaveBeenCalled();
  });

  it('should call onBulkReject when reject is clicked', () => {
    render(<ReviewHeader {...mockProps} />);

    const rejectButton = screen.getByText('Reject');
    rejectButton.click();

    expect(mockProps.onBulkReject).toHaveBeenCalled();
  });

  it('should display existing bulk tags', async () => {
    const propsWithTags = {
      ...mockProps,
      bulkTags: ['tag1', 'tag2', 'tag3'],
    };
    const user = userEvent.setup();
    render(<ReviewHeader {...propsWithTags} />);

    const bulkTagButton = screen.getByText('Bulk Tag');
    await user.click(bulkTagButton);

    await waitFor(() => {
      expect(screen.getByText('tag1')).toBeInTheDocument();
      expect(screen.getByText('tag2')).toBeInTheDocument();
      expect(screen.getByText('tag3')).toBeInTheDocument();
    });
  });

  it('should add tag when Enter is pressed', async () => {
    const setBulkTags = vi.fn();
    const propsWithCallback = {
      ...mockProps,
      setBulkTags,
    };

    const user = userEvent.setup();
    render(<ReviewHeader {...propsWithCallback} />);

    const bulkTagButton = screen.getByText('Bulk Tag');
    await user.click(bulkTagButton);

    const input = await screen.findByPlaceholderText('Add tag and press Enter...');
    await user.type(input, 'newtag');
    await user.keyboard('{Enter}');

    expect(setBulkTags).toHaveBeenCalledWith(['newtag']);
  });

  it('should trim whitespace from tags', async () => {
    const setBulkTags = vi.fn();
    const propsWithCallback = {
      ...mockProps,
      setBulkTags,
    };

    const user = userEvent.setup();
    render(<ReviewHeader {...propsWithCallback} />);

    const bulkTagButton = screen.getByText('Bulk Tag');
    await user.click(bulkTagButton);

    const input = await screen.findByPlaceholderText('Add tag and press Enter...');
    await user.type(input, '  trimmed  ');
    await user.keyboard('{Enter}');

    expect(setBulkTags).toHaveBeenCalledWith(['trimmed']);
  });

  it('should not add duplicate tags', async () => {
    const setBulkTags = vi.fn();
    const propsWithCallback = {
      ...mockProps,
      bulkTags: ['existing'],
      setBulkTags,
    };

    const user = userEvent.setup();
    render(<ReviewHeader {...propsWithCallback} />);

    const bulkTagButton = screen.getByText('Bulk Tag');
    await user.click(bulkTagButton);

    const input = await screen.findByPlaceholderText('Add tag and press Enter...');
    await user.type(input, 'existing');
    await user.keyboard('{Enter}');

    expect(setBulkTags).not.toHaveBeenCalled();
  });

  it('should not add empty tags', async () => {
    const setBulkTags = vi.fn();
    const propsWithCallback = {
      ...mockProps,
      setBulkTags,
    };

    const user = userEvent.setup();
    render(<ReviewHeader {...propsWithCallback} />);

    const bulkTagButton = screen.getByText('Bulk Tag');
    await user.click(bulkTagButton);

    const input = await screen.findByPlaceholderText('Add tag and press Enter...');
    await user.type(input, '   ');
    await user.keyboard('{Enter}');

    expect(setBulkTags).not.toHaveBeenCalled();
  });

  it('should remove tag when × is clicked', async () => {
    const setBulkTags = vi.fn();
    const propsWithCallback = {
      ...mockProps,
      bulkTags: ['tag1', 'tag2', 'tag3'],
      setBulkTags,
    };

    const user = userEvent.setup();
    render(<ReviewHeader {...propsWithCallback} />);

    const bulkTagButton = screen.getByText('Bulk Tag');
    await user.click(bulkTagButton);

    const removeButtons = await screen.findAllByText('×');
    await user.click(removeButtons[1]); // Remove second tag

    expect(setBulkTags).toHaveBeenCalledWith(['tag1', 'tag3']);
  });

  it('should clear input after adding tag', async () => {
    const user = userEvent.setup();
    render(<ReviewHeader {...mockProps} />);

    const bulkTagButton = screen.getByText('Bulk Tag');
    await user.click(bulkTagButton);

    const input = (await screen.findByPlaceholderText(
      'Add tag and press Enter...'
    )) as HTMLInputElement;
    await user.type(input, 'newtag');
    await user.keyboard('{Enter}');

    expect(input.value).toBe('');
  });

  it('should apply template tags when template is selected', async () => {
    const setBulkTags = vi.fn();
    const propsWithCallback = {
      ...mockProps,
      setBulkTags,
    };

    const user = userEvent.setup();
    render(<ReviewHeader {...propsWithCallback} />);

    const bulkTagButton = screen.getByText('Bulk Tag');
    await user.click(bulkTagButton);

    const templateButton = await screen.findByText('Select Template');
    await user.click(templateButton);

    expect(setBulkTags).toHaveBeenCalledWith(['tag1', 'tag2']);
  });
});
