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

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { thumb, ImageSize } from '@/lib/image';
import {
  DollarSign,
  ExternalLink,
  Search,
  Check,
  FileImage,
  X,
  CheckCircle,
  Loader2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { deviations, pricePresets, saleQueue } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import type { Deviation } from '@isekai/shared';

const PAGE_SIZE = 50;

export function Published() {
  const queryClient = useQueryClient();
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  // Dialog state
  const [showPresetDialog, setShowPresetDialog] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');

  // Fetch published deviations with infinite scroll
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['deviations', 'published'],
    queryFn: async ({ pageParam = 1 }) => {
      return await deviations.list({ status: 'published', page: pageParam, limit: PAGE_SIZE });
    },
    getNextPageParam: (lastPage, allPages) => {
      const totalFetched = allPages.length * PAGE_SIZE;
      return totalFetched < lastPage.total ? allPages.length + 1 : undefined;
    },
    initialPageParam: 1,
  });

  const allPublished = data?.pages.flatMap((page) => page.deviations) || [];
  const totalCount = data?.pages[0]?.total || 0;

  // Intersection observer for infinite scroll
  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [target] = entries;
      if (target.isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    },
    [fetchNextPage, hasNextPage, isFetchingNextPage]
  );

  useEffect(() => {
    const element = loadMoreRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(handleObserver, {
      root: null,
      rootMargin: '100px',
      threshold: 0,
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [handleObserver]);

  // Filter based on search query
  const publishedDeviations = searchQuery
    ? allPublished.filter(
        (d) =>
          d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          d.tags?.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : allPublished;

  // Fetch price presets
  const { data: presetsData } = useQuery({
    queryKey: ['pricePresets'],
    queryFn: () => pricePresets.list(),
  });

  const presetsList = presetsData?.presets || [];

  // Fetch sale queue to know which items are already queued
  const { data: saleQueueData } = useQuery({
    queryKey: ['saleQueue'],
    queryFn: () => saleQueue.list({ status: 'pending' }),
  });

  // Set of deviation IDs already in the queue
  const queuedDeviationIds = new Set(saleQueueData?.items?.map((item) => item.deviationId) || []);

  // Add to queue mutation
  const addToQueueMutation = useMutation({
    mutationFn: (data: { deviationIds: string[]; pricePresetId: string }) =>
      saleQueue.addToQueue(data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['saleQueue'] });
      setSelectedIds(new Set());
      setShowPresetDialog(false);
      setSelectedPresetId('');
      toast({
        title: 'Added to Sale Queue',
        description: `${result.created} deviation(s) queued for exclusive sale. ${
          result.skipped > 0 ? `${result.skipped} already in queue.` : ''
        }`,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to add to sale queue',
        variant: 'destructive',
      });
    },
  });

  // Filter out already queued items for selection
  const selectableDeviations = publishedDeviations.filter((d) => !queuedDeviationIds.has(d.id));

  // Handlers
  const toggleSelectAll = () => {
    if (selectedIds.size === selectableDeviations.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableDeviations.map((d) => d.id)));
    }
  };

  const toggleSelect = (id: string) => {
    // Don't allow selecting already queued items
    if (queuedDeviationIds.has(id)) return;

    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleSetAsExclusive = () => {
    if (selectedIds.size === 0) {
      toast({
        title: 'No Selection',
        description: 'Please select at least one deviation',
        variant: 'destructive',
      });
      return;
    }

    // Pre-select default preset if available
    const defaultPreset = presetsList.find((p) => p.isDefault);
    if (defaultPreset) {
      setSelectedPresetId(defaultPreset.id);
    }

    setShowPresetDialog(true);
  };

  const handleSubmitPreset = () => {
    if (!selectedPresetId) {
      toast({
        title: 'No Preset Selected',
        description: 'Please select a price preset',
        variant: 'destructive',
      });
      return;
    }

    addToQueueMutation.mutate({
      deviationIds: Array.from(selectedIds),
      pricePresetId: selectedPresetId,
    });
  };

  const formatPrice = (cents: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(cents / 100);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <Card className="mb-3 flex-shrink-0">
        <CardContent className="p-3">
          <div className="flex items-center justify-between gap-2">
            {selectedIds.size === 0 ? (
              /* Default state - Search only */
              <>
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search published..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-8 w-64 pl-8 text-sm"
                  />
                </div>
                <div />
              </>
            ) : (
              /* Selection state - Bulk actions */
              <>
                <Button
                  onClick={() => setSelectedIds(new Set())}
                  variant="outline"
                  size="sm"
                  className="h-8"
                >
                  Clear selection
                </Button>
                <Button onClick={handleSetAsExclusive} size="sm" className="h-8">
                  <DollarSign className="h-4 w-4 mr-2" />
                  Set as Exclusive
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="flex-1 flex flex-col min-h-0 rounded-lg overflow-hidden">
        <CardContent className="p-0 flex-1 flex flex-col min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : publishedDeviations.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <CheckCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium mb-2">No published deviations</p>
                <p className="text-sm">Your published deviations will appear here</p>
              </div>
            </div>
          ) : (
            <>
              <Table wrapperClassName="flex-1 min-h-0">
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow className="border-b border-border hover:bg-transparent">
                    <TableHead className="w-12 pl-4 bg-card text-center">
                      <Checkbox
                        checked={
                          selectedIds.size === selectableDeviations.length &&
                          selectableDeviations.length > 0
                        }
                        onCheckedChange={toggleSelectAll}
                        disabled={selectableDeviations.length === 0}
                      />
                    </TableHead>
                    <TableHead className="w-16 bg-card">Preview</TableHead>
                    <TableHead className="bg-card">Title</TableHead>
                    <TableHead className="bg-card">Tags</TableHead>
                    <TableHead className="bg-card">Description</TableHead>
                    <TableHead className="bg-card">Published</TableHead>
                    <TableHead className="pr-4 bg-card text-center">Link</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {publishedDeviations.map((deviation) => (
                    <PublishedTableRow
                      key={deviation.id}
                      deviation={deviation}
                      isSelected={selectedIds.has(deviation.id)}
                      isQueued={queuedDeviationIds.has(deviation.id)}
                      onSelect={() => toggleSelect(deviation.id)}
                    />
                  ))}
                </TableBody>
              </Table>
              {/* Load more trigger */}
              <div ref={loadMoreRef} className="h-1" />
              {isFetchingNextPage && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}
              {/* Footer status bar */}
              <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 border-t bg-muted/30 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <CheckCircle className="h-3.5 w-3.5" />
                  <span>
                    {searchQuery
                      ? `Showing ${publishedDeviations.length} of ${allPublished.length} loaded (${totalCount} total)`
                      : `Showing ${allPublished.length} of ${totalCount} published`}
                  </span>
                </div>
                {selectedIds.size > 0 && (
                  <div className="flex items-center gap-1.5">
                    <Check className="h-3.5 w-3.5" />
                    <span>{selectedIds.size} selected</span>
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Price Preset Selection Dialog */}
      <Dialog open={showPresetDialog} onOpenChange={setShowPresetDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select Price Preset</DialogTitle>
            <DialogDescription>
              Choose a price template for {selectedIds.size} selected deviation(s)
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {presetsList.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <p className="mb-2">No price presets available</p>
                <p className="text-sm">Create a price preset first in the Price Presets page</p>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="preset-select">Price Preset</Label>
                <Select value={selectedPresetId} onValueChange={setSelectedPresetId}>
                  <SelectTrigger id="preset-select">
                    <SelectValue placeholder="Select a preset" />
                  </SelectTrigger>
                  <SelectContent>
                    {presetsList.map((preset) => (
                      <SelectItem key={preset.id} value={preset.id}>
                        {preset.name} - {formatPrice(preset.price, preset.currency)}
                        {preset.isDefault && ' (Default)'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowPresetDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmitPreset}
              disabled={
                !selectedPresetId || presetsList.length === 0 || addToQueueMutation.isPending
              }
            >
              Add to Queue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Published Table Row Component
function PublishedTableRow({
  deviation,
  isSelected,
  isQueued,
  onSelect,
}: {
  deviation: Deviation;
  isSelected: boolean;
  isQueued: boolean;
  onSelect: () => void;
}) {
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const publishedDate = deviation.publishedAt ? new Date(deviation.publishedAt) : null;

  // Handle ESC key to close lightbox
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
    // Don't allow selecting queued items
    if (isQueued) return;

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
    <TableRow
      className={`h-[68px] ${isQueued ? 'opacity-60' : 'cursor-pointer'}`}
      onClick={handleRowClick}
    >
      {/* Checkbox */}
      <TableCell className="py-1 pl-4 text-center">
        <Checkbox checked={isSelected} onCheckedChange={onSelect} disabled={isQueued} />
      </TableCell>

      {/* Preview */}
      <TableCell className="py-1">
        <div
          className="w-14 h-14 rounded overflow-hidden bg-muted flex items-center justify-center flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => deviation.files?.[0]?.storageUrl && setLightboxOpen(true)}
        >
          {deviation.files && deviation.files.length > 0 && deviation.files[0].storageUrl ? (
            <img
              src={thumb(deviation.files[0].storageUrl, ImageSize.XS)}
              alt={deviation.title}
              className="w-full h-full object-cover object-center"
            />
          ) : (
            <FileImage className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
      </TableCell>

      {/* Title */}
      <TableCell className="py-1 max-w-[200px]">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{deviation.title}</span>
          {isQueued && (
            <Badge variant="secondary" className="text-xs shrink-0">
              Queued as Exclusive
            </Badge>
          )}
        </div>
      </TableCell>

      {/* Tags */}
      <TableCell className="py-1">
        {deviation.tags && deviation.tags.length > 0 ? (
          <span className="text-sm text-muted-foreground">
            {deviation.tags.length} tag{deviation.tags.length !== 1 ? 's' : ''}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </TableCell>

      {/* Description */}
      <TableCell className="py-1">
        {deviation.description ? (
          <span className="text-sm text-muted-foreground">Has desc</span>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </TableCell>

      {/* Published Date */}
      <TableCell className="py-1">
        <span className="text-sm text-muted-foreground">
          {publishedDate &&
            publishedDate.toLocaleString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
        </span>
      </TableCell>

      {/* External Link */}
      <TableCell className="py-1 pr-4 text-center">
        {deviation.deviationUrl && (
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" asChild>
            <a href={deviation.deviationUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </Button>
        )}
      </TableCell>

      {/* Lightbox overlay - rendered via portal */}
      {lightboxOpen &&
        deviation.files?.[0]?.storageUrl &&
        createPortal(
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
          </div>,
          document.body
        )}
    </TableRow>
  );
}
