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

import { FileImage } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { Deviation } from "@isekai/shared";

interface ReviewGridItemProps {
  deviation: Deviation;
  isSelected: boolean;
  isFocused: boolean;
  viewMode: "grid" | "list";
  onToggleSelect: () => void;
  onFocus: () => void;
}

export function ReviewGridItem({
  deviation,
  isSelected,
  isFocused,
  viewMode,
  onToggleSelect,
  onFocus,
}: ReviewGridItemProps) {
  if (viewMode === "list") {
    return (
      <div
        className={cn(
          "relative flex items-center gap-3 rounded overflow-hidden cursor-pointer transition-all p-2",
          isSelected && "bg-primary text-primary-foreground",
          !isSelected && isFocused && "bg-primary/20",
          !isSelected && !isFocused && "hover:bg-muted/50"
        )}
        onClick={onFocus}
      >
        {/* Checkbox */}
        <div
          className="flex-shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect();
          }}
        >
          <Checkbox
            checked={isSelected}
            className={cn(!isSelected && "border-muted-foreground/50 data-[state=unchecked]:bg-muted")}
          />
        </div>

        {/* Thumbnail */}
        <div className="flex-shrink-0 w-16 h-16 rounded overflow-hidden bg-muted">
          {deviation.files?.[0]?.storageUrl ? (
            <img
              src={deviation.files[0].storageUrl}
              alt={deviation.title}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <FileImage className="h-6 w-6 text-muted-foreground" />
            </div>
          )}
        </div>

        {/* Title and tags */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{deviation.title}</p>
          {deviation.tags.length > 0 && (
            <p
              className={cn(
                "text-xs truncate",
                isSelected
                  ? "text-primary-foreground/80"
                  : "text-muted-foreground"
              )}
            >
              {deviation.tags.length} tag
              {deviation.tags.length !== 1 ? "s" : ""}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative aspect-square rounded overflow-hidden cursor-pointer transition-all"
      )}
      onClick={onFocus}
    >
      {/* Selection overlay */}
      {isSelected && (
        <div className="absolute inset-0 bg-primary/50 z-10 pointer-events-none" />
      )}

      {/* Focused overlay */}
      {!isSelected && isFocused && (
        <div className="absolute inset-0 bg-primary/20 z-10 pointer-events-none" />
      )}

      {/* Thumbnail image */}
      {deviation.files?.[0]?.storageUrl ? (
        <img
          src={deviation.files[0].storageUrl}
          alt={deviation.title}
          className="w-full h-full object-cover absolute inset-0"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full bg-muted flex items-center justify-center absolute inset-0">
          <FileImage className="h-8 w-8 text-muted-foreground" />
        </div>
      )}

      {/* Checkbox overlay */}
      <div
        className="absolute top-2 left-2 z-20"
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelect();
        }}
      >
        <Checkbox
          checked={isSelected}
          className={cn(
            "bg-background",
            !isSelected && "border-muted-foreground/50"
          )}
        />
      </div>

      {/* Tag indicator */}
      {deviation.tags.length > 0 && (
        <div className="absolute top-2 right-2 z-20">
          <Badge variant="secondary" className="text-xs">
            {deviation.tags.length} tag{deviation.tags.length !== 1 ? "s" : ""}
          </Badge>
        </div>
      )}
    </div>
  );
}
