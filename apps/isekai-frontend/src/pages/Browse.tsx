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

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  Flame,
  Calendar,
  Tag,
  Users,
  Sparkles,
  ChevronUp,
  RefreshCw,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, type CardSize, type ViewMode } from "@/lib/utils";
import {
  browse,
  ApiError,
  type BrowseMode,
  type BrowseDeviation,
} from "@/lib/api";
import { DeviationCard } from "@/components/browse/DeviationCard";
import { MoreLikeThisPanel } from "@/components/browse/MoreLikeThisPanel";
import { BrowseHeader } from "@/components/browse/BrowseHeader";
import { DeviationDetailModal } from "@/components/browse/DeviationDetailModal";
import { JustifiedGallery } from "@/components/browse/JustifiedGallery";
import { PageWrapper, PageContent } from "@/components/ui/page-wrapper";

// Browse mode tabs configuration
// Only modes available in DeviantArt API v1.20240701
const BROWSE_TABS: { id: BrowseMode; label: string; icon: typeof Flame }[] = [
  { id: "home", label: "Home", icon: Flame },
  { id: "daily", label: "Daily", icon: Calendar },
  { id: "following", label: "Watching", icon: Users },
];

// Bento grid: fixed cell sizes with row/col spanning for featured items
// Uses grid-auto-rows to create uniform row heights that items can span
const BENTO_GRID =
  "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 auto-rows-[120px] sm:auto-rows-[140px] md:auto-rows-[160px] gap-2";

// Masonry grid: CSS columns for true masonry
const MASONRY_GRID =
  "columns-2 sm:columns-3 md:columns-4 lg:columns-5 xl:columns-6 gap-3";

// LocalStorage key for view mode
const VIEW_MODE_KEY = "isekai-browse-view-mode";

