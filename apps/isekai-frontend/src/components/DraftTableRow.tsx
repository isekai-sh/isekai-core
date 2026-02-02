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

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileImage, Send, X } from 'lucide-react';
import { thumb, ImageSize } from '@/lib/image';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { TableCell, TableRow } from '@/components/ui/table';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { TagTemplateSelector, DescriptionTemplateSelector } from '@/components/TemplateSelector';
import { GallerySelector } from '@/components/GallerySelector';
import { deviations } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import type { Deviation } from '@isekai/shared';

interface DraftTableRowProps {
  draft: Deviation;
  isSelected: boolean;
  onSelect: () => void;
}

export function DraftTableRow({ draft, isSelected, onSelect }: DraftTableRowProps) {
  const queryClient = useQueryClient();
  const titleRef = useRef<HTMLDivElement>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [tags, setTags] = useState<string[]>(draft.tags || []);
  const [description, setDescription] = useState(draft.description || '');
  const [galleryIds, setGalleryIds] = useState<string[]>(draft.galleryIds || []);
  const [scheduledDate, setScheduledDate] = useState<Date | undefined>(undefined);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [descOpen, setDescOpen] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Deviation>) => deviations.update(draft.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deviations'] });
      toast({ title: 'Updated', description: 'Draft updated successfully' });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update draft',
        variant: 'destructive',
      });
    },
  });

  const scheduleMutation = useMutation({
    mutationFn: (scheduledAt: string) => deviations.schedule(draft.id, scheduledAt),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deviations', 'draft'] });
      queryClient.invalidateQueries({ queryKey: ['deviations', 'scheduled'] });
      toast({
        title: 'Scheduled',
        description: 'Draft scheduled successfully',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to schedule draft',
        variant: 'destructive',
      });
    },
  });

  const handleTitleBlur = () => {
    setIsEditingTitle(false);
    if (titleRef.current) {
      const newTitle = titleRef.current.textContent || '';
      if (newTitle !== draft.title && newTitle.trim()) {
        updateMutation.mutate({ title: newTitle.trim() });
      }
    }
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      titleRef.current?.blur();
    }
    if (e.key === 'Escape') {
      if (titleRef.current) {
        titleRef.current.textContent = draft.title;
      }
      titleRef.current?.blur();
    }
  };

  const handleTagsApply = () => {
    updateMutation.mutate({ tags });
    setTagsOpen(false);
  };

  const handleTagsClear = () => {
    setTags([]);
    updateMutation.mutate({ tags: [] });
    setTagsOpen(false);
  };

  const handleDescriptionApply = () => {
    updateMutation.mutate({ description });
    setDescOpen(false);
  };

  const handleSchedule = () => {
    if (scheduledDate) {
      const scheduledAt = scheduledDate.toISOString();
      scheduleMutation.mutate(scheduledAt);
    }
  };

  const removeTag = (index: number) => {
    const newTags = tags.filter((_, i) => i !== index);
    setTags(newTags);
  };

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
    }
  };

  useEffect(() => {
    if (isEditingTitle && titleRef.current) {
      titleRef.current.focus();
      const range = document.createRange();
      range.selectNodeContents(titleRef.current);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, [isEditingTitle]);

  // Sync local state with draft prop changes
  useEffect(() => {
    setTags(draft.tags || []);
    setDescription(draft.description || '');
    setGalleryIds(draft.galleryIds || []);
    setScheduledDate(draft.scheduledAt ? new Date(draft.scheduledAt) : undefined);
  }, [draft.tags, draft.description, draft.galleryIds, draft.scheduledAt]);

  // Handle ESC key to close lightbox and prevent body scroll
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && lightboxOpen) {
        setLightboxOpen(false);
      }
    };

    if (lightboxOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [lightboxOpen]);

  const handleRowClick = (e: React.MouseEvent) => {
    // Don't select if clicking on interactive elements
    const target = e.target as HTMLElement;
    const interactiveElements = ['BUTTON', 'INPUT', 'TEXTAREA', 'A', 'LABEL'];
    const isInteractive =
      interactiveElements.includes(target.tagName) ||
      target.closest('button') ||
      target.closest('input') ||
      target.closest('textarea') ||
      target.closest('a') ||
      target.closest('[role="checkbox"]') ||
      target.closest('[role="dialog"]') ||
      target.closest('[role="menu"]') ||
      target.closest('[data-radix-popper-content-wrapper]') ||
      target.contentEditable === 'true' ||
      target.closest('[contenteditable="true"]');

    if (!isInteractive) {
      onSelect();
    }
  };

  return (
    <TableRow className="h-[68px] cursor-pointer" onClick={handleRowClick}>
      {/* Checkbox */}
      <TableCell className="py-1 pl-4 text-center">
        <Checkbox checked={isSelected} onCheckedChange={onSelect} />
      </TableCell>

      {/* Preview */}
      <TableCell className="py-1">
        <div
          className="w-14 h-14 rounded overflow-hidden bg-muted flex items-center justify-center flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => draft.files?.[0]?.storageUrl && setLightboxOpen(true)}
        >
          {draft.files && draft.files.length > 0 && draft.files[0].storageUrl ? (
            <img
              src={thumb(draft.files[0].storageUrl, ImageSize.XS)}
              alt={draft.title}
              className="w-full h-full object-cover object-center"
            />
          ) : (
            <FileImage className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
      </TableCell>

      {/* Editable Title */}
      <TableCell className="py-1 max-w-[200px]">
        <div
          ref={titleRef}
          contentEditable={isEditingTitle}
          suppressContentEditableWarning
          onClick={() => setIsEditingTitle(true)}
          onBlur={handleTitleBlur}
          onKeyDown={handleTitleKeyDown}
          className={`font-medium cursor-text px-2 py-1 rounded text-sm truncate ${
            isEditingTitle ? 'bg-muted ring-2 ring-ring whitespace-normal' : 'hover:bg-muted/50'
          }`}
        >
          {draft.title}
        </div>
      </TableCell>

      {/* Tags with Popover */}
      <TableCell className="py-1 max-w-[100px]">
        <Popover open={tagsOpen} onOpenChange={setTagsOpen}>
          <PopoverTrigger asChild>
            <button className="text-left text-xs text-muted-foreground transition-colors truncate block w-full">
              {tags.length > 0 ? `${tags.length} tag${tags.length > 1 ? 's' : ''}` : '—'}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="start">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Tags</Label>
                <TagTemplateSelector onSelect={(templateTags) => setTags(templateTags)} />
              </div>
              <div className="flex flex-wrap gap-1">
                {tags.map((tag, idx) => (
                  <Badge key={idx} variant="secondary">
                    {tag}
                    <button
                      onClick={() => removeTag(idx)}
                      className="ml-1 hover:bg-muted rounded-full p-0.5"
                    >
                      ×
                    </button>
                  </Badge>
                ))}
              </div>
              <Input
                placeholder="Add tag and press Enter..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag(e.currentTarget.value);
                    e.currentTarget.value = '';
                  }
                }}
              />
              <div className="flex justify-between gap-2">
                <Button variant="outline" size="sm" onClick={handleTagsClear}>
                  Clear Tags
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setTagsOpen(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleTagsApply}>
                    Apply
                  </Button>
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </TableCell>

      {/* Description with Popover */}
      <TableCell className="py-1 max-w-[100px]">
        <Popover open={descOpen} onOpenChange={setDescOpen}>
          <PopoverTrigger asChild>
            <button className="text-left text-xs text-muted-foreground transition-colors truncate block w-full">
              {description ? 'Has desc' : '—'}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-96" align="start">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Description</Label>
                <DescriptionTemplateSelector onSelect={(text) => setDescription(text)} />
              </div>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Enter description..."
                rows={6}
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setDescOpen(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleDescriptionApply}>
                  Apply
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </TableCell>

      {/* Gallery Folders */}
      <TableCell className="py-1 max-w-[80px]">
        <GallerySelector
          selectedGalleryIds={galleryIds}
          onSelect={(ids) => {
            setGalleryIds(ids);
            updateMutation.mutate({ galleryIds: ids });
          }}
          triggerButton={
            <button className="text-left text-xs text-muted-foreground transition-colors truncate block w-full">
              {galleryIds.length > 0
                ? `${galleryIds.length} folder${galleryIds.length > 1 ? 's' : ''}`
                : '—'}
            </button>
          }
        />
      </TableCell>

      {/* Schedule Date & Time */}
      <TableCell className="py-1 max-w-[120px]">
        <Popover>
          <PopoverTrigger asChild>
            <button className="text-left text-xs text-muted-foreground transition-colors truncate block w-full">
              {scheduledDate
                ? scheduledDate.toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })
                : '—'}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-3" align="start">
            <DateTimePicker
              date={scheduledDate}
              setDate={(date) => {
                setScheduledDate(date);
                if (date) {
                  updateMutation.mutate({ scheduledAt: date.toISOString() });
                }
              }}
              label="Schedule"
            />
          </PopoverContent>
        </Popover>
      </TableCell>

      {/* Action */}
      <TableCell className="py-1 pr-4 text-center">
        <Button
          size="sm"
          variant="outline"
          className="h-7"
          onClick={() => {
            if (scheduledDate) {
              scheduleMutation.mutate(scheduledDate.toISOString());
            }
          }}
          disabled={!scheduledDate || scheduleMutation.isPending}
        >
          <Send className="h-3.5 w-3.5 mr-1.5" />
          Schedule
        </Button>
      </TableCell>

      {/* Lightbox overlay - rendered via portal */}
      {lightboxOpen &&
        draft.files?.[0]?.storageUrl &&
        createPortal(
          <div
            className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
            onClick={() => setLightboxOpen(false)}
          >
            <div className="relative max-w-full max-h-full">
              <img
                src={draft.files[0].storageUrl}
                alt={draft.title}
                className="max-w-full max-h-[95vh] object-contain"
                onClick={(e) => e.stopPropagation()}
              />
              <button
                className="absolute top-4 right-4 text-white bg-black/50 hover:bg-black/70 rounded-full p-2 transition-colors"
                onClick={() => setLightboxOpen(false)}
              >
                <X className="h-6 w-6" />
              </button>
            </div>
          </div>,
          document.body
        )}
    </TableRow>
  );
}
