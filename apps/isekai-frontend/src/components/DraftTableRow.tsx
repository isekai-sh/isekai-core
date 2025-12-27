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

import { useState, useRef, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2, FileImage, Calendar, Check, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { TableCell, TableRow } from "@/components/ui/table";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import {
  TagTemplateSelector,
  DescriptionTemplateSelector,
} from "@/components/TemplateSelector";
import { GallerySelector } from "@/components/GallerySelector";
import { deviations } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import type { Deviation } from "@isekai/shared";

interface DraftTableRowProps {
  draft: Deviation;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
}

export function DraftTableRow({
  draft,
  index,
  isSelected,
  onSelect,
}: DraftTableRowProps) {
  const queryClient = useQueryClient();
  const titleRef = useRef<HTMLDivElement>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [tags, setTags] = useState<string[]>(draft.tags || []);
  const [description, setDescription] = useState(draft.description || "");
  const [galleryIds, setGalleryIds] = useState<string[]>(
    draft.galleryIds || []
  );
  const [scheduledDate, setScheduledDate] = useState<Date | undefined>(
    undefined
  );
  const [tagsOpen, setTagsOpen] = useState(false);
  const [descOpen, setDescOpen] = useState(false);

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Deviation>) => deviations.update(draft.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deviations"] });
      toast({ title: "Updated", description: "Draft updated successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update draft",
        variant: "destructive",
      });
    },
  });

  const scheduleMutation = useMutation({
    mutationFn: (scheduledAt: string) =>
      deviations.schedule(draft.id, scheduledAt),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deviations", "draft"] });
      queryClient.invalidateQueries({ queryKey: ["deviations", "scheduled"] });
      toast({
        title: "Scheduled",
        description: "Draft scheduled successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to schedule draft",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deviations.delete(draft.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deviations", "draft"] });
      toast({ title: "Deleted", description: "Draft deleted successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete draft",
        variant: "destructive",
      });
    },
  });

  const handleTitleBlur = () => {
    setIsEditingTitle(false);
    if (titleRef.current) {
      const newTitle = titleRef.current.textContent || "";
      if (newTitle !== draft.title && newTitle.trim()) {
        updateMutation.mutate({ title: newTitle.trim() });
      }
    }
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      titleRef.current?.blur();
    }
    if (e.key === "Escape") {
      if (titleRef.current) {
        titleRef.current.textContent = draft.title;
      }
      titleRef.current?.blur();
    }
  };

  const handleTagsApply = () => {
    updateMutation.mutate({ tags });
    setTagsOpen(false);
  };

  const handleTagsClear = () => {
    setTags([]);
    updateMutation.mutate({ tags: [] });
    setTagsOpen(false);
  };

  const handleDescriptionApply = () => {
    updateMutation.mutate({ description });
    setDescOpen(false);
  };

  const handleSchedule = () => {
    if (scheduledDate) {
      const scheduledAt = scheduledDate.toISOString();
      scheduleMutation.mutate(scheduledAt);
    }
  };

  const removeTag = (index: number) => {
    const newTags = tags.filter((_, i) => i !== index);
    setTags(newTags);
  };

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
    }
  };

  useEffect(() => {
    if (isEditingTitle && titleRef.current) {
      titleRef.current.focus();
      const range = document.createRange();
      range.selectNodeContents(titleRef.current);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, [isEditingTitle]);

  // Sync local state with draft prop changes
  useEffect(() => {
    setTags(draft.tags || []);
    setDescription(draft.description || "");
    setGalleryIds(draft.galleryIds || []);
    setScheduledDate(
      draft.scheduledAt ? new Date(draft.scheduledAt) : undefined
    );
  }, [draft.tags, draft.description, draft.galleryIds, draft.scheduledAt]);

  return (
    <TableRow>
      {/* Checkbox */}
      <TableCell>
        <Checkbox checked={isSelected} onCheckedChange={onSelect} />
      </TableCell>

      {/* Number */}
      <TableCell className="text-muted-foreground">{index}</TableCell>

      {/* Preview */}
      <TableCell>
        {draft.files && draft.files.length > 0 && draft.files[0].storageUrl ? (
          <img
            src={draft.files[0].storageUrl}
            alt={draft.title}
            className="w-20 h-20 object-cover rounded"
          />
        ) : (
          <div className="w-20 h-20 bg-muted rounded flex items-center justify-center">
            <FileImage className="h-10 w-10 text-muted-foreground" />
          </div>
        )}
      </TableCell>

      {/* Editable Title */}
      <TableCell>
        <div
          ref={titleRef}
          contentEditable={isEditingTitle}
          suppressContentEditableWarning
          onClick={() => setIsEditingTitle(true)}
          onBlur={handleTitleBlur}
          onKeyDown={handleTitleKeyDown}
          className={`font-medium cursor-text px-2 py-1 rounded min-h-[2rem] ${
            isEditingTitle ? "bg-muted ring-2 ring-ring" : "hover:bg-muted/50"
          }`}
        >
          {draft.title}
        </div>
      </TableCell>

      {/* Tags with Popover */}
      <TableCell>
        <Popover open={tagsOpen} onOpenChange={setTagsOpen}>
          <PopoverTrigger asChild>
            <button className="text-left text-sm text-muted-foreground transition-colors w-full">
              {tags.length > 0
                ? tags.slice(0, 2).join(", ") + (tags.length > 2 ? "..." : "")
                : "Add tags..."}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="start">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Tags</Label>
                <TagTemplateSelector
                  onSelect={(templateTags) => setTags(templateTags)}
                />
              </div>
              <div className="flex flex-wrap gap-1">
                {tags.map((tag, idx) => (
                  <Badge key={idx} variant="secondary">
                    {tag}
                    <button
                      onClick={() => removeTag(idx)}
                      className="ml-1 hover:bg-muted rounded-full p-0.5"
                    >
                      ×
                    </button>
                  </Badge>
                ))}
              </div>
              <Input
                placeholder="Add tag and press Enter..."
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag(e.currentTarget.value);
                    e.currentTarget.value = "";
                  }
                }}
              />
              <div className="flex justify-between gap-2">
                <Button variant="outline" size="sm" onClick={handleTagsClear}>
                  Clear Tags
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setTagsOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleTagsApply}>
                    Apply
                  </Button>
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </TableCell>

      {/* Description with Popover */}
      <TableCell>
        <Popover open={descOpen} onOpenChange={setDescOpen}>
          <PopoverTrigger asChild>
            <button className="text-left text-sm text-muted-foreground transition-colors w-full max-w-xs truncate">
              {description || "Add description..."}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-96" align="start">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Description</Label>
                <DescriptionTemplateSelector
                  onSelect={(text) => setDescription(text)}
                />
              </div>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Enter description..."
                rows={6}
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDescOpen(false)}
                >
                  Cancel
                </Button>
                <Button size="sm" onClick={handleDescriptionApply}>
                  Apply
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </TableCell>

      {/* Gallery Folders */}
      <TableCell>
        <GallerySelector
          selectedGalleryIds={galleryIds}
          onSelect={(ids) => {
            setGalleryIds(ids);
            updateMutation.mutate({ galleryIds: ids });
          }}
          triggerButton={
            <button className="text-left text-sm text-muted-foreground transition-colors w-full">
              {galleryIds.length > 0
                ? `${galleryIds.length} folder${
                    galleryIds.length > 1 ? "s" : ""
                  }`
                : "Add to folders..."}
            </button>
          }
        />
      </TableCell>

      {/* Inline Schedule Date & Time */}
      <TableCell>
        <div className="flex items-center gap-2">
          <DateTimePicker
            date={scheduledDate}
            setDate={(date) => {
              setScheduledDate(date);
              if (date) {
                updateMutation.mutate({ scheduledAt: date.toISOString() });
              }
            }}
            label=""
          />
        </div>
      </TableCell>

      {/* Sta.sh Only - Feature not yet implemented in schema, add in v0.2.0 */}
      <TableCell>
        <div className="flex items-center justify-center">
          <Switch checked={false} disabled onCheckedChange={() => {}} />
        </div>
      </TableCell>

      {/* Actions */}
      <TableCell>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="default"
            onClick={() => {
              if (scheduledDate) {
                scheduleMutation.mutate(scheduledDate.toISOString());
              }
            }}
            disabled={!scheduledDate || scheduleMutation.isPending}
          >
            <Send className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