export function Browse() {
  const [searchParams, setSearchParams] = useSearchParams();

  // State from URL params
  const mode = (searchParams.get("mode") as BrowseMode) || "home";
  const tag = searchParams.get("tag") || "";
  const topic = searchParams.get("topic") || "";
  const username = searchParams.get("username") || "";
  const keywords = searchParams.get("keywords") || "";

  // Local state
  const [matureContent, setMatureContent] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem(VIEW_MODE_KEY);
    return (saved as ViewMode) || "grid";
  });
  const [moreLikeThisDeviation, setMoreLikeThisDeviation] =
    useState<BrowseDeviation | null>(null);
  const [selectedDeviation, setSelectedDeviation] =
    useState<BrowseDeviation | null>(null);
  const [showBackToTop, setShowBackToTop] = useState(false);

  // Refs
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Update URL params
  const updateParams = (updates: Record<string, string | null>) => {
    const newParams = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === "") {
        newParams.delete(key);
      } else {
        newParams.set(key, value);
      }
    });
    setSearchParams(newParams);
  };

  // Determine the actual selected tag (either tag or topic name)
  const selectedTag = mode === "topic" ? topic : tag;

  // Infinite query for browse results
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    error,
    refetch,
  } = useInfiniteQuery({
    queryKey: ["browse", mode, tag, topic, username, keywords, matureContent],
    queryFn: ({ pageParam = 0 }) =>
      browse.get(mode, {
        offset: pageParam,
        limit: 24,
        tag: mode === "tags" ? tag : undefined,
        topic: mode === "topic" ? topic : undefined,
        username: ["user-gallery", "keyword-search"].includes(mode)
          ? username
          : undefined,
        keywords: mode === "keyword-search" ? keywords : undefined,
        mature_content: matureContent,
      }),
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextOffset : undefined,
    initialPageParam: 0,
    enabled: (mode !== "tags" || !!tag) && (mode !== "topic" || !!topic),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  const deviations = data?.pages.flatMap((page) => page.deviations) ?? [];

  // Process deviations to assign sizes for bento layout using percentile-based selection
  const processedDeviations = useMemo(() => {
    if (deviations.length === 0) return [];

    // Calculate engagement scores for all deviations
    const withScores = deviations.map((d, originalIndex) => ({
      deviation: d,
      originalIndex,
      score: d.stats.favourites + d.stats.comments * 2,
    }));

    // Sort by score to find top performers
    const sorted = [...withScores].sort((a, b) => b.score - a.score);

    // Select top 4-6 items as featured (based on dataset size)
    const maxFeatured = Math.min(6, Math.ceil(deviations.length / 6));
    const featuredIndices = new Set<number>();

    // Pick top performers, but ensure they're spaced apart in the original order
    let featuredCount = 0;
    for (const item of sorted) {
      if (featuredCount >= maxFeatured) break;
      // Check if nearby items are already featured (within 3 positions)
      const tooClose = Array.from(featuredIndices).some(
        (idx) => Math.abs(idx - item.originalIndex) < 4
      );
      if (!tooClose) {
        featuredIndices.add(item.originalIndex);
        featuredCount++;
      }
    }

    // Determine size thresholds from the actual data
    const scores = withScores.map((w) => w.score);
    const maxScore = Math.max(...scores);
    const medianScore =
      scores.sort((a, b) => a - b)[Math.floor(scores.length / 2)] || 0;

    return deviations.map((d, index) => {
      const isFeatured = featuredIndices.has(index);
      let displaySize: CardSize = "regular";

      if (isFeatured) {
        const score = d.stats.favourites + d.stats.comments * 2;
        // Top tier: above 75% of max score
        if (score > maxScore * 0.75) {
          displaySize = "large";
        } else {
          displaySize = "medium";
        }
      }

      return { ...d, displaySize };
    });
  }, [deviations]);

  // Check if any page is from cache (rate limit fallback)
  const isShowingCachedData =
    data?.pages.some((page) => page.fromCache) ?? false;
  const cachedAt = data?.pages.find((page) => page.fromCache)?.cachedAt;

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

  // Show/hide back to top button
  useEffect(() => {
    const handleScroll = () => {
      setShowBackToTop(window.scrollY > 500);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleModeChange = (newMode: BrowseMode) => {
    updateParams({ mode: newMode, tag: null, topic: null });
  };

  const handleTagSelect = (searchTag: string) => {
    if (searchTag) {
      updateParams({ mode: "tags", tag: searchTag, topic: null });
    } else {
      updateParams({ mode: "home", tag: null, topic: null });
    }
  };

  const handleTopicSelect = (topicName: string) => {
    updateParams({ mode: "topic", topic: topicName, tag: null });
  };

  const handleMoreLikeThis = useCallback((deviation: BrowseDeviation) => {
    setMoreLikeThisDeviation(deviation);
  }, []);

  const handleSelectDeviation = useCallback((deviation: BrowseDeviation) => {
    setSelectedDeviation(deviation);
  }, []);

  const handleTagClickFromModal = (clickedTag: string) => {
    handleTagSelect(clickedTag);
  };

  const handleViewModeChange = useCallback((newMode: ViewMode) => {
    setViewMode(newMode);
    localStorage.setItem(VIEW_MODE_KEY, newMode);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <PageWrapper className="gap-4 -mt-4 md:-mt-6">
      {/* Unified header row: mode tabs + trending topics + mature switch */}
      <div className="sticky top-0 z-40 bg-background py-3 -mx-4 lg:-mx-6 px-4 lg:px-6 border-b border-border/50">
        <BrowseHeader
          mode={mode}
          selectedTag={selectedTag}
          matureContent={matureContent}
          viewMode={viewMode}
          onModeChange={handleModeChange}
          onTagSelect={handleTagSelect}
          onMatureContentChange={setMatureContent}
          onViewModeChange={handleViewModeChange}
          onTopicSelect={handleTopicSelect}
          tabs={BROWSE_TABS}
        />
      </div>

      {/* Scrollable content */}
      <PageContent>
        {/* Current filter badge */}
        {((mode === "tags" && tag) || (mode === "topic" && topic)) && (
          <div className="flex items-center gap-1 px-3 py-1.5 bg-primary/10 rounded-md text-sm w-fit">
            <Tag className="h-3 w-3" />
            <span>{mode === "topic" ? topic : tag}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-4 w-4 ml-1"
              onClick={() =>
                updateParams({ tag: null, topic: null, mode: "home" })
              }
            >
              ×
            </Button>
          </div>
        )}

        {/* Cached data indicator */}
        {isShowingCachedData && (
          <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-md text-sm text-amber-600 dark:text-amber-400">
            <Clock className="h-4 w-4" />
            <span>
              Showing cached results due to rate limiting.
              {cachedAt && (
                <span className="text-muted-foreground ml-1">
                  Cached {new Date(cachedAt).toLocaleTimeString()}
                </span>
              )}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 ml-auto text-amber-600 dark:text-amber-400 hover:text-amber-700"
              onClick={() => refetch()}
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Retry
            </Button>
          </div>
        )}

        {/* Results grid */}
        {isLoading ? (
          viewMode === "grid" ? (
            /* Grid mode skeleton: justified rows */
            <div className="w-full space-y-3">
              {Array.from({ length: 6 }).map((_, rowIndex) => (
                <div key={rowIndex} className="flex gap-3 w-full">
                  {Array.from({ length: 4 + (rowIndex % 3) }).map(
                    (_, itemIndex) => (
                      <div
                        key={itemIndex}
                        className="flex-1"
                        style={{ minWidth: "200px" }}
                      >
                        <Skeleton className="w-full h-[280px] rounded-lg" />
                      </div>
                    )
                  )}
                </div>
              ))}
            </div>
          ) : viewMode === "masonry" ? (
            /* Masonry mode skeleton: CSS columns with varied heights */
            <div className={MASONRY_GRID}>
              {Array.from({ length: 24 }).map((_, i) => {
                const heights = ["h-48", "h-56", "h-64", "h-72", "h-80"];
                const height = heights[i % heights.length];
                return (
                  <Skeleton
                    key={i}
                    className={cn(
                      "w-full rounded-lg mb-3 break-inside-avoid",
                      height
                    )}
                  />
                );
              })}
            </div>
          ) : (
            /* Bento mode skeleton: grid with col/row spanning */
            <div className={BENTO_GRID}>
              {Array.from({ length: 24 }).map((_, i) => {
                const isFeatured = i === 0 || i === 7 || i === 14;
                const isLarge = i === 0;
                return (
                  <Skeleton
                    key={i}
                    className={cn(
                      "w-full rounded-lg",
                      isLarge
                        ? "col-span-2 row-span-3"
                        : isFeatured
                        ? "col-span-2 row-span-2"
                        : "row-span-2"
                    )}
                  />
                );
              })}
            </div>
          )
        ) : isError ? (
          <div className="text-center py-12">
            {error instanceof ApiError && error.status === 429 ? (
              <>
                <Clock className="h-12 w-12 mx-auto mb-4 text-amber-500" />
                <p className="text-muted-foreground mb-2">
                  DeviantArt API rate limit reached
                </p>
                <p className="text-sm text-muted-foreground/70 mb-4">
                  Please wait a few minutes before trying again
                </p>
              </>
            ) : (
              <p className="text-muted-foreground mb-4">
                Failed to load deviations
              </p>
            )}
            <Button onClick={() => refetch()}>Try again</Button>
          </div>
        ) : processedDeviations.length === 0 ? (
          <div className="text-center py-12">
            <Sparkles className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
            <p className="text-muted-foreground">
              {(mode === "tags" && !tag) || (mode === "topic" && !topic)
                ? "Select a topic or enter a tag to search"
                : "No deviations found"}
            </p>
          </div>
        ) : (
          <>
            {/* Grid view - Justified gallery */}
            {viewMode === "grid" ? (
              <JustifiedGallery
                deviations={deviations}
                onMoreLikeThis={handleMoreLikeThis}
                onSelect={handleSelectDeviation}
              />
            ) : viewMode === "masonry" ? (
              /* Masonry view - CSS columns */
              <div className={MASONRY_GRID}>
                {deviations.map((deviation) => (
                  <DeviationCard
                    key={deviation.deviationId}
                    deviation={deviation}
                    onMoreLikeThis={handleMoreLikeThis}
                    onSelect={handleSelectDeviation}
                    viewMode="masonry"
                  />
                ))}
              </div>
            ) : (
              /* Bento view - Grid with col-spanning */
              <div className={BENTO_GRID}>
                {processedDeviations.map((deviation) => (
                  <DeviationCard
                    key={deviation.deviationId}
                    deviation={deviation}
                    onMoreLikeThis={handleMoreLikeThis}
                    onSelect={handleSelectDeviation}
                    size={deviation.displaySize}
                    viewMode="bento"
                  />
                ))}
              </div>
            )}

            {/* Load more trigger */}
            <div ref={loadMoreRef} className="py-8 text-center">
              {isFetchingNextPage && (
                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Loading more...</span>
                </div>
              )}
              {!hasNextPage && processedDeviations.length > 0 && (
                <p className="text-muted-foreground text-sm">
                  No more deviations
                </p>
              )}
            </div>
          </>
        )}

        {/* Back to top button */}
        {showBackToTop && (
          <Button
            variant="secondary"
            size="icon"
            className="fixed bottom-6 right-6 h-10 w-10 rounded-full shadow-lg z-50"
            onClick={scrollToTop}
          >
            <ChevronUp className="h-5 w-5" />
          </Button>
        )}
      </PageContent>

      {/* More Like This panel */}
      <MoreLikeThisPanel
        deviation={moreLikeThisDeviation}
        open={!!moreLikeThisDeviation}
        onOpenChange={(open) => !open && setMoreLikeThisDeviation(null)}
      />

      {/* Deviation Detail Modal */}
      <DeviationDetailModal
        deviation={selectedDeviation}
        open={!!selectedDeviation}
        onOpenChange={(open) => !open && setSelectedDeviation(null)}
        onTagClick={handleTagClickFromModal}
      />
    </PageWrapper>
  );
}
