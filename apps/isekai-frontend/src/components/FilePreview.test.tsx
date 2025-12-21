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
import { FilePreview } from './FilePreview';
import { DndContext } from '@dnd-kit/core';

// Mock dnd-kit/sortable
vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
  }),
}));

describe('FilePreview', () => {
  const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
  Object.defineProperty(mockFile, 'size', { value: 2097152 }); // 2MB

  const mockFileData = {
    id: 'file-1',
    file: mockFile,
    preview: 'blob:test-preview',
  };

  const mockOnRemove = vi.fn();

  const renderFilePreview = (props = {}) => {
    return render(
      <DndContext>
        <FilePreview
          fileData={mockFileData}
          onRemove={mockOnRemove}
          {...props}
        />
      </DndContext>
    );
  };

  it('should render file name', () => {
    renderFilePreview();
    expect(screen.getByText('test.jpg')).toBeInTheDocument();
  });

  it('should display file size in MB', () => {
    renderFilePreview();
    expect(screen.getByText('2.00 MB')).toBeInTheDocument();
  });

  it('should show upload progress when uploading', () => {
    const uploadingFileData = {
      ...mockFileData,
      progress: 50,
    };
    renderFilePreview({ fileData: uploadingFileData });

    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('should not show upload progress when complete', () => {
    const completeFileData = {
      ...mockFileData,
      progress: 100,
    };
    renderFilePreview({ fileData: completeFileData });

    expect(screen.queryByText('100%')).not.toBeInTheDocument();
  });

  it('should show error message when error exists', () => {
    const errorFileData = {
      ...mockFileData,
      error: 'Upload failed',
    };
    renderFilePreview({ fileData: errorFileData });

    expect(screen.getByText('Upload failed')).toBeInTheDocument();
  });

  it('should call onRemove when remove button is clicked', () => {
    renderFilePreview();
    const removeButton = screen.getByRole('button');
    removeButton.click();

    expect(mockOnRemove).toHaveBeenCalledWith('file-1');
  });

  it('should apply dragging opacity when isDragging is true', () => {
    const { container } = renderFilePreview({ isDragging: true });
    const divElement = container.querySelector('.opacity-50');
    expect(divElement).toBeInTheDocument();
  });

  it('should apply error border when error exists', () => {
    const errorFileData = {
      ...mockFileData,
      error: 'Upload failed',
    };
    const { container } = renderFilePreview({ fileData: errorFileData });
    const divElement = container.querySelector('.border-red-500');
    expect(divElement).toBeInTheDocument();
  });
});
