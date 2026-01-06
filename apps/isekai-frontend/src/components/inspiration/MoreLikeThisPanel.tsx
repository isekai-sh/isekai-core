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

import { useQuery } from "@tanstack/react-query";
import { X, ExternalLink, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { browse, type BrowseDeviation } from "@/lib/api";
import { DeviationCard } from "./DeviationCard";

interface MoreLikeThisPanelProps {
  deviation: BrowseDeviation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MoreLikeThisPanel({
  deviation,
  open,
  onOpenChange,
}: MoreLikeThisPanelProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["moreLikeThis", deviation?.deviationId],
    queryFn: () => browse.moreLikeThis(deviation!.deviationId),
    enabled: !!deviation && open,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg p-0">
        <SheetHeader className="p-4 border-b">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-lg">More Like This</SheetTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-80px)]">
          {/* Seed deviation */}
          {deviation && (
            <div className="p-4 border-b">
              <div className="flex gap-3">
                <img
                  src={deviation.thumbUrl || deviation.previewUrl || ""}
                  alt={deviation.title}
                  className="w-20 h-20 object-cover rounded"
                />
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-sm line-clamp-2 mb-1">
                    {deviation.title}
                  </h3>
                  <div className="flex items-center gap-2 mb-2">
                    <Avatar className="h-5 w-5">
                      <AvatarImage src={deviation.author.avatarUrl} />
                      <AvatarFallback className="text-[8px]">
                        {deviation.author.username[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-xs text-muted-foreground">
                      {deviation.author.username}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => window.open(deviation.url, "_blank")}
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    View on DA
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Similar deviations */}
          <div className="p-4">
            {isLoading ? (
              <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="aspect-square rounded-lg bg-muted animate-pulse"
                  />
                ))}
              </div>
            ) : data?.deviations && data.deviations.length > 0 ? (
              <>
                {data.author && (
                  <div className="flex items-center gap-2 mb-3 pb-3 border-b">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      More from{" "}
                      <a
                        href={`https://www.deviantart.com/${data.author.username}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-foreground hover:underline"
                      >
                        {data.author.username}
                      </a>
                    </span>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  {data.deviations.map((d) => (
                    <DeviationCard key={d.deviationId} deviation={d} />
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p className="text-sm">No similar deviations found</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
