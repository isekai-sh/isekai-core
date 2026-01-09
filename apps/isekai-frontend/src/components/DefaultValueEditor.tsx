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

import { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { galleries } from '@/lib/api';
import { X, Loader2 } from 'lucide-react';

interface DefaultValueEditorProps {
  fieldName: string;
  value: any;
  onChange: (value: any) => void;
}

export function DefaultValueEditor({ fieldName, value, onChange }: DefaultValueEditorProps) {
  const { toast } = useToast();
  const [userGalleries, setUserGalleries] = useState<any[]>([]);
  const [loadingGalleries, setLoadingGalleries] = useState(false);

  // Fetch galleries when galleryIds field is rendered
  useEffect(() => {
    if (fieldName === 'galleryIds') {
      loadGalleries();
    }
  }, [fieldName]);

  const loadGalleries = async () => {
    setLoadingGalleries(true);
    try {
      const allGalleries = await galleries.listAll();
      setUserGalleries(allGalleries || []);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to load galleries',
        variant: 'destructive',
      });
    } finally {
      setLoadingGalleries(false);
    }
  };

  const handleTagAdd = (tag: string) => {
    const trimmedTag = tag.trim();
    const currentTags = Array.isArray(value) ? value : [];

    // Validate tag
    if (!trimmedTag) {
      toast({
        title: 'Invalid Tag',
        description: 'Tag cannot be empty',
        variant: 'destructive',
      });
      return false;
    }

    if (trimmedTag.length > 100) {
      toast({
        title: 'Invalid Tag',
        description: 'Tag cannot exceed 100 characters',
        variant: 'destructive',
      });
      return false;
    }

    if (currentTags.length >= 50) {
      toast({
        title: 'Too Many Tags',
        description: 'Cannot exceed 50 tags',
        variant: 'destructive',
      });
      return false;
    }

    // Check for duplicates (case-insensitive)
    if (currentTags.some((t: string) => t.toLowerCase() === trimmedTag.toLowerCase())) {
      toast({
        title: 'Duplicate Tag',
        description: 'This tag already exists',
        variant: 'destructive',
      });
      return false;
    }

    onChange([...currentTags, trimmedTag]);
    return true;
  };

  const handleTagRemove = (tagToRemove: string) => {
    const currentTags = Array.isArray(value) ? value : [];
    onChange(currentTags.filter((tag) => tag !== tagToRemove));
  };

  switch (fieldName) {
    case 'description':
      return (
        <div className="space-y-2">
          <Label>Description</Label>
          <Textarea
            placeholder="Enter default description..."
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            rows={4}
          />
        </div>
      );

    case 'tags':
      return (
        <div className="space-y-2">
          <Label>Tags</Label>
          <div className="flex flex-wrap gap-2 mb-2">
            {Array.isArray(value) && value.length > 0 ? (
              value.map((tag) => (
                <Badge key={tag} variant="secondary" className="gap-1">
                  {tag}
                  <button
                    type="button"
                    onClick={() => handleTagRemove(tag)}
                    className="ml-1 hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No tags added yet</p>
            )}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Type a tag and press Enter"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const success = handleTagAdd(e.currentTarget.value);
                  if (success) {
                    e.currentTarget.value = '';
                  }
                }
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground">Press Enter to add each tag</p>
        </div>
      );

    case 'isMature':
      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Mature Content</Label>
              <p className="text-sm text-muted-foreground">Mark content as mature</p>
            </div>
            <Switch checked={!!value} onCheckedChange={onChange} />
          </div>
        </div>
      );

    case 'matureLevel':
      return (
        <div className="space-y-2">
          <Label>Mature Content Level</Label>
          <Select value={value || 'moderate'} onValueChange={onChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="moderate">Moderate</SelectItem>
              <SelectItem value="strict">Strict</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Moderate for nudity and mild content, Strict for explicit content
          </p>
        </div>
      );

    case 'categoryPath':
      return (
        <div className="space-y-2">
          <Label>Category Path</Label>
          <Input
            placeholder="e.g., Digital Art / Drawings"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            DeviantArt category path for the post (e.g., "Digital Art / Drawings")
          </p>
        </div>
      );

    case 'galleryIds':
      const selectedGalleryIds = Array.isArray(value) ? value : [];

      const toggleGallery = (galleryId: string) => {
        if (selectedGalleryIds.includes(galleryId)) {
          onChange(selectedGalleryIds.filter((id) => id !== galleryId));
        } else {
          if (selectedGalleryIds.length >= 10) {
            toast({
              title: 'Too Many Galleries',
              description: 'Cannot exceed 10 galleries',
              variant: 'destructive',
            });
            return;
          }
          onChange([...selectedGalleryIds, galleryId]);
        }
      };

      return (
        <div className="space-y-2">
          <Label>Gallery Folders</Label>
          {loadingGalleries ? (
            <div className="flex items-center gap-2 h-10 px-3 py-2 border rounded-md text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading galleries...
            </div>
          ) : userGalleries.length === 0 ? (
            <div className="px-3 py-2 border rounded-md text-sm text-muted-foreground">
              No galleries found
            </div>
          ) : (
            <div className="border rounded-md max-h-60 overflow-y-auto">
              {userGalleries.map((gallery) => (
                <div
                  key={gallery.folderid}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-accent cursor-pointer"
                  onClick={() => toggleGallery(gallery.folderid)}
                >
                  <input
                    type="checkbox"
                    checked={selectedGalleryIds.includes(gallery.folderid)}
                    onChange={() => {}} // Handled by parent div onClick
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <span className="text-sm">{gallery.name}</span>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Select gallery folders where posts will be published ({selectedGalleryIds.length}/10
            selected)
          </p>
        </div>
      );

    case 'allowComments':
      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Allow Comments</Label>
              <p className="text-sm text-muted-foreground">Let others comment on this deviation</p>
            </div>
            <Switch checked={!!value} onCheckedChange={onChange} />
          </div>
        </div>
      );

    case 'allowFreeDownload':
      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Allow Free Download</Label>
              <p className="text-sm text-muted-foreground">
                Allow free downloading of this deviation
              </p>
            </div>
            <Switch checked={!!value} onCheckedChange={onChange} />
          </div>
        </div>
      );

    case 'isAiGenerated':
      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>AI Generated</Label>
              <p className="text-sm text-muted-foreground">Content was generated using AI</p>
            </div>
            <Switch checked={!!value} onCheckedChange={onChange} />
          </div>
        </div>
      );

    case 'noAi':
      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>No AI Training</Label>
              <p className="text-sm text-muted-foreground">
                Opt-out of AI training with this content
              </p>
            </div>
            <Switch checked={!!value} onCheckedChange={onChange} />
          </div>
        </div>
      );

    case 'addWatermark':
      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Add Watermark</Label>
              <p className="text-sm text-muted-foreground">
                Add DeviantArt watermark (only works when display resolution is set)
              </p>
            </div>
            <Switch checked={!!value} onCheckedChange={onChange} />
          </div>
        </div>
      );

    case 'displayResolution':
      return (
        <div className="space-y-2">
          <Label>Display Resolution</Label>
          <Select value={String(value ?? 0)} onValueChange={(val) => onChange(Number(val))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Original (no resize)</SelectItem>
              <SelectItem value="1">400px</SelectItem>
              <SelectItem value="2">600px</SelectItem>
              <SelectItem value="3">800px</SelectItem>
              <SelectItem value="4">900px</SelectItem>
              <SelectItem value="5">1024px</SelectItem>
              <SelectItem value="6">1280px</SelectItem>
              <SelectItem value="7">1600px</SelectItem>
              <SelectItem value="8">1920px</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Resize images to display resolution. Watermark only available when not set to Original.
          </p>
        </div>
      );

    default:
      return <div className="text-sm text-muted-foreground">Unknown field type: {fieldName}</div>;
  }
}

export const FIELD_LABELS: Record<string, string> = {
  description: 'Description',
  tags: 'Tags',
  isMature: 'Mature Content',
  matureLevel: 'Mature Level',
  categoryPath: 'Category Path',
  galleryIds: 'Gallery Folders',
  allowComments: 'Allow Comments',
  allowFreeDownload: 'Allow Free Download',
  isAiGenerated: 'AI Generated',
  noAi: 'No AI Training',
  addWatermark: 'Add Watermark',
  displayResolution: 'Display Resolution',
};
