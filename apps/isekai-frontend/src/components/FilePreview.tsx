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

import { X, GripVertical, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface FileWithPreview {
  id: string;
  file: File;
  preview: string;
  progress?: number;
  error?: string;
}

interface FilePreviewProps {
  fileData: FileWithPreview;
  onRemove: (id: string) => void;
  isDragging?: boolean;
}

export function FilePreview({ fileData, onRemove, isDragging }: FilePreviewProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: fileData.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isUploading = fileData.progress !== undefined && fileData.progress < 100;
  const hasError = !!fileData.error;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative group rounded-lg border overflow-hidden ${
        isDragging ? 'opacity-50' : ''
      } ${hasError ? 'border-red-500' : 'border-border'}`}
    >
      {/* Image Preview */}
      <div className="aspect-square bg-muted">
        <img
          src={fileData.preview}
          alt={fileData.file.name}
          className="w-full h-full object-cover"
        />
      </div>

      {/* Drag Handle */}
      <div
        {...attributes}
        {...listeners}
        className="absolute top-2 left-2 p-1 bg-background/80 rounded cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <GripVertical className="h-4 w-4" />
      </div>

      {/* Remove Button */}
      <Button
        variant="destructive"
        size="icon"
        className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={() => onRemove(fileData.id)}
      >
        <X className="h-4 w-4" />
      </Button>

      {/* File Info */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
        <p className="text-xs text-white truncate">{fileData.file.name}</p>
        <p className="text-xs text-white/70">{(fileData.file.size / 1024 / 1024).toFixed(2)} MB</p>
      </div>

      {/* Upload Progress */}
      {isUploading && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
          <div className="text-center text-white">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
            <p className="text-sm">{fileData.progress}%</p>
          </div>
        </div>
      )}

      {/* Error State */}
      {hasError && (
        <div className="absolute inset-0 bg-red-500/10 flex items-center justify-center">
          <p className="text-xs text-red-600 dark:text-red-400 text-center px-2">
            {fileData.error}
          </p>
        </div>
      )}
    </div>
  );
}
