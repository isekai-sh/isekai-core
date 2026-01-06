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

import { useState, useEffect, useMemo } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { FileImage } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { review, deviations } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { ReviewHeader } from "@/components/ReviewHeader";
import { ReviewGridPanel } from "@/components/ReviewGridPanel";
import { ReviewDetailPanel } from "@/components/ReviewDetailPanel";
import type { Deviation } from "@isekai/shared";

export function Review() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Selection & focus
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [focusedId, setFocusedId] = useState<string | null>(null);

  // Grid controls
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "title">("newest");
  const [filterBy, setFilterBy] = useState<"all" | "has-tags" | "no-tags">(
    "all"
  );

  // Bulk operations
  const [bulkTags, setBulkTags] = useState<string[]>([]);

  // Fetch review deviations with infinite scroll
  const {
    data,
    isLoading: queryLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ["deviations", "review"],
    queryFn: async ({ pageParam = 1 }) => {
      const result = await review.list({ page: pageParam, limit: 50 });
      return result;
    },
    getNextPageParam: (lastPage, allPages) => {
      const loadedCount = allPages.reduce(
        (sum, page) => sum + page.deviations.length,
        0
      );
      return loadedCount < lastPage.total ? allPages.length + 1 : undefined;
    },
    initialPageParam: 1,
  });

  const isLoading = queryLoading;

  // Poll for new entries every 1 minute and auto-refresh
  useEffect(() => {
    const pollInterval = setInterval(async () => {
      try {
        const result = await review.list({ page: 1, limit: 1 });
        const currentTotal = data?.pages[0]?.total || 0;

        if (result.total > currentTotal) {
          console.log("[Review Polling] New entries detected, auto-refreshing");
          refetch();
        }
      } catch (error) {
        console.error("Failed to poll for new entries:", error);
      }
    }, 60000); // 1 minute

    return () => clearInterval(pollInterval);
  }, [data?.pages, refetch]);

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Deviation> }) =>
      deviations.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deviations", "review"] });
      toast({
        title: "Updated",
        description: "Deviation updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update",
        variant: "destructive",
      });
    },
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => review.approve(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deviations", "review"] });
      queryClient.invalidateQueries({ queryKey: ["deviations", "draft"] });
      toast({ title: "Approved", description: "Moved to Draft" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to approve",
        variant: "destructive",
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => review.reject(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deviations", "review"] });
      toast({ title: "Rejected", description: "Deviation deleted" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to reject",
        variant: "destructive",
      });
    },
  });

  const batchApproveMutation = useMutation({
    mutationFn: (ids: string[]) => review.batchApprove(ids),
    onSuccess: (_, ids) => {
      queryClient.invalidateQueries({ queryKey: ["deviations", "review"] });
      queryClient.invalidateQueries({ queryKey: ["deviations", "draft"] });
      setSelectedIds(new Set());
      setBulkTags([]);
      toast({
        title: "Approved",
        description: `${ids.length} deviations moved to Draft`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to approve",
        variant: "destructive",
      });
    },
  });

  const batchRejectMutation = useMutation({
    mutationFn: (ids: string[]) => review.batchReject(ids),
    onSuccess: (_, ids) => {
      queryClient.invalidateQueries({ queryKey: ["deviations", "review"] });
      setSelectedIds(new Set());
      toast({
        title: "Rejected",
        description: `${ids.length} deviations deleted`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to reject",
        variant: "destructive",
      });
    },
  });

  // Flatten all pages and process deviations with filter and sort
  const processedDeviations = useMemo(() => {
    const allDeviations = data?.pages.flatMap((page) => page.deviations) || [];
    let items = allDeviations;

    // Apply filters
    if (filterBy === "has-tags") {
      items = items.filter((d) => d.tags.length > 0);
    } else if (filterBy === "no-tags") {
      items = items.filter((d) => d.tags.length === 0);
    }

    // Apply sorting
    if (sortBy === "newest") {
      items = [...items].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    } else if (sortBy === "oldest") {
      items = [...items].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
    } else if (sortBy === "title") {
      items = [...items].sort((a, b) => a.title.localeCompare(b.title));
    }

    return items;
  }, [data?.pages, sortBy, filterBy]);

  // Get focused deviation
  const focusedDeviation = useMemo(() => {
    return processedDeviations.find((d) => d.id === focusedId);
  }, [processedDeviations, focusedId]);

  // Auto-focus first item when list changes
  useEffect(() => {
    if (processedDeviations.length > 0 && !focusedId) {
      setFocusedId(processedDeviations[0].id);
    } else if (processedDeviations.length > 0 && !focusedDeviation) {
      // Focused item was filtered out or deleted, focus first visible
      setFocusedId(processedDeviations[0].id);
    }
  }, [processedDeviations, focusedId, focusedDeviation]);

  // Keyboard shortcuts for approve/reject
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in input fields
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.contentEditable === "true"
      ) {
        return;
      }

      // Don't trigger shortcuts if a modal/lightbox is open
      if (document.body.style.overflow === "hidden") {
        return;
      }

      if (!focusedDeviation) return;

      // A or Enter = Approve
      if (e.key === "a" || e.key === "A" || e.key === "Enter") {
        e.preventDefault();
        approveMutation.mutate(focusedDeviation.id);
      }

      // X or Escape = Reject
      if (e.key === "x" || e.key === "X" || e.key === "Escape") {
        e.preventDefault();
        rejectMutation.mutate(focusedDeviation.id);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [focusedDeviation, approveMutation, rejectMutation]);

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleSelectAll = () => {
    const allIds = new Set(processedDeviations.map((d) => d.id));
    setSelectedIds(allIds);
  };

  const handleDeselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleBulkApprove = async () => {
    if (selectedIds.size === 0) return;

    // Apply bulk tags first if any are set
    if (bulkTags.length > 0) {
      await Promise.all(
        Array.from(selectedIds).map((id) =>
          deviations.update(id, { tags: bulkTags })
        )
      );
    }

    // Then approve all
    await batchApproveMutation.mutateAsync(Array.from(selectedIds));
  };

  const handleBulkReject = async () => {
    if (selectedIds.size === 0) return;

    // Confirm before bulk delete
    if (
      !confirm(
        `Are you sure you want to reject ${selectedIds.size} deviation${
          selectedIds.size !== 1 ? "s" : ""
        }? This action cannot be undone.`
      )
    ) {
      return;
    }

    await batchRejectMutation.mutateAsync(Array.from(selectedIds));
  };

  const handleUpdate = (id: string, updateData: Partial<Deviation>) => {
    updateMutation.mutate({ id, data: updateData });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const allDeviations = data?.pages.flatMap((page) => page.deviations) || [];
  const totalCount = data?.pages[0]?.total || 0;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Bulk actions bar - only show when items selected */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSelectAll}
              className="h-8 text-xs"
            >
              Select All
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDeselectAll}
              className="h-8 text-xs"
            >
              Clear Selection
            </Button>
            <span className="text-sm text-muted-foreground ml-2">
              {selectedIds.size} selected
            </span>
          </div>
          <ReviewHeader
            count={allDeviations.length}
            selectedCount={selectedIds.size}
            bulkTags={bulkTags}
            setBulkTags={setBulkTags}
            onBulkApprove={handleBulkApprove}
            onBulkReject={handleBulkReject}
          />
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 min-h-0">
        {allDeviations.length === 0 ? (
          <Card className="flex items-center justify-center h-full border-border/50 bg-card">
            <CardContent className="text-center py-12">
              <FileImage className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium mb-2">No deviations to review</p>
              <p className="text-sm text-muted-foreground">
                Upload from ComfyUI to see them here
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="flex gap-4 h-full">
            {/* Grid Panel - hidden on mobile/tablet */}
            <ReviewGridPanel
              className="hidden xl:flex"
              deviations={processedDeviations}
              selectedIds={selectedIds}
              focusedId={focusedId}
              viewMode={viewMode}
              sortBy={sortBy}
              filterBy={filterBy}
              totalCount={totalCount}
              onToggleSelect={toggleSelect}
              onFocus={setFocusedId}
              onViewModeChange={setViewMode}
              onSortChange={setSortBy as any}
              onFilterChange={setFilterBy as any}
              onSelectAll={handleSelectAll}
              onDeselectAll={handleDeselectAll}
              onLoadMore={() => {
                if (hasNextPage && !isFetchingNextPage) {
                  fetchNextPage();
                }
              }}
              hasMore={hasNextPage || false}
              isLoadingMore={isFetchingNextPage}
            />

            {/* Detail Panel - full width on mobile */}
            <ReviewDetailPanel
              deviation={focusedDeviation}
              onApprove={(id) => approveMutation.mutate(id)}
              onReject={(id) => rejectMutation.mutate(id)}
              onUpdate={handleUpdate}
            />
          </div>
        )}
      </div>
    </div>
  );
}
