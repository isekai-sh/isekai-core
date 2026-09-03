/*
 * Copyright (C) 2025 Isekai
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { useEffect, useRef, useState } from 'react';
import type { ComponentType, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Check, ChevronLeft, ChevronRight, FileImage, Info, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { DescriptionTemplateSelector, TagTemplateSelector } from '@/components/TemplateSelector';
import { fallbackImageToOriginal, ImageSize, selectImageVariant } from '@/lib/image';
import type { Deviation } from '@isekai/shared';

export interface DecisionAction {
  label: string;
  mobileLabel?: string;
  shortcut?: string;
  icon?: ComponentType<{ className?: string }>;
  onAction: (id: string) => void;
  variant?: 'default' | 'outline' | 'destructive';
  disabled?: boolean;
}

interface DecisionDetailPanelProps {
  deviation: Deviation | undefined;
  primaryAction: DecisionAction;
  secondaryAction?: DecisionAction;
  onUpdate: (id: string, data: Partial<Deviation>) => void;
  disabled?: boolean;
  emptyMessage?: string;
  progressText?: string;
  onPrevious?: () => void;
  onNext?: () => void;
  hasPrevious?: boolean;
  hasNext?: boolean;
  contextMessage?: string;
}

interface MetadataEditorProps {
  deviation: Deviation;
  onUpdate: (id: string, data: Partial<Deviation>) => void;
  disabled?: boolean;
}

function MetadataEditor({ deviation, onUpdate, disabled }: MetadataEditorProps) {
  const [tags, setTags] = useState<string[]>(deviation.tags || []);
  const [description, setDescription] = useState(deviation.description || '');
  const [tagsOpen, setTagsOpen] = useState(false);
  const [descOpen, setDescOpen] = useState(false);
  const titleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTags(deviation.tags || []);
    setDescription(deviation.description || '');
    if (titleRef.current) titleRef.current.textContent = deviation.title;
  }, [deviation.id, deviation.description, deviation.tags, deviation.title]);

  const handleTitleBlur = () => {
    const nextTitle = titleRef.current?.textContent?.trim();
    if (nextTitle && nextTitle !== deviation.title) onUpdate(deviation.id, { title: nextTitle });
  };

  const handleTitleKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      titleRef.current?.blur();
    } else if (event.key === 'Escape') {
      if (titleRef.current) titleRef.current.textContent = deviation.title;
      titleRef.current?.blur();
    }
  };

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !tags.includes(trimmed)) setTags((current) => [...current, trimmed]);
  };

  return (
    <div className="space-y-2" data-testid="decision-details">
      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
          <Label className="text-xs">Title</Label>
          <div
            ref={titleRef}
            contentEditable={!disabled}
            suppressContentEditableWarning
            onBlur={handleTitleBlur}
            onKeyDown={handleTitleKeyDown}
            className="mt-1 min-h-8 rounded-md border p-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {deviation.title}
          </div>
        </div>

        <div className="w-36 sm:w-40">
          <Label className="text-xs">Tags</Label>
          <Popover open={tagsOpen} onOpenChange={setTagsOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                disabled={disabled}
                className="mt-1 h-8 w-full justify-start truncate px-2 text-xs font-normal"
              >
                {tags.length ? `${tags.length} tag${tags.length === 1 ? '' : 's'}` : 'Add tags...'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="end">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Tags</Label>
                  <TagTemplateSelector onSelect={setTags} />
                </div>
                <div className="flex flex-wrap gap-1">
                  {tags.map((tag, index) => (
                    <Badge key={`${tag}-${index}`} variant="secondary">
                      {tag}
                      <button
                        type="button"
                        aria-label={`Remove ${tag}`}
                        onClick={() => setTags((current) => current.filter((_, i) => i !== index))}
                        className="ml-1 rounded-full p-0.5 hover:bg-muted"
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
                <Input
                  aria-label="Add tag"
                  placeholder="Add tag and press Enter..."
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      addTag(event.currentTarget.value);
                      event.currentTarget.value = '';
                    }
                  }}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setTagsOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      onUpdate(deviation.id, { tags });
                      setTagsOpen(false);
                    }}
                  >
                    Apply
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div>
        <Label className="text-xs">Description</Label>
        <Popover open={descOpen} onOpenChange={setDescOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              className="mt-1 h-auto min-h-8 max-h-12 w-full justify-start overflow-hidden p-2 text-left text-xs font-normal"
            >
              {description || 'Add description...'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[min(24rem,calc(100vw-2rem))]" align="start">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Description</Label>
                <DescriptionTemplateSelector onSelect={setDescription} />
              </div>
              <Textarea
                aria-label="Description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Enter description..."
                rows={6}
              />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDescOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    onUpdate(deviation.id, { description });
                    setDescOpen(false);
                  }}
                >
                  Apply
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

function ActionButton({
  action,
  deviationId,
  disabled,
}: {
  action: DecisionAction;
  deviationId: string;
  disabled: boolean;
}) {
  const Icon = action.icon || Check;
  return (
    <Button
      type="button"
      variant={action.variant || 'default'}
      size="lg"
      disabled={disabled || action.disabled}
      aria-label={action.label}
      className="h-12 flex-1"
      onClick={() => action.onAction(deviationId)}
    >
      <Icon className="mr-2 h-5 w-5" />
      <span className="sm:hidden">{action.mobileLabel || action.label}</span>
      <span className="hidden sm:inline">{action.label}</span>
      {action.shortcut && (
        <kbd className="ml-2 hidden rounded border border-current/20 bg-background/20 px-1.5 py-0.5 text-[10px] font-normal xl:inline">
          {action.shortcut}
        </kbd>
      )}
    </Button>
  );
}

export function DecisionDetailPanel({
  deviation,
  primaryAction,
  secondaryAction,
  onUpdate,
  disabled = false,
  emptyMessage = 'No items to review',
  progressText,
  onPrevious,
  onNext,
  hasPrevious = false,
  hasNext = false,
  contextMessage,
}: DecisionDetailPanelProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    if (!lightboxOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLightboxOpen(false);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleEscape);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleEscape);
    };
  }, [lightboxOpen]);

  if (!deviation) {
    return (
      <Card className="flex min-h-0 w-full items-center justify-center rounded-lg xl:w-[70%]">
        <CardContent className="py-12 text-center">
          <FileImage className="mx-auto mb-4 h-12 w-12 opacity-50" />
          <p className="text-muted-foreground">{emptyMessage}</p>
        </CardContent>
      </Card>
    );
  }

  const file = deviation.files?.[0];
  return (
    <>
      <Card className="flex min-h-0 w-full flex-col rounded-lg xl:w-[70%]">
        <CardContent className="flex h-full min-h-0 flex-col p-3">
          {progressText && (
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground xl:hidden">
              <span>{progressText}</span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label="Previous draft"
                  disabled={disabled || !hasPrevious}
                  onClick={onPrevious}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label="Next draft"
                  disabled={disabled || !hasNext}
                  onClick={onNext}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
          {contextMessage && (
            <p className="mb-2 rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              {contextMessage}
            </p>
          )}
          <button
            type="button"
            aria-label={`Open full image for ${deviation.title}`}
            className="relative flex min-h-0 flex-1 cursor-zoom-in items-center justify-center overflow-hidden rounded-lg bg-[#0a0f0d] transition-opacity hover:opacity-90"
            onClick={() => file?.storageUrl && setLightboxOpen(true)}
          >
            {file?.storageUrl ? (
              <img
                src={selectImageVariant(file, ImageSize.XL)}
                alt={deviation.title}
                className="max-h-full max-w-full object-contain"
                decoding="async"
                onError={(event) => fallbackImageToOriginal(event.currentTarget, file.storageUrl)}
              />
            ) : (
              <FileImage className="h-12 w-12 text-muted-foreground" />
            )}
            {file && (
              <span className="pointer-events-none absolute bottom-2 right-2 rounded bg-black/60 px-2 py-1 text-[10px] text-white">
                {file.width && file.height ? `${file.width}×${file.height} · ` : ''}
                {(file.fileSize / 1024 / 1024).toFixed(1)}MB
              </span>
            )}
          </button>

          <div className="mt-3 hidden flex-shrink-0 border-t pt-3 md:block">
            <MetadataEditor deviation={deviation} onUpdate={onUpdate} disabled={disabled} />
          </div>
          <div className="mt-3 flex-shrink-0 border-t bg-card pt-3 md:mt-2">
            <div className="mb-2 md:hidden">
              <Sheet>
                <SheetTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 w-full"
                    disabled={disabled}
                  >
                    <Info className="mr-2 h-4 w-4" />
                    Details
                  </Button>
                </SheetTrigger>
                <SheetContent
                  side="bottom"
                  className="max-h-[80vh] overflow-y-auto rounded-t-xl pb-8"
                >
                  <SheetHeader className="mb-4 text-left">
                    <SheetTitle>Edit draft details</SheetTitle>
                    <SheetDescription>
                      Update the title, tags, or description before deciding.
                    </SheetDescription>
                  </SheetHeader>
                  <MetadataEditor deviation={deviation} onUpdate={onUpdate} disabled={disabled} />
                </SheetContent>
              </Sheet>
            </div>
            <div className="flex gap-2">
              {secondaryAction && (
                <ActionButton
                  action={secondaryAction}
                  deviationId={deviation.id}
                  disabled={disabled}
                />
              )}
              <ActionButton action={primaryAction} deviationId={deviation.id} disabled={disabled} />
            </div>
          </div>
        </CardContent>
      </Card>

      {lightboxOpen && file?.storageUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Full image for ${deviation.title}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightboxOpen(false)}
        >
          <div className="relative max-h-full max-w-full">
            <img
              src={file.storageUrl}
              alt={deviation.title}
              className="max-h-[95vh] max-w-full object-contain"
              onClick={(event) => event.stopPropagation()}
            />
            <Button
              type="button"
              aria-label="Close full image"
              variant="outline"
              size="icon"
              className="absolute right-4 top-4 border-white/20 bg-black/50 text-white hover:bg-black/70"
              onClick={() => setLightboxOpen(false)}
            >
              <X className="h-6 w-6" />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
