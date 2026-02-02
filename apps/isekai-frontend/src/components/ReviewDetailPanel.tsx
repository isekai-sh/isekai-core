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
import { Check, X, FileImage } from 'lucide-react';
import { thumb, ImageSize } from '@/lib/image';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TagTemplateSelector, DescriptionTemplateSelector } from '@/components/TemplateSelector';
import type { Deviation } from '@isekai/shared';

interface ReviewDetailPanelProps {
  deviation: Deviation | undefined;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onUpdate: (id: string, data: Partial<Deviation>) => void;
}

export function ReviewDetailPanel({
  deviation,
  onApprove,
  onReject,
  onUpdate,
}: ReviewDetailPanelProps) {
  const [tags, setTags] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [tagsOpen, setTagsOpen] = useState(false);
  const [descOpen, setDescOpen] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const titleRef = useRef<HTMLDivElement>(null);

  // Sync state when deviation changes
  useEffect(() => {
    if (deviation) {
      setTags(deviation.tags || []);
      setDescription(deviation.description || '');
      if (titleRef.current) {
        titleRef.current.textContent = deviation.title;
      }
    }
  }, [deviation?.id]);

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

  const handleTitleBlur = () => {
    if (titleRef.current && deviation) {
      const newTitle = titleRef.current.textContent || '';
      if (newTitle !== deviation.title && newTitle.trim()) {
        onUpdate(deviation.id, { title: newTitle.trim() });
      }
    }
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      titleRef.current?.blur();
    }
    if (e.key === 'Escape') {
      if (titleRef.current && deviation) {
        titleRef.current.textContent = deviation.title;
      }
      titleRef.current?.blur();
    }
  };

  const handleTagsApply = () => {
    if (deviation) {
      onUpdate(deviation.id, { tags });
      setTagsOpen(false);
    }
  };

  const handleDescriptionApply = () => {
    if (deviation) {
      onUpdate(deviation.id, { description });
      setDescOpen(false);
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

  if (!deviation) {
    return (
      <Card className="w-full xl:w-[60%] flex items-center justify-center min-h-0 rounded-lg">
        <CardContent className="text-center py-12">
          <FileImage className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-muted-foreground">No items to review</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="w-full xl:w-[70%] flex flex-col min-h-0 rounded-lg">
        <CardContent className="p-3 flex flex-col h-full min-h-0">
          {/* Fixed height image preview area */}
          <div
            className="flex-1 min-h-0 relative rounded-lg bg-[#0a0f0d] overflow-hidden cursor-pointer hover:opacity-90 transition-opacity flex items-center justify-center"
            onClick={() => setLightboxOpen(true)}
          >
            {deviation.files?.[0]?.storageUrl ? (
              <img
                src={thumb(deviation.files[0].storageUrl, ImageSize.LG)}
                alt={deviation.title}
                className="max-w-full max-h-full object-contain"
              />
            ) : (
              <FileImage className="h-12 w-12 text-muted-foreground" />
            )}

            {/* Image metadata overlay - bottom right */}
            {deviation.files?.[0] && (
              <div className="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] px-2 py-1 rounded space-x-2 pointer-events-none">
                {deviation.files[0].width && deviation.files[0].height && (
                  <span>
                    {deviation.files[0].width}×{deviation.files[0].height}
                  </span>
                )}
                <span>{(deviation.files[0].fileSize / 1024 / 1024).toFixed(1)}MB</span>
              </div>
            )}
          </div>

          {/* Fixed bottom area - actions */}
          <div className="flex-shrink-0 mt-3 pt-3 border-t space-y-2">
            {/* Title and Tags side by side */}
            <div className="flex gap-2">
              {/* Editable title */}
              <div className="flex-1">
                <Label className="text-xs">Title</Label>
                <div
                  ref={titleRef}
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={handleTitleBlur}
                  onKeyDown={handleTitleKeyDown}
                  className="mt-1 p-2 rounded-md border text-xs min-h-[2rem] focus:ring-2 focus:ring-ring focus:outline-none"
                >
                  {deviation.title}
                </div>
              </div>

              {/* Tag editor with Popover */}
              <div className="w-40">
                <Label className="text-xs">Tags</Label>
                <Popover open={tagsOpen} onOpenChange={setTagsOpen}>
                  <PopoverTrigger asChild>
                    <button className="w-full text-left p-2 rounded-md border text-xs hover:bg-muted/50 transition-colors mt-1 truncate">
                      {tags.length > 0
                        ? `${tags.length} tag${tags.length !== 1 ? 's' : ''}`
                        : 'Add tags...'}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80" align="end">
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
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => setTagsOpen(false)}>
                          Cancel
                        </Button>
                        <Button size="sm" onClick={handleTagsApply}>
                          Apply
                        </Button>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Description editor - compact */}
            <div>
              <Label className="text-xs">Description</Label>
              <Popover open={descOpen} onOpenChange={setDescOpen}>
                <PopoverTrigger asChild>
                  <button className="w-full text-left p-2 rounded-md border text-xs hover:bg-muted/50 transition-colors max-h-12 overflow-hidden mt-1">
                    {description || 'Add description...'}
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
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => onReject(deviation.id)}
              >
                <X className="h-4 w-4 mr-2" />
                Reject
              </Button>
              <Button size="sm" className="flex-1" onClick={() => onApprove(deviation.id)}>
                <Check className="h-4 w-4 mr-2" />
                Approve
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lightbox overlay */}
      {lightboxOpen && deviation.files?.[0]?.storageUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxOpen(false)}
        >
          <div className="relative max-w-full max-h-full">
            <img
              src={deviation.files[0].storageUrl}
              alt={deviation.title}
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
        </div>
      )}
    </>
  );
}
