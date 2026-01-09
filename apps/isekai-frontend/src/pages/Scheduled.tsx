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
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Clock,
  X,
  Zap,
  Folder,
  Tags as TagsIcon,
  Search,
  AlignLeft,
  Check,
  FileImage,
  Loader2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { GallerySelector } from '@/components/GallerySelector';
import { TagTemplateSelector, DescriptionTemplateSelector } from '@/components/TemplateSelector';
import { deviations } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import type { Deviation } from '@isekai/shared';

const PAGE_SIZE = 50;

export function Scheduled() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  // Bulk operation states
  const [bulkScheduleDate, setBulkScheduleDate] = useState<Date | undefined>(undefined);
  const [bulkGalleryIds, setBulkGalleryIds] = useState<string[]>([]);
  const [bulkTags, setBulkTags] = useState<string[]>([]);
  const [bulkDescription, setBulkDescription] = useState<string>('');
  const [tagsOpen, setTagsOpen] = useState(false);
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [showPublishNowDialog, setShowPublishNowDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  // Fetch scheduled deviations with infinite scroll
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['deviations', 'scheduled'],
    queryFn: async ({ pageParam = 1 }) => {
      return await deviations.list({ status: 'scheduled', page: pageParam, limit: PAGE_SIZE });
    },
    getNextPageParam: (lastPage, allPages) => {
      const totalFetched = allPages.length * PAGE_SIZE;
      return totalFetched < lastPage.total ? allPages.length + 1 : undefined;
    },
    initialPageParam: 1,
  });

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

  const allScheduled = data?.pages.flatMap((page) => page.deviations) || [];
  const totalCount = data?.pages[0]?.total || 0;

  // Filter based on search query
  const scheduledDeviations = searchQuery
    ? allScheduled.filter(
        (d) =>
          d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          d.tags?.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : allScheduled;

  // Mutations
  const batchRescheduleMutation = useMutation({
    mutationFn: async ({
      deviationIds,
      scheduledAt,
    }: {
      deviationIds: string[];
      scheduledAt: string;
    }) => {
      return await deviations.batchReschedule(deviationIds, scheduledAt);
    },
    onMutate: async ({ deviationIds, scheduledAt }) => {
      await queryClient.cancelQueries({ queryKey: ['deviations', 'scheduled'] });
      const previousData = queryClient.getQueryData(['deviations', 'scheduled']);

      queryClient.setQueryData(['deviations', 'scheduled'], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          deviations: old.deviations.map((dev: Deviation) =>
            deviationIds.includes(dev.id) ? { ...dev, scheduledAt } : dev
          ),
        };
      });

      return { previousData };
    },
    onError: (error: any, _variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['deviations', 'scheduled'], context.previousData);
      }
      toast({
        title: 'Error',
        description: error.message || 'Failed to reschedule',
        variant: 'destructive',
      });
    },
    onSuccess: () => {
      setSelectedIds(new Set());
      setBulkScheduleDate(undefined);
      toast({ title: 'Rescheduled', description: 'Successfully rescheduled' });
    },
  });

  const batchCancelMutation = useMutation({
    mutationFn: async (deviationIds: string[]) => {
      return await deviations.batchCancel(deviationIds);
    },
    onMutate: async (deviationIds) => {
      await queryClient.cancelQueries({ queryKey: ['deviations', 'scheduled'] });
      const previousData = queryClient.getQueryData(['deviations', 'scheduled']);

      queryClient.setQueryData(['deviations', 'scheduled'], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          deviations: old.deviations.filter((dev: Deviation) => !deviationIds.includes(dev.id)),
        };
      });

      return { previousData };
    },
    onError: (error: any, _variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['deviations', 'scheduled'], context.previousData);
      }
      toast({
        title: 'Error',
        description: error.message || 'Failed to cancel schedule',
        variant: 'destructive',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deviations', 'draft'] });
      setSelectedIds(new Set());
      setShowCancelDialog(false);
      toast({ title: 'Cancelled', description: 'Moved back to drafts' });
    },
  });

  const batchPublishNowMutation = useMutation({
    mutationFn: async (deviationIds: string[]) => {
      return await deviations.batchPublishNow(deviationIds);
    },
    onMutate: async (deviationIds) => {
      await queryClient.cancelQueries({ queryKey: ['deviations', 'scheduled'] });
      const previousData = queryClient.getQueryData(['deviations', 'scheduled']);

      queryClient.setQueryData(['deviations', 'scheduled'], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          deviations: old.deviations.filter((dev: Deviation) => !deviationIds.includes(dev.id)),
        };
      });

      return { previousData };
    },
    onError: (error: any, _variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['deviations', 'scheduled'], context.previousData);
      }
      toast({
        title: 'Error',
        description: error.message || 'Failed to publish',
        variant: 'destructive',
      });
    },
    onSuccess: () => {
      setSelectedIds(new Set());
      setShowPublishNowDialog(false);
      toast({ title: 'Publishing', description: 'Publishing now...' });
    },
  });

  const batchAssignGalleryMutation = useMutation({
    mutationFn: async ({
      deviationIds,
      galleryIds,
    }: {
      deviationIds: string[];
      galleryIds: string[];
    }) => {
      await Promise.all(deviationIds.map((id) => deviations.update(id, { galleryIds })));
    },
    onMutate: async ({ deviationIds, galleryIds }) => {
      await queryClient.cancelQueries({ queryKey: ['deviations', 'scheduled'] });
      const previousData = queryClient.getQueryData(['deviations', 'scheduled']);

      queryClient.setQueryData(['deviations', 'scheduled'], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          deviations: old.deviations.map((dev: Deviation) =>
            deviationIds.includes(dev.id) ? { ...dev, galleryIds } : dev
          ),
        };
      });

      return { previousData };
    },
    onSuccess: () => {
      setBulkGalleryIds([]);
      toast({ title: 'Updated', description: 'Gallery folders assigned' });
    },
    onError: (error: any, _variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['deviations', 'scheduled'], context.previousData);
      }
      toast({
        title: 'Error',
        description: error.message || 'Failed to assign gallery folders',
        variant: 'destructive',
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['deviations', 'scheduled'] });
    },
  });

  const batchAssignTagsMutation = useMutation({
    mutationFn: async ({ deviationIds, tags }: { deviationIds: string[]; tags: string[] }) => {
      await Promise.all(deviationIds.map((id) => deviations.update(id, { tags })));
    },
    onMutate: async ({ deviationIds, tags }) => {
      await queryClient.cancelQueries({ queryKey: ['deviations', 'scheduled'] });
      const previousData = queryClient.getQueryData(['deviations', 'scheduled']);

      queryClient.setQueryData(['deviations', 'scheduled'], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          deviations: old.deviations.map((dev: Deviation) =>
            deviationIds.includes(dev.id) ? { ...dev, tags } : dev
          ),
        };
      });

      return { previousData };
    },
    onSuccess: () => {
      setBulkTags([]);
      setTagsOpen(false);
      toast({ title: 'Updated', description: 'Tags assigned' });
    },
    onError: (error: any, _variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['deviations', 'scheduled'], context.previousData);
      }
      toast({
        title: 'Error',
        description: error.message || 'Failed to assign tags',
        variant: 'destructive',
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['deviations', 'scheduled'] });
    },
  });

  const batchAssignDescriptionMutation = useMutation({
    mutationFn: async ({
      deviationIds,
      description,
    }: {
      deviationIds: string[];
      description: string;
    }) => {
      await Promise.all(deviationIds.map((id) => deviations.update(id, { description })));
    },
    onMutate: async ({ deviationIds, description }) => {
      await queryClient.cancelQueries({ queryKey: ['deviations', 'scheduled'] });
      const previousData = queryClient.getQueryData(['deviations', 'scheduled']);

      queryClient.setQueryData(['deviations', 'scheduled'], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          deviations: old.deviations.map((dev: Deviation) =>
            deviationIds.includes(dev.id) ? { ...dev, description } : dev
          ),
        };
      });

      return { previousData };
    },
    onSuccess: () => {
      setBulkDescription('');
      setDescriptionOpen(false);
      toast({ title: 'Updated', description: 'Description assigned' });
    },
    onError: (error: any, _variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['deviations', 'scheduled'], context.previousData);
      }
      toast({
        title: 'Error',
        description: error.message || 'Failed to assign description',
        variant: 'destructive',
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['deviations', 'scheduled'] });
    },
  });

  // Handlers
  const toggleSelectAll = () => {
    if (selectedIds.size === scheduledDeviations.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(scheduledDeviations.map((d) => d.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleBulkAssignTags = () => {
    if (selectedIds.size === 0 || bulkTags.length === 0) return;
    batchAssignTagsMutation.mutate({
      deviationIds: Array.from(selectedIds),
      tags: bulkTags,
    });
  };

  const handleBulkClearTags = () => {
    if (selectedIds.size === 0) return;
    batchAssignTagsMutation.mutate({
      deviationIds: Array.from(selectedIds),
      tags: [],
    });
  };

  const handleBulkAssignDescription = () => {
    if (selectedIds.size === 0) return;
    batchAssignDescriptionMutation.mutate({
      deviationIds: Array.from(selectedIds),
      description: bulkDescription,
    });
  };

  const addBulkTag = (tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !bulkTags.includes(trimmed)) {
      setBulkTags([...bulkTags, trimmed]);
    }
  };

  const removeBulkTag = (index: number) => {
    setBulkTags(bulkTags.filter((_, i) => i !== index));
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <Card className="mb-3 flex-shrink-0">
        <CardContent className="p-3">
          <div className="flex items-center justify-between gap-2">
            {selectedIds.size === 0 ? (
              /* Default state - Search and Go to Drafts */
              <>
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search scheduled..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-8 w-64 pl-8 text-sm"
                  />
                </div>
                <Button
                  onClick={() => navigate('/draft')}
                  variant="outline"
                  size="sm"
                  className="h-8"
                >
                  Go to Drafts
                </Button>
              </>
            ) : (
              /* Selection state - Bulk actions */
              <>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => setSelectedIds(new Set())}
                    variant="outline"
                    size="sm"
                    className="h-8"
                  >
                    Clear selection
                  </Button>
                  <div className="h-4 w-px bg-border" />
                  <DateTimePicker
                    date={bulkScheduleDate}
                    setDate={(date) => {
                      setBulkScheduleDate(date);
                      if (date && selectedIds.size > 0) {
                        batchRescheduleMutation.mutate({
                          deviationIds: Array.from(selectedIds),
                          scheduledAt: date.toISOString(),
                        });
                      }
                    }}
                    label=""
                  />
                  <GallerySelector
                    selectedGalleryIds={bulkGalleryIds}
                    onSelect={(galleryIds) => {
                      setBulkGalleryIds(galleryIds);
                      if (selectedIds.size > 0) {
                        batchAssignGalleryMutation.mutate({
                          deviationIds: Array.from(selectedIds),
                          galleryIds,
                        });
                      }
                    }}
                    triggerButton={
                      <Button variant="outline" size="sm" className="h-8">
                        <Folder className="h-4 w-4 mr-2" />
                        Folder
                      </Button>
                    }
                  />
                  <Popover open={tagsOpen} onOpenChange={setTagsOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8">
                        <TagsIcon className="h-4 w-4 mr-2" />
                        Tags
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80" align="start">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label>Tags</Label>
                          <TagTemplateSelector
                            onSelect={(templateTags) => setBulkTags(templateTags)}
                          />
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {bulkTags.map((tag, idx) => (
                            <Badge key={idx} variant="secondary">
                              {tag}
                              <button
                                onClick={() => removeBulkTag(idx)}
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
                              addBulkTag(e.currentTarget.value);
                              e.currentTarget.value = '';
                            }
                          }}
                        />
                        <div className="flex justify-between gap-2">
                          <Button variant="outline" size="sm" onClick={handleBulkClearTags}>
                            Clear Tags
                          </Button>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => setTagsOpen(false)}>
                              Cancel
                            </Button>
                            <Button size="sm" onClick={handleBulkAssignTags}>
                              Apply
                            </Button>
                          </div>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                  <Popover open={descriptionOpen} onOpenChange={setDescriptionOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8">
                        <AlignLeft className="h-4 w-4 mr-2" />
                        Description
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-96" align="start">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label>Description</Label>
                          <DescriptionTemplateSelector
                            onSelect={(text) => setBulkDescription(text)}
                          />
                        </div>
                        <Textarea
                          value={bulkDescription}
                          onChange={(e) => setBulkDescription(e.target.value)}
                          placeholder="Enter description..."
                          rows={6}
                        />
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setDescriptionOpen(false)}
                          >
                            Cancel
                          </Button>
                          <Button size="sm" onClick={handleBulkAssignDescription}>
                            Apply
                          </Button>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                  <div className="h-4 w-px bg-border" />
                  <Button
                    onClick={() => setShowCancelDialog(true)}
                    variant="outline"
                    size="sm"
                    className="h-8"
                  >
                    <X className="h-4 w-4 mr-2" />
                    Cancel Selected
                  </Button>
                </div>
                <Button onClick={() => setShowPublishNowDialog(true)} size="sm" className="h-8">
                  <Zap className="h-4 w-4 mr-2" />
                  Publish Now
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
          ) : scheduledDeviations.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium mb-2">No scheduled deviations</p>
                <p className="text-sm">Schedule deviations from your drafts to see them here</p>
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
                          selectedIds.size === scheduledDeviations.length &&
                          scheduledDeviations.length > 0
                        }
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead className="w-16 bg-card">Preview</TableHead>
                    <TableHead className="bg-card">Title</TableHead>
                    <TableHead className="bg-card">Tags</TableHead>
                    <TableHead className="bg-card">Description</TableHead>
                    <TableHead className="bg-card">Folders</TableHead>
                    <TableHead className="bg-card">Schedule</TableHead>
                    <TableHead className="pr-4 bg-card">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scheduledDeviations.map((deviation) => (
                    <ScheduledTableRow
                      key={deviation.id}
                      deviation={deviation}
                      isSelected={selectedIds.has(deviation.id)}
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
                  <Clock className="h-3.5 w-3.5" />
                  <span>
                    {searchQuery
                      ? `Showing ${scheduledDeviations.length} of ${allScheduled.length} loaded (${totalCount} total)`
                      : `Showing ${allScheduled.length} of ${totalCount} scheduled`}
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

      {/* Publish Now Confirmation Dialog */}
      <AlertDialog open={showPublishNowDialog} onOpenChange={setShowPublishNowDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Publish {selectedIds.size} deviation{selectedIds.size > 1 ? 's' : ''} now?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will bypass the schedule and publish immediately. The deviations will be uploaded
              to DeviantArt right away.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => batchPublishNowMutation.mutate(Array.from(selectedIds))}
            >
              Publish Now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Cancel {selectedIds.size} scheduled deviation{selectedIds.size > 1 ? 's' : ''}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will move the selected deviations back to drafts. You can reschedule them later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Scheduled</AlertDialogCancel>
            <AlertDialogAction onClick={() => batchCancelMutation.mutate(Array.from(selectedIds))}>
              Move to Drafts
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Scheduled Table Row Component
function ScheduledTableRow({
  deviation,
  isSelected,
  onSelect,
}: {
  deviation: Deviation;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const scheduledDate = deviation.scheduledAt ? new Date(deviation.scheduledAt) : null;
  const timeUntil = scheduledDate ? getTimeUntil(scheduledDate) : null;

  // Status logic: scheduled -> queued (T+1 hour) -> past due (T+1 hour+)
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const isPastDue = scheduledDate ? scheduledDate < oneHourAgo : false;
  const isQueued = scheduledDate ? scheduledDate < now && scheduledDate >= oneHourAgo : false;

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
          onClick={() => deviation.files?.[0]?.storageUrl && setLightboxOpen(true)}
        >
          {deviation.files && deviation.files.length > 0 && deviation.files[0].storageUrl ? (
            <img
              src={deviation.files[0].storageUrl}
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
        <div className="font-medium truncate">{deviation.title}</div>
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

      {/* Folders */}
      <TableCell className="py-1">
        {deviation.galleryIds && deviation.galleryIds.length > 0 ? (
          <span className="text-sm text-muted-foreground">
            {deviation.galleryIds.length} folder{deviation.galleryIds.length !== 1 ? 's' : ''}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </TableCell>

      {/* Schedule */}
      <TableCell className="py-1">
        <span className="text-sm text-muted-foreground">
          {scheduledDate &&
            scheduledDate.toLocaleString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
        </span>
      </TableCell>

      {/* Status */}
      <TableCell className="py-1 pr-4">
        {isPastDue ? (
          <Badge variant="destructive" className="text-xs">
            Past Due
          </Badge>
        ) : isQueued ? (
          <Badge className="text-xs bg-blue-500 hover:bg-blue-600">Queued</Badge>
        ) : timeUntil ? (
          <Badge variant="secondary" className="text-xs">
            in {timeUntil}
          </Badge>
        ) : null}
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

// Helper function to calculate time until scheduled date
function getTimeUntil(date: Date): string {
  const now = new Date();
  const diff = date.getTime() - now.getTime();

  if (diff < 0) return 'past due';

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return '<1m';
}
