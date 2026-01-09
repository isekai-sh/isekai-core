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

import { useRef, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LayoutGrid, List, Loader2 } from 'lucide-react';
import { ReviewGridItem } from './ReviewGridItem';
import type { Deviation } from '@isekai/shared';

interface ReviewGridPanelProps {
  className?: string;
  deviations: Deviation[];
  selectedIds: Set<string>;
  focusedId: string | null;
  viewMode: 'grid' | 'list';
  sortBy: string;
  filterBy: string;
  totalCount: number;
  onToggleSelect: (id: string) => void;
  onFocus: (id: string) => void;
  onViewModeChange: (mode: 'grid' | 'list') => void;
  onSortChange: (sort: string) => void;
  onFilterChange: (filter: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onLoadMore: () => void;
  hasMore: boolean;
  isLoadingMore: boolean;
}

export function ReviewGridPanel({
  className,
  deviations,
  selectedIds,
  focusedId,
  viewMode,
  sortBy,
  filterBy,
  totalCount,
  onToggleSelect,
  onFocus,
  onViewModeChange,
  onSortChange,
  onFilterChange,
  onSelectAll,
  onDeselectAll,
  onLoadMore,
  hasMore,
  isLoadingMore,
}: ReviewGridPanelProps) {
  const gridClasses = viewMode === 'grid' ? 'grid-cols-3' : 'grid-cols-1';
  const scrollRef = useRef<HTMLDivElement>(null);

  // Infinite scroll detection
  useEffect(() => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
      // Load more when scrolled to within 200px of bottom
      if (scrollHeight - scrollTop - clientHeight < 200 && hasMore && !isLoadingMore) {
        onLoadMore();
      }
    };

    scrollContainer.addEventListener('scroll', handleScroll);
    return () => scrollContainer.removeEventListener('scroll', handleScroll);
  }, [hasMore, isLoadingMore, onLoadMore]);

  return (
    <Card className={cn('w-[30%] flex flex-col min-h-0 rounded-lg', className)}>
      <CardContent className="p-3 flex flex-col h-full min-h-0">
        {/* Controls bar - single row */}
        <div className="flex gap-1 mb-3 flex-shrink-0 w-full">
          <Button
            variant={viewMode === 'list' ? 'default' : 'outline'}
            size="sm"
            onClick={() => onViewModeChange('list')}
            className="h-8 w-8 p-0 shrink-0"
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === 'grid' ? 'default' : 'outline'}
            size="sm"
            onClick={() => onViewModeChange('grid')}
            className="h-8 w-8 p-0 shrink-0"
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Select value={sortBy} onValueChange={onSortChange}>
            <SelectTrigger className="flex-1 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="oldest">Oldest</SelectItem>
              <SelectItem value="title">Title</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterBy} onValueChange={onFilterChange}>
            <SelectTrigger className="flex-1 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="has-tags">Has Tags</SelectItem>
              <SelectItem value="no-tags">No Tags</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Scrollable grid */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
          {deviations.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              No items match the current filter
            </div>
          ) : (
            <div className={`grid ${gridClasses} gap-2 pb-2`}>
              {deviations.map((deviation) => (
                <ReviewGridItem
                  key={deviation.id}
                  deviation={deviation}
                  isSelected={selectedIds.has(deviation.id)}
                  isFocused={focusedId === deviation.id}
                  viewMode={viewMode}
                  onToggleSelect={() => onToggleSelect(deviation.id)}
                  onFocus={() => onFocus(deviation.id)}
                />
              ))}
            </div>
          )}

          {/* Loading indicator */}
          {isLoadingMore && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>

        {/* Footer with total count */}
        <div className="pt-3 mt-auto border-t border-border/50 text-center">
          <span className="text-xs text-muted-foreground">
            {totalCount} {totalCount === 1 ? 'item' : 'items'} to review
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
