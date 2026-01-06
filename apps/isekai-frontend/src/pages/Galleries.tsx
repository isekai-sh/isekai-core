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

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import {
  Plus,
  Folder,
  Loader2,
  ArrowUpAZ,
  ArrowDownAZ,
  GripVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { galleries } from "@/lib/api";
import { PageWrapper, PageHeader, PageContent } from "@/components/ui/page-wrapper";
import { GalleryCard } from "@/components/galleries/GalleryCard";
import { SortableGalleryCard } from "@/components/galleries/SortableGalleryCard";
import { CreateGalleryDialog } from "@/components/galleries/CreateGalleryDialog";
import { useToast } from "@/hooks/use-toast";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import type { DeviantArtGalleryFolder } from "@isekai/shared";

const SORT_MODE_KEY = "isekai-galleries-sort-mode";

type GallerySortMode = "custom" | "asc" | "desc";

export function Galleries() {
  const [sortMode, setSortMode] = useState<GallerySortMode>(() => {
    const saved = localStorage.getItem(SORT_MODE_KEY);
    return (saved as GallerySortMode) || "custom";
  });
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Drag-and-drop state
  const [activeId, setActiveId] = useState<string | null>(null);
  const [localGalleries, setLocalGalleries] = useState<
    DeviantArtGalleryFolder[]
  >([]);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Infinite query for galleries - load all upfront for proper reordering
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    refetch,
  } = useInfiniteQuery({
    queryKey: ["galleries"],
    queryFn: ({ pageParam = 0 }) => galleries.list(pageParam, 100), // Load 100 at a time
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextOffset : undefined,
    initialPageParam: 0,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  const rawGalleryList = data?.pages.flatMap((page) => page.galleries) ?? [];

  // Apply sorting based on sort mode
  const galleryList = useMemo(() => {
    if (sortMode === "asc") {
      return [...rawGalleryList].sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortMode === "desc") {
      return [...rawGalleryList].sort((a, b) => b.name.localeCompare(a.name));
    }
    // custom: use original order from API (user's manual sort on DeviantArt)
    return rawGalleryList;
  }, [rawGalleryList, sortMode]);

  // Auto-load all galleries on mount for proper reordering
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && !isLoading) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, isLoading, fetchNextPage]);

  // Computed values for drag-and-drop (use displayGalleries after it's defined)
  const galleryIds = useMemo(
    () => (localGalleries.length > 0 ? localGalleries : galleryList).map((g) => g.folderid),
    [localGalleries, galleryList]
  );

  // Use galleryList as fallback when localGalleries hasn't synced yet (fixes race condition)
  const displayGalleries = useMemo(() => {
    if (activeId) return localGalleries; // During drag, use local state
    // Fallback to galleryList if localGalleries is empty or out of sync
    return localGalleries.length > 0 ? localGalleries : galleryList;
  }, [activeId, localGalleries, galleryList]);

  const activeGallery = useMemo(
    () =>
      activeId ? displayGalleries.find((g) => g.folderid === activeId) : null,
    [activeId, displayGalleries]
  );

  const canReorder =
    sortMode === "custom" &&
    galleryList.length > 1 &&
    displayGalleries.length > 0 &&
    !isLoading &&
    !isError;

  // Configure sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Reorder mutation
  const reorderMutation = useMutation({
    mutationFn: (folderIds: string[]) => galleries.reorderFolders(folderIds),

    onMutate: async (newOrder) => {
      await queryClient.cancelQueries({ queryKey: ["galleries"] });
      const previousData = queryClient.getQueryData(["galleries"]);

      // Optimistically update cache
      queryClient.setQueryData<InfiniteData<any>>(["galleries"], (old) => {
        if (!old) return old;

        const flatGalleries = old.pages.flatMap((p) => p.galleries ?? []);
        const reordered = newOrder.map(
          (id) => flatGalleries.find((g) => g.folderid === id)!
        );

        const newPages = old.pages.map((page, idx) => {
          const startIdx = idx * 24;
          const endIdx = startIdx + (page.galleries?.length ?? 0);
          return {
            ...page,
            galleries: reordered.slice(startIdx, endIdx),
          };
        });

        return { ...old, pages: newPages };
      });

      return { previousData };
    },

    onError: (err, newOrder, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(["galleries"], context.previousData);
      }
      toast({
        title: "Error",
        description: "Failed to reorder galleries. Please try again.",
        variant: "destructive",
      });
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["galleries"] });
      toast({
        title: "Success",
        description: "Gallery order updated successfully.",
      });
    },
  });

  // Sync local state with query data
  useEffect(() => {
    if (!activeId) {
      setLocalGalleries((prev) => {
        // Only update if the gallery IDs are different
        const prevIds = prev.map((g) => g.folderid).join(",");
        const newIds = galleryList.map((g) => g.folderid).join(",");
        return prevIds !== newIds ? galleryList : prev;
      });
    }
  }, [galleryList, activeId]);

  // Drag handlers
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);

    // Pause infinite scroll
    if (observerRef.current) {
      observerRef.current.disconnect();
    }
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    setLocalGalleries((galleries) => {
      const oldIndex = galleries.findIndex((g) => g.folderid === active.id);
      const newIndex = galleries.findIndex((g) => g.folderid === over.id);
      return arrayMove(galleries, oldIndex, newIndex);
    });
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      console.log("=== DRAG END STARTED ===");
      const { active, over } = event;
      console.log("Active:", active.id, "Over:", over?.id);

      // Resume infinite scroll
      if (observerRef.current && loadMoreRef.current) {
        observerRef.current.observe(loadMoreRef.current);
      }

      setActiveId(null);

      if (!over || active.id === over.id) {
        console.log("Early exit: no over or same position");
        setLocalGalleries(galleryList);
        return;
      }

      // UUID regex pattern (accept both uppercase and lowercase)
      const uuidPattern =
        /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

      // Get all folder IDs
      const allFolderIds = localGalleries.map((g) => g.folderid);
      console.log("All folder IDs:", allFolderIds);

      // Filter to only include valid UUID folder IDs (exclude special folders like "Featured", "All", etc.)
      const newOrder = allFolderIds.filter((id) => {
        if (!id || typeof id !== "string") return false;
        return uuidPattern.test(id);
      });
      console.log("Filtered UUID folder IDs:", newOrder);

      if (newOrder.length === 0) {
        console.log("No valid UUID folder IDs found, skipping reorder");
        return;
      }

      reorderMutation.mutate(newOrder);
    },
    [localGalleries, galleryList, reorderMutation]
  );

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
    setLocalGalleries(galleryList);

    if (observerRef.current && loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }
  }, [galleryList]);

  const handleSortModeChange = useCallback(
    async (mode: GallerySortMode) => {
      setSortMode(mode);
      localStorage.setItem(SORT_MODE_KEY, mode);

      // If switching to asc or desc, sync the order to DeviantArt
      if (mode !== "custom" && galleryList.length > 0) {
        const sortedList =
          mode === "asc"
            ? [...galleryList].sort((a, b) => a.name.localeCompare(b.name))
            : [...galleryList].sort((a, b) => b.name.localeCompare(a.name));

        const uuidPattern =
          /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
        const folderIds = sortedList
          .map((g) => g.folderid)
          .filter((id) => id && typeof id === "string" && uuidPattern.test(id));

        if (folderIds.length > 0) {
          try {
            await reorderMutation.mutateAsync(folderIds);
            toast({
              title: "Order synced",
              description: `Galleries sorted ${
                mode === "asc" ? "A-Z" : "Z-A"
              } and synced to DeviantArt.`,
            });
          } catch (error) {
            toast({
              title: "Sync failed",
              description: "Failed to sync gallery order to DeviantArt.",
              variant: "destructive",
            });
          }
        }
      }
    },
    [galleryList, reorderMutation, toast]
  );

  // Intersection observer for infinite scroll
  useEffect(() => {
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <PageWrapper className="gap-6">
      {/* Header */}
      <PageHeader>
        <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold mb-2">
            <span className="text-gradient">Gallery</span>
          </h1>
          <p className="text-lg text-muted-foreground">
            Organize your posts into collections
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Sort/Order dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                {sortMode === "asc" && (
                  <>
                    <ArrowUpAZ className="h-4 w-4 mr-2" />
                    Sort A-Z
                  </>
                )}
                {sortMode === "desc" && (
                  <>
                    <ArrowDownAZ className="h-4 w-4 mr-2" />
                    Sort Z-A
                  </>
                )}
                {sortMode === "custom" && (
                  <>
                    <GripVertical className="h-4 w-4 mr-2" />
                    Custom Order
                  </>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleSortModeChange("custom")}>
                <GripVertical className="h-4 w-4 mr-2" />
                Custom Order (Drag to Reorder)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleSortModeChange("asc")}>
                <ArrowUpAZ className="h-4 w-4 mr-2" />
                Sort A-Z
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleSortModeChange("desc")}>
                <ArrowDownAZ className="h-4 w-4 mr-2" />
                Sort Z-A
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Create button */}
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Gallery
          </Button>
        </div>
      </div>
      </PageHeader>

      {/* Content */}
      <PageContent>
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6 min-[2000px]:grid-cols-8 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="rounded-lg h-64" />
            ))}
          </div>
        ) : isError ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-4">
              Failed to load galleries
            </p>
            <Button onClick={() => refetch()}>Try again</Button>
          </div>
        ) : galleryList.length === 0 ? (
          <div className="text-center py-16">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
              <Folder className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No galleries yet</h3>
            <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
              Create your first gallery to start organizing your posts into
              collections
            </p>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Gallery
            </Button>
          </div>
        ) : canReorder ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <SortableContext items={galleryIds} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6 min-[2000px]:grid-cols-8 gap-4">
                {displayGalleries.map((gallery) => (
                  <SortableGalleryCard
                    key={gallery.folderid}
                    gallery={gallery}
                    disabled={reorderMutation.isPending || isFetchingNextPage}
                  />
                ))}
              </div>
            </SortableContext>

            <DragOverlay>
              {activeGallery && (
                <div className="opacity-90 rotate-2 scale-105 shadow-2xl">
                  <GalleryCard gallery={activeGallery} />
                </div>
              )}
            </DragOverlay>
          </DndContext>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6 min-[2000px]:grid-cols-8 gap-4">
            {galleryList.map((gallery) => (
              <GalleryCard key={gallery.folderid} gallery={gallery} />
            ))}
          </div>
        )}

        {/* Load more trigger */}
        {!isLoading && !isError && galleryList.length > 0 && (
          <div ref={loadMoreRef} className="flex justify-center py-8">
            {isFetchingNextPage && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Loading more galleries...</span>
              </div>
            )}
          </div>
        )}
      </PageContent>

      {/* Mutation Loading Indicator */}
      {reorderMutation.isPending && (
        <div className="fixed bottom-4 right-4 bg-background border rounded-lg p-4 shadow-lg flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Updating gallery order...</span>
        </div>
      )}

      {/* Create Dialog */}
      <CreateGalleryDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
    </PageWrapper>
  );
}
