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

import { useState } from 'react';
import { Heart, MessageCircle, Sparkles, ExternalLink, Lock, Printer, Crown } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn, type CardSize, type ViewMode } from '@/lib/utils';
import type { BrowseDeviation } from '@/lib/api';

interface DeviationCardProps {
  deviation: BrowseDeviation;
  onMoreLikeThis?: (deviation: BrowseDeviation) => void;
  onSelect?: (deviation: BrowseDeviation) => void;
  size?: CardSize;
  viewMode?: ViewMode;
}

// Bento grid: column and row spanning for featured items
const SIZE_CLASSES: Record<CardSize, string> = {
  regular: 'row-span-2', // Regular items: 1 col, 2 rows (tall card)
  medium: 'col-span-2 row-span-2', // Medium items: 2 cols, 2 rows (square-ish)
  large: 'col-span-2 row-span-3', // Large items: 2 cols, 3 rows (big feature)
};

export function DeviationCard({
  deviation,
  onMoreLikeThis,
  onSelect,
  size = 'regular',
  viewMode = 'bento',
}: DeviationCardProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const isFeatured = size !== 'regular' && viewMode === 'bento';

  // Use previewUrl for crisp high quality images, fallback to thumbUrl
  const imageUrl = deviation.previewUrl || deviation.thumbUrl || '';

  const handleClick = () => {
    if (onSelect) {
      onSelect(deviation);
    } else {
      window.open(deviation.url, '_blank', 'noopener,noreferrer');
    }
  };

  const handleMoreLikeThis = (e: React.MouseEvent) => {
    e.stopPropagation();
    onMoreLikeThis?.(deviation);
  };

  return (
    <div
      className={cn(
        viewMode === 'bento' && SIZE_CLASSES[size],
        viewMode === 'masonry' && 'mb-3 break-inside-avoid'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={cn(
          'group relative overflow-hidden rounded-lg bg-muted cursor-pointer transition-all duration-200',
          'hover:ring-2 hover:ring-primary/50 hover:shadow-lg',
          viewMode === 'bento' && 'h-full',
          isFeatured && 'ring-2 ring-primary/30'
        )}
        onClick={handleClick}
      >
        {/* Skeleton placeholder while loading */}
        {!isLoaded && (
          <div
            className={cn(
              'w-full animate-pulse bg-muted-foreground/10',
              viewMode === 'bento' ? 'h-full' : isFeatured ? 'aspect-video' : 'aspect-[4/5]'
            )}
          />
        )}

        {/* Image - fills container in bento, natural height in masonry */}
        <img
          src={imageUrl}
          alt={deviation.title}
          className={cn(
            'w-full transition-opacity duration-300',
            viewMode === 'bento' ? 'h-full object-cover' : 'h-auto block',
            isLoaded ? 'opacity-100' : 'opacity-0 absolute inset-0'
          )}
          loading="lazy"
          onLoad={() => setIsLoaded(true)}
        />

        {/* Featured badge */}
        {isFeatured && (
          <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary text-primary-foreground flex items-center gap-1">
            <Sparkles className="h-3 w-3" />
            Featured
          </div>
        )}

        {/* Hover overlay */}
        <div
          className={cn(
            'absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent transition-opacity duration-200',
            isHovered ? 'opacity-100' : 'opacity-0'
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
                window.open(deviation.url, '_blank', 'noopener,noreferrer');
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
            <h3
              className={cn(
                'text-white font-medium line-clamp-1 mb-2',
                isFeatured ? 'text-base' : 'text-sm'
              )}
            >
              {deviation.title}
            </h3>

            {/* Author and stats */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Avatar
                  className={cn('border border-white/20', isFeatured ? 'h-7 w-7' : 'h-6 w-6')}
                >
                  <AvatarImage src={deviation.author.avatarUrl} alt={deviation.author.username} />
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
        <div
          className={cn(
            'absolute left-2 flex flex-col gap-1 z-10',
            isFeatured ? 'top-10' : 'top-2'
          )}
        >
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
                window.open(deviation.url, '_blank', 'noopener,noreferrer');
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
    </div>
  );
}
