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

import { useState, useRef, useCallback, useEffect } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Clock,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Trash2,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { saleQueue, type SaleQueueItem } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

type StatusFilter = 'all' | 'pending' | 'processing' | 'completed' | 'failed';


const statusConfig = {
  pending: {
    label: 'Pending',
    icon: Clock,
    className: 'bg-muted text-muted-foreground',
  },
  processing: {
    label: 'Processing',
    icon: Loader2,
    className: 'bg-muted text-foreground',
    iconClassName: 'animate-spin',
  },
  completed: {
    label: 'Completed',
    icon: CheckCircle2,
    className: 'bg-muted text-muted-foreground',
  },
  failed: {
    label: 'Failed',
    icon: XCircle,
    className: 'bg-muted text-muted-foreground',
  },
  skipped: {
    label: 'Skipped',
    icon: XCircle,
    className: 'bg-muted text-muted-foreground',
  },
};

const PAGE_SIZE = 50;

export function ExclusivesQueue() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [removeItemId, setRemoveItemId] = useState<string | null>(null);

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['saleQueue', statusFilter],
    queryFn: async ({ pageParam = 0 }) => {
      const params: any = { offset: pageParam, limit: PAGE_SIZE };
      if (statusFilter !== 'all') params.status = statusFilter;
      return await saleQueue.list(params);
    },
    getNextPageParam: (lastPage, allPages) => {
      const totalFetched = allPages.length * PAGE_SIZE;
      return totalFetched < lastPage.total ? totalFetched : undefined;
    },
    initialPageParam: 0,
    refetchInterval: 10000,
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

  const removeQueueItemMutation = useMutation({
    mutationFn: (id: string) => saleQueue.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saleQueue'] });
      setRemoveItemId(null);
      toast({
        title: 'Removed',
        description: 'Item removed from queue',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to remove item',
        variant: 'destructive',
      });
    },
  });

  const formatPrice = (cents: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(cents / 100);
  };

  // Flatten pages into single array
  const queueItems = data?.pages.flatMap((page) => page.items) || [];
  const queueTotal = data?.pages[0]?.total || 0;

  // Calculate status counts from current items
  const statusCounts = queueItems.reduce(
    (acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar with stats */}
      <Card className="mb-3 flex-shrink-0">
        <CardContent className="p-3">
          <div className="flex items-center justify-between gap-4">
            {/* Stats row - compact */}
            <div className="flex items-center gap-2">
              {(['pending', 'processing', 'completed', 'failed'] as const).map((status) => {
                const count = statusCounts[status] || 0;
                const isActive = statusFilter === status;
                return (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(isActive ? 'all' : status)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors ${
                      isActive
                        ? 'bg-foreground text-background font-medium'
                        : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    <span className="font-semibold">{count}</span>
                    <span>{statusConfig[status].label}</span>
                  </button>
                );
              })}
            </div>

            {/* Filter dropdown */}
            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as StatusFilter)}
            >
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
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
          ) : queueItems.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <Sparkles className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium mb-2">No items in queue</p>
                <p className="text-sm">
                  {statusFilter !== 'all'
                    ? `No items with status: ${statusFilter}`
                    : 'Items will appear here when added to the sale queue'}
                </p>
              </div>
            </div>
          ) : (
            <>
              <Table wrapperClassName="flex-1 min-h-0">
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow className="border-b border-border hover:bg-transparent">
                    <TableHead className="w-16 pl-4 bg-card">Preview</TableHead>
                    <TableHead className="bg-card">Title</TableHead>
                    <TableHead className="bg-card w-28">Status</TableHead>
                    <TableHead className="bg-card w-32">Price</TableHead>
                    <TableHead className="bg-card w-40">Preset</TableHead>
                    <TableHead className="bg-card w-36">Last Attempt</TableHead>
                    <TableHead className="w-20 pr-4 bg-card text-center">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {queueItems.map((item) => {
                    const config = statusConfig[item.status];
                    const StatusIcon = config.icon;
                    const iconClassName = 'iconClassName' in config ? config.iconClassName : '';

                    return (
                      <TableRow key={item.id} className="group">
                        <TableCell className="pl-4">
                          {(item.deviation as any).thumbnailUrl ? (
                            <img
                              src={(item.deviation as any).thumbnailUrl}
                              alt=""
                              className="w-10 h-10 object-cover rounded"
                            />
                          ) : (
                            <div className="w-10 h-10 bg-muted rounded flex items-center justify-center">
                              <Sparkles className="w-4 h-4 text-muted-foreground" />
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="min-w-0">
                            <p className="font-medium truncate max-w-[300px]">
                              {item.deviation.title}
                            </p>
                            {item.errorMessage && (
                              <p className="text-xs text-muted-foreground truncate max-w-[300px] mt-0.5">
                                {item.errorMessage}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={config.className}>
                            <StatusIcon className={`w-3 h-3 mr-1 ${iconClassName}`} />
                            {config.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {formatPrice(item.pricePreset.price, item.pricePreset.currency)}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground truncate block max-w-[140px]">
                            {item.pricePreset.name}
                          </span>
                        </TableCell>
                        <TableCell>
                          {item.lastAttemptAt ? (
                            <span className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(item.lastAttemptAt), {
                                addSuffix: true,
                              })}
                              {item.attempts > 0 && ` (${item.attempts}/3)`}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="pr-4">
                          <div className="flex items-center justify-center gap-1">
                            {item.deviation.deviationUrl && (
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" asChild>
                                <a
                                  href={item.deviation.deviationUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => setRemoveItemId(item.id)}
                              disabled={
                                item.status === 'processing' || removeQueueItemMutation.isPending
                              }
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
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
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>
                    {statusFilter !== 'all'
                      ? `Showing ${queueItems.length} ${statusFilter} items`
                      : `Showing ${queueItems.length} of ${queueTotal} items`}
                  </span>
                </div>
                <span>Auto-refresh every 10s</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Remove Queue Item Dialog */}
      <AlertDialog open={!!removeItemId} onOpenChange={() => setRemoveItemId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from Queue?</AlertDialogTitle>
            <AlertDialogDescription>
              This item will be removed from the exclusives queue. You can add it back later if
              needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => removeItemId && removeQueueItemMutation.mutate(removeItemId)}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
