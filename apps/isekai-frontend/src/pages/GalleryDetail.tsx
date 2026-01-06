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

import { useState, useRef, useEffect, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { ChevronLeft, LayoutDashboard, Rows3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { galleries, type BrowseDeviation } from "@/lib/api";
import { JustifiedGallery } from "@/components/inspiration/JustifiedGallery";
import type { ViewMode } from "@/lib/utils";
import { PageWrapper, PageHeader, PageContent } from "@/components/ui/page-wrapper";

const VIEW_MODE_KEY = "isekai-gallery-detail-view-mode";

export function GalleryDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Local state
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem(VIEW_MODE_KEY);
    return (saved as ViewMode) || "grid";
  });
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Fetch gallery folder metadata
  const { data: folderData, isLoading: isFolderLoading } = useQuery({
    queryKey: ["gallery-folders"],
    queryFn: () => galleries.list(0, 50),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Find the current folder from the list
  const currentFolder = folderData?.galleries.find((g) => g.folderid === id);

  // Infinite query for gallery contents
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: isContentsLoading,
    isError,
    error,
  } = useInfiniteQuery({
    queryKey: ["gallery-contents", id],
    queryFn: async ({ pageParam = 0 }) => {
      if (!id) throw new Error("Gallery ID is required");
      return await galleries.get(id, { limit: 24, offset: pageParam });
    },
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextOffset : undefined,
    initialPageParam: 0,
    enabled: !!id,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  const deviations = useMemo(() => {
    const allDeviations = data?.pages.flatMap((page) => page.results) ?? [];

    // Deduplicate by deviationid
    const seen = new Set<string>();
    return allDeviations.filter((d: any) => {
      if (seen.has(d.deviationid)) {
        return false;
      }
      seen.add(d.deviationid);
      return true;
    });
  }, [data]);

  const isLoading = isFolderLoading || isContentsLoading;

  // Convert deviations to BrowseDeviation format
  const processedDeviations = useMemo(() => {
    return deviations.map((d: any) => {
      const browseDeviation: BrowseDeviation = {
        deviationId: d.deviationid,
        title: d.title || "Untitled",
        url: d.url,
        thumbUrl: d.thumbs?.[0]?.src || null,
        previewUrl: d.preview?.src || null,
        author: {
          username: d.author?.username || "",
          avatarUrl: d.author?.usericon || "",
          userId: d.author?.userid || "",
        },
        stats: {
          favourites: d.stats?.favourites || 0,
          comments: d.stats?.comments || 0,
        },
        publishedTime: d.published_time || new Date().toISOString(),
        isDownloadable: d.is_downloadable || false,
        isMature: d.is_mature || false,
        category: d.category || null,
        tierAccess: null,
        isExclusive: false,
        isPremium: false,
        printId: null,
      };

      return browseDeviation;
    });
  }, [deviations]);

  // Infinite scroll setup
  useEffect(() => {
    if (!loadMoreRef.current || !hasNextPage || isFetchingNextPage) {
      return;
    }

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

    observerRef.current.observe(loadMoreRef.current);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Save view mode preference
  useEffect(() => {
    localStorage.setItem(VIEW_MODE_KEY, viewMode);
  }, [viewMode]);

  if (isLoading) {
    return (
      <PageWrapper className="gap-6">
        <PageContent className="space-y-6">
          <Skeleton className="h-8 w-64" />
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-lg" />
            ))}
          </div>
        </PageContent>
      </PageWrapper>
    );
  }

  if (isError || (!isLoading && !currentFolder)) {
    return (
      <PageWrapper>
        <PageContent>
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-4">
              {isError
                ? `Error loading gallery: ${
                    error instanceof Error ? error.message : "Unknown error"
                  }`
                : "Gallery not found"}
            </p>
            <Button onClick={() => navigate("/galleries")}>
              Back to Galleries
            </Button>
          </div>
        </PageContent>
      </PageWrapper>
    );
  }

  const folderName = currentFolder?.name || "Gallery";

  return (
    <PageWrapper className="gap-6">
      {/* Header with breadcrumb and view mode toggle */}
      <PageHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/galleries">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ChevronLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
              {folderName}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              {deviations.length} {deviations.length === 1 ? "item" : "items"}
            </p>
          </div>
        </div>

        {/* View mode toggle */}
        <div className="flex items-center gap-0.5 shrink-0">
          <Button
            variant={viewMode === "masonry" ? "secondary" : "ghost"}
            size="icon"
            className="h-8 w-8"
            onClick={() => setViewMode("masonry")}
            title="Masonry view"
          >
            <LayoutDashboard className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === "grid" ? "secondary" : "ghost"}
            size="icon"
            className="h-8 w-8"
            onClick={() => setViewMode("grid")}
            title="Justified view"
          >
            <Rows3 className="h-4 w-4" />
          </Button>
        </div>
        </div>
      </PageHeader>

      <PageContent>
      {/* Gallery Items */}
      {processedDeviations.length > 0 ? (
        <>
          {viewMode === "grid" ? (
            <JustifiedGallery deviations={processedDeviations} />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {processedDeviations.map((deviation) => (
                <a
                  key={deviation.deviationId}
                  href={deviation.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative block overflow-hidden rounded-lg bg-muted hover:ring-2 hover:ring-primary/50 transition-all"
                >
                  <img
                    src={deviation.previewUrl || deviation.thumbUrl || ""}
                    alt={deviation.title}
                    className="w-full h-auto block"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="absolute bottom-0 left-0 right-0 p-3">
                      <h3 className="text-white font-medium text-sm line-clamp-2">
                        {deviation.title}
                      </h3>
                      <p className="text-white/80 text-xs mt-1">
                        {deviation.author.username}
                      </p>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}

          {/* Load more trigger */}
          <div ref={loadMoreRef} className="py-8 flex justify-center">
            {isFetchingNextPage && (
              <div className="text-sm text-muted-foreground">
                Loading more...
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="text-center py-16">
          <h3 className="text-lg font-semibold mb-2">
            No posts in this gallery
          </h3>
          <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
            This gallery is empty.
          </p>
        </div>
      )}
      </PageContent>
    </PageWrapper>
  );
}
