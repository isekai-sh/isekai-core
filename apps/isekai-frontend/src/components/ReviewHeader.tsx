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

import { useState } from "react";
import { Check, X, Tags } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { TagTemplateSelector } from "@/components/TemplateSelector";

interface ReviewHeaderProps {
  count: number;
  selectedCount: number;
  bulkTags: string[];
  setBulkTags: (tags: string[]) => void;
  onBulkApprove: () => void;
  onBulkReject: () => void;
}

export function ReviewHeader({
  count,
  selectedCount,
  bulkTags,
  setBulkTags,
  onBulkApprove,
  onBulkReject,
}: ReviewHeaderProps) {
  const [bulkTagsOpen, setBulkTagsOpen] = useState(false);

  const removeTag = (index: number) => {
    setBulkTags(bulkTags.filter((_, i) => i !== index));
  };

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !bulkTags.includes(trimmed)) {
      setBulkTags([...bulkTags, trimmed]);
    }
  };

  return (
    <div className="flex gap-2">
      <Popover open={bulkTagsOpen} onOpenChange={setBulkTagsOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm">
            <Tags className="h-4 w-4 mr-2" />
            Bulk Tag
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="end">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Tags</Label>
              <TagTemplateSelector
                onSelect={(templateTags) => setBulkTags(templateTags)}
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {bulkTags.map((tag, idx) => (
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
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBulkTagsOpen(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setBulkTagsOpen(false);
                }}
              >
                Done
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <Button variant="outline" size="sm" onClick={onBulkReject}>
        <X className="h-4 w-4 mr-2" />
        Reject Selected
      </Button>

      <Button size="sm" onClick={onBulkApprove}>
        <Check className="h-4 w-4 mr-2" />
        Approve Selected
      </Button>
    </div>
  );
}
