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

import { useQuery } from '@tanstack/react-query';
import {
  Heart,
  MessageCircle,
  Eye,
  Download,
  ExternalLink,
  Calendar,
  Folder,
  X,
} from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { browse, type BrowseDeviation, type DeviationDetail } from '@/lib/api';
import { cn } from '@/lib/utils';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';

interface DeviationDetailModalProps {
  deviation: BrowseDeviation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTagClick?: (tag: string) => void;
}

export function DeviationDetailModal({
  deviation,
  open,
  onOpenChange,
  onTagClick,
}: DeviationDetailModalProps) {
  // Fetch full deviation details
  const { data: details, isLoading: detailsLoading } = useQuery({
    queryKey: ['deviation', deviation?.deviationId],
    queryFn: () => browse.getDeviation(deviation!.deviationId),
    enabled: open && !!deviation?.deviationId,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch similar deviations
  const { data: moreLikeThis, isLoading: similarLoading } = useQuery({
    queryKey: ['moreLikeThis', deviation?.deviationId],
    queryFn: () => browse.moreLikeThis(deviation!.deviationId),
    enabled: open && !!deviation?.deviationId,
    staleTime: 5 * 60 * 1000,
  });

  const handleTagClick = (tag: string) => {
    onOpenChange(false);
    onTagClick?.(tag);
  };

  const handleDownload = () => {
    if (details?.downloadUrl) {
      window.open(details.downloadUrl, '_blank');
    }
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Separate more from artist and similar deviations
  const moreFromArtist =
    moreLikeThis?.deviations
      ?.filter((d) => d.author.username === deviation?.author.username)
      .slice(0, 6) || [];

  const similarDeviations =
    moreLikeThis?.deviations
      ?.filter((d) => d.author.username !== deviation?.author.username)
      .slice(0, 6) || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] h-[90vh] p-0 gap-0 rounded-lg">
        <VisuallyHidden>
          <DialogTitle>{details?.title || deviation?.title || 'Deviation Details'}</DialogTitle>
        </VisuallyHidden>

        {/* Close button */}
        <button
          onClick={() => onOpenChange(false)}
          className="absolute right-4 top-4 z-50 rounded-full p-2 bg-background/80 hover:bg-background transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex flex-col md:flex-row h-full">
          {/* Left: Image */}
          <div className="flex-1 bg-black flex items-center justify-center min-h-[300px] md:min-h-0">
            {detailsLoading ? (
              <Skeleton className="w-full h-full" />
            ) : (
              <img
                src={details?.fullImageUrl || details?.previewUrl || deviation?.previewUrl || ''}
                alt={details?.title || deviation?.title}
                className="max-w-full max-h-full object-contain"
              />
            )}
          </div>

          {/* Right: Details */}
          <ScrollArea className="w-full md:w-[380px] border-l">
            <div className="p-4 space-y-4">
              {/* Author */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarImage
                      src={details?.author.avatarUrl || deviation?.author.avatarUrl}
                      alt={details?.author.username || deviation?.author.username}
                    />
                    <AvatarFallback>
                      {(details?.author.username || deviation?.author.username)?.[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium text-sm">
                      {details?.author.username || deviation?.author.username}
                    </p>
                    {details?.publishedTime && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(details.publishedTime).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </p>
                    )}
                  </div>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <a
                    href={details?.url || deviation?.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="h-4 w-4 mr-1" />
                    DeviantArt
                  </a>
                </Button>
              </div>

              {/* Title */}
              <div>
                {detailsLoading ? (
                  <Skeleton className="h-6 w-3/4" />
                ) : (
                  <h2 className="text-lg font-semibold">{details?.title || deviation?.title}</h2>
                )}
              </div>

              {/* Stats */}
              <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Heart className="h-4 w-4" />
                  {(details?.stats.favourites || deviation?.stats.favourites || 0).toLocaleString()}
                </span>
                <span className="flex items-center gap-1">
                  <MessageCircle className="h-4 w-4" />
                  {(details?.stats.comments || deviation?.stats.comments || 0).toLocaleString()}
                </span>
                {details?.stats.views && details.stats.views > 0 && (
                  <span className="flex items-center gap-1">
                    <Eye className="h-4 w-4" />
                    {details.stats.views.toLocaleString()}
                  </span>
                )}
                {details?.stats.downloads && details.stats.downloads > 0 && (
                  <span className="flex items-center gap-1">
                    <Download className="h-4 w-4" />
                    {details.stats.downloads.toLocaleString()}
                  </span>
                )}
              </div>

              {/* Download button */}
              {details?.isDownloadable && details?.downloadUrl && (
                <Button onClick={handleDownload} variant="secondary" className="w-full">
                  <Download className="h-4 w-4 mr-2" />
                  Download
                  {details.downloadFilesize && (
                    <span className="ml-1 text-muted-foreground">
                      ({formatFileSize(details.downloadFilesize)})
                    </span>
                  )}
                </Button>
              )}

              {/* Description */}
              {details?.description && (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <div
                    className="text-sm text-muted-foreground"
                    dangerouslySetInnerHTML={{ __html: details.description }}
                  />
                </div>
              )}

              {/* Category */}
              {details?.category && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Folder className="h-4 w-4" />
                  <span>{details.category.replace(/\//g, ' › ')}</span>
                </div>
              )}

              {/* Tags */}
              {details?.tags && details.tags.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Tags
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {details.tags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="secondary"
                        className="cursor-pointer hover:bg-primary-foreground hover:text-primary transition-colors"
                        onClick={() => handleTagClick(tag)}
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* More from artist */}
              {moreFromArtist.length > 0 && (
                <div className="space-y-2 pt-2 border-t">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    More from {deviation?.author.username}
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {moreFromArtist.map((d) => (
                      <MiniDeviationCard
                        key={d.deviationId}
                        deviation={d}
                        onClick={() => {
                          // Could navigate to this deviation
                          window.open(d.url, '_blank');
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Similar deviations */}
              {similarDeviations.length > 0 && (
                <div className="space-y-2 pt-2 border-t">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Similar deviations
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {similarDeviations.map((d) => (
                      <MiniDeviationCard
                        key={d.deviationId}
                        deviation={d}
                        onClick={() => {
                          window.open(d.url, '_blank');
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Loading states for similar */}
              {similarLoading && (
                <div className="space-y-2 pt-2 border-t">
                  <Skeleton className="h-4 w-32" />
                  <div className="grid grid-cols-3 gap-2">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="aspect-square rounded-md" />
                    ))}
                  </div>
                </div>
              )}

              {/* Mature content warning */}
              {details?.isMature && (
                <div className="flex items-center gap-2 text-xs text-orange-500 bg-orange-500/10 p-2 rounded">
                  <span className="font-medium">Mature Content</span>
                  {details.matureLevel && <span>({details.matureLevel})</span>}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Mini card for similar deviations
function MiniDeviationCard({
  deviation,
  onClick,
}: {
  deviation: BrowseDeviation;
  onClick: () => void;
}) {
  return (
    <div
      className="relative aspect-square rounded-md overflow-hidden cursor-pointer group"
      onClick={onClick}
    >
      <img
        src={deviation.thumbUrl || deviation.previewUrl || ''}
        alt={deviation.title}
        className="w-full h-full object-cover transition-transform group-hover:scale-105"
      />
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors" />
    </div>
  );
}
