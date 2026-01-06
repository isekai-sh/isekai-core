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
import {
  Heart,
  MessageCircle,
  Sparkles,
  ExternalLink,
  Lock,
  Printer,
  Crown,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { BrowseDeviation } from "@/lib/api";

interface JustifiedGalleryProps {
  deviations: BrowseDeviation[];
  onMoreLikeThis?: (deviation: BrowseDeviation) => void;
  onSelect?: (deviation: BrowseDeviation) => void;
  targetRowHeight?: number;
  gap?: number;
}

interface JustifiedItem {
  deviation: BrowseDeviation;
  width: number;
  height: number;
}

interface JustifiedRow {
  items: JustifiedItem[];
  height: number;
}

// Parse dimensions from DeviantArt preview URL if available
function parseDimensionsFromUrl(
  url: string
): { width: number; height: number } | null {
  // DeviantArt URLs often contain dimensions like "w_300,h_400"
  const match = url.match(/w_(\d+),h_(\d+)/);
  if (match) {
    return { width: parseInt(match[1], 10), height: parseInt(match[2], 10) };
  }
  return null;
}

// Calculate justified rows from deviations
function calculateJustifiedRows(
  deviations: BrowseDeviation[],
  containerWidth: number,
  targetRowHeight: number,
  gap: number
): JustifiedRow[] {
  if (containerWidth <= 0) return [];

  const rows: JustifiedRow[] = [];
  let currentRowItems: JustifiedItem[] = [];
  let currentRowWidth = 0;

  for (const deviation of deviations) {
    // Try to get dimensions from URL, or use default aspect ratio
    const dims = parseDimensionsFromUrl(
      deviation.previewUrl || deviation.thumbUrl || ""
    );
    const aspectRatio = dims ? dims.width / dims.height : 4 / 5; // Default to 4:5 (portrait)
    const scaledWidth = targetRowHeight * aspectRatio;

    const itemWithGap = scaledWidth + gap;

    // Check if adding this item would exceed container width
    if (
      currentRowWidth + itemWithGap > containerWidth &&
      currentRowItems.length > 0
    ) {
      // Finalize current row
      const row = finalizeRow(currentRowItems, containerWidth, gap, false);
      rows.push(row);
      currentRowItems = [];
      currentRowWidth = 0;
    }

    currentRowItems.push({
      deviation,
      width: scaledWidth,
      height: targetRowHeight,
    });
    currentRowWidth += itemWithGap;
  }

  // Handle last row (don't stretch to fill)
  if (currentRowItems.length > 0) {
    const row = finalizeRow(currentRowItems, containerWidth, gap, true);
    rows.push(row);
  }

  return rows;
}

// Finalize a row by scaling items to fill the container width
function finalizeRow(
  items: JustifiedItem[],
  containerWidth: number,
  gap: number,
  isLastRow: boolean
): JustifiedRow {
  const totalGapWidth = gap * (items.length - 1);
  const totalItemWidth = items.reduce((sum, item) => sum + item.width, 0);
  const availableWidth = containerWidth - totalGapWidth;

  // For the last row, don't stretch if it would make items too large
  const scaleFactor =
    isLastRow && totalItemWidth < availableWidth * 0.7
      ? 1 // Keep original size for sparse last rows
      : availableWidth / totalItemWidth;

  const rowHeight = items[0].height * scaleFactor;

  return {
    items: items.map((item) => ({
      ...item,
      width: item.width * scaleFactor,
      height: rowHeight,
    })),
    height: rowHeight,
  };
}

function JustifiedItem({
  item,
  gap,
  onMoreLikeThis,
  onSelect,
}: {
  item: JustifiedItem;
  gap: number;
  onMoreLikeThis?: (deviation: BrowseDeviation) => void;
  onSelect?: (deviation: BrowseDeviation) => void;
}) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const { deviation, width, height } = item;

  const imageUrl = deviation.previewUrl || deviation.thumbUrl || "";

  const handleClick = () => {
    if (onSelect) {
      onSelect(deviation);
    } else {
      window.open(deviation.url, "_blank", "noopener,noreferrer");
    }
  };

  const handleMoreLikeThis = (e: React.MouseEvent) => {
    e.stopPropagation();
    onMoreLikeThis?.(deviation);
  };

  return (
    <div
      className="relative overflow-hidden rounded-lg bg-muted cursor-pointer transition-all duration-200 hover:ring-2 hover:ring-primary/50 hover:shadow-lg flex-shrink-0"
      style={{ width, height, marginRight: gap }}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Skeleton placeholder while loading */}
      {!isLoaded && (
        <div className="absolute inset-0 animate-pulse bg-muted-foreground/10" />
      )}

      {/* Image */}
      <img
        src={imageUrl}
        alt={deviation.title}
        className={cn(
          "w-full h-full object-cover transition-opacity duration-300",
          isLoaded ? "opacity-100" : "opacity-0"
        )}
        loading="lazy"
        onLoad={() => setIsLoaded(true)}
      />

      {/* Hover overlay */}
      <div
        className={cn(
          "absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent transition-opacity duration-200",
          isHovered ? "opacity-100" : "opacity-0"
        )}
      >
        {/* Top actions */}
        <div className="absolute top-2 right-2 flex gap-1">
          {onMoreLikeThis && (
            <button
              onClick={handleMoreLikeThis}
              className="p-1.5 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
              title="More like this"
            >
              <Sparkles className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              window.open(deviation.url, "_blank", "noopener,noreferrer");
            }}
            className="p-1.5 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
            title="Open in DeviantArt"
          >
            <ExternalLink className="h-4 w-4" />
          </button>
        </div>

        {/* Bottom info */}
        <div className="absolute bottom-0 left-0 right-0 p-3">
          {/* Title */}
          <h3 className="text-white text-sm font-medium line-clamp-1 mb-2">
            {deviation.title}
          </h3>

          {/* Author and stats */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Avatar className="h-6 w-6 border border-white/20">
                <AvatarImage
                  src={deviation.author.avatarUrl}
                  alt={deviation.author.username}
                />
                <AvatarFallback className="text-[10px] bg-black/50 text-white">
                  {deviation.author.username[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="text-white/90 text-xs truncate max-w-[100px]">
                {deviation.author.username}
              </span>
            </div>

            <div className="flex items-center gap-2 text-white/80 text-xs">
              <span className="flex items-center gap-0.5">
                <Heart className="h-3 w-3" />
                {deviation.stats.favourites.toLocaleString()}
              </span>
              <span className="flex items-center gap-0.5">
                <MessageCircle className="h-3 w-3" />
                {deviation.stats.comments.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Status badges - left side stack */}
      <div className="absolute top-2 left-2 flex flex-col gap-1">
        {/* Exclusive badge - locked content requiring purchase */}
        {deviation.isExclusive && (
          <div className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/90 text-white flex items-center gap-0.5">
            <Lock className="h-2.5 w-2.5" />
            Exclusive
          </div>
        )}
        {/* Premium badge - subscription-only content */}
        {deviation.isPremium && (
          <div className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-500/90 text-white flex items-center gap-0.5">
            <Crown className="h-2.5 w-2.5" />
            Premium
          </div>
        )}
        {/* Print available badge */}
        {deviation.printId && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              window.open(deviation.url, "_blank", "noopener,noreferrer");
            }}
            className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/90 text-white flex items-center gap-0.5 hover:bg-emerald-600/90 transition-colors"
            title="Print available on DeviantArt"
          >
            <Printer className="h-2.5 w-2.5" />
            Print
          </button>
        )}
        {/* Mature badge */}
        {deviation.isMature && (
          <div className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-500/90 text-white">
            M
          </div>
        )}
      </div>
    </div>
  );
}

export function JustifiedGallery({
  deviations,
  onMoreLikeThis,
  onSelect,
  targetRowHeight = 280,
  gap = 12,
}: JustifiedGalleryProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // Observe container width changes
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setContainerWidth(entry.contentRect.width);
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Calculate justified rows
  const rows = useMemo(
    () =>
      calculateJustifiedRows(deviations, containerWidth, targetRowHeight, gap),
    [deviations, containerWidth, targetRowHeight, gap]
  );

  return (
    <div ref={containerRef} className="w-full">
      {rows.map((row, rowIndex) => (
        <div key={rowIndex} className="flex" style={{ marginBottom: gap }}>
          {row.items.map((item, itemIndex) => (
            <JustifiedItem
              key={item.deviation.deviationId}
              item={item}
              gap={itemIndex < row.items.length - 1 ? gap : 0}
              onMoreLikeThis={onMoreLikeThis}
              onSelect={onSelect}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
