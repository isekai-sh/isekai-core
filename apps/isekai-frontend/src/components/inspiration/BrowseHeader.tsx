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
import { LayoutGrid, LayoutDashboard, Rows3 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { browse, type BrowseMode, type TopTopicItem } from "@/lib/api";
import { cn, type ViewMode } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface BrowseTab {
  id: BrowseMode;
  label: string;
  icon: LucideIcon;
}

interface BrowseHeaderProps {
  mode: BrowseMode;
  selectedTag: string;
  matureContent: boolean;
  viewMode: ViewMode;
  onModeChange: (mode: BrowseMode) => void;
  onTagSelect: (tag: string) => void;
  onMatureContentChange: (enabled: boolean) => void;
  onViewModeChange: (viewMode: ViewMode) => void;
  onTopicSelect: (topic: string) => void;
  tabs: BrowseTab[];
}

export function BrowseHeader({
  mode,
  selectedTag,
  matureContent,
  viewMode,
  onModeChange,
  onMatureContentChange,
  onViewModeChange,
  onTopicSelect,
  tabs,
}: BrowseHeaderProps) {
  const { data: topicsData, isLoading: topicsLoading } = useQuery({
    queryKey: ["topTopics"],
    queryFn: () => browse.topTopics(),
    staleTime: 10 * 60 * 1000,
  });

  return (
    <div className="flex items-center gap-2 w-full">
      {/* Mode tabs */}
      <div className="flex items-center gap-1 shrink-0">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = mode === tab.id;
          return (
            <Button
              key={tab.id}
              variant={isActive ? "default" : "ghost"}
              size="sm"
              onClick={() => onModeChange(tab.id)}
              className={cn(
                "gap-1.5 h-8",
                !isActive && "text-muted-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </Button>
          );
        })}
      </div>

      {/* Divider */}
      <div className="hidden md:block h-6 w-px bg-border shrink-0" />

      {/* Trending topics - horizontal scroll */}
      <div className="hidden md:flex flex-1 overflow-x-auto scrollbar-hide min-w-0">
        <div className="flex gap-1.5">
          {topicsLoading
            ? Array.from({ length: 8 }).map((_, i) => (
                <Skeleton
                  key={i}
                  className="h-8 w-20 flex-shrink-0 rounded-md"
                />
              ))
            : topicsData?.topics.map((topic) => (
                <TopicChip
                  key={topic.canonicalName}
                  topic={topic}
                  isActive={
                    mode === "topic" && selectedTag === topic.canonicalName
                  }
                  onClick={() => onTopicSelect(topic.canonicalName)}
                />
              ))}
        </div>
      </div>

      {/* Spacer to push mature content to the right */}
      <div className="flex-1" />

      {/* Mature content switch */}
      <div className="flex items-center gap-2 shrink-0">
        <Switch
          id="mature-content"
          checked={matureContent}
          onCheckedChange={onMatureContentChange}
          className="scale-90"
        />
        <Label
          htmlFor="mature-content"
          className="text-xs text-muted-foreground cursor-pointer whitespace-nowrap"
        >
          18+
        </Label>
      </div>

      {/* View mode toggle */}
      <div className="hidden lg:flex items-center gap-0.5 shrink-0 border-l border-border pl-2">
        <Button
          variant={viewMode === "masonry" ? "secondary" : "ghost"}
          size="icon"
          className="h-8 w-8"
          onClick={() => onViewModeChange("masonry")}
          title="Masonry view"
        >
          <LayoutDashboard className="h-4 w-4" />
        </Button>
        <Button
          variant={viewMode === "bento" ? "secondary" : "ghost"}
          size="icon"
          className="h-8 w-8"
          onClick={() => onViewModeChange("bento")}
          title="Bento view"
        >
          <LayoutGrid className="h-4 w-4" />
        </Button>
        <Button
          variant={viewMode === "grid" ? "secondary" : "ghost"}
          size="icon"
          className="h-8 w-8"
          onClick={() => onViewModeChange("grid")}
          title="Grid view"
        >
          <Rows3 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function TopicChip({
  topic,
  isActive,
  onClick,
}: {
  topic: TopTopicItem;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative h-8 px-3 flex-shrink-0 rounded-md overflow-hidden transition-all",
        "hover:ring-1 hover:ring-primary/50",
        isActive && "ring-2 ring-primary"
      )}
    >
      {/* Background image */}
      {topic.exampleDeviation?.thumbUrl ? (
        <img
          src={topic.exampleDeviation.thumbUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-muted" />
      )}

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Topic name */}
      <span className="relative text-white text-xs font-medium whitespace-nowrap">
        {topic.name}
      </span>
    </button>
  );
}
