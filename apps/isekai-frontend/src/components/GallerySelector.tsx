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
import { useQuery } from '@tanstack/react-query';
import { Folder, Search } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { galleries } from '@/lib/api';

interface GallerySelectorProps {
  selectedGalleryIds: string[];
  onSelect: (galleryIds: string[]) => void;
  triggerButton?: React.ReactNode;
}

export function GallerySelector({
  selectedGalleryIds,
  onSelect,
  triggerButton,
}: GallerySelectorProps) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [tempSelected, setTempSelected] = useState<string[]>(selectedGalleryIds);

  // Cached query with 5-minute stale time
  const { data, isLoading } = useQuery({
    queryKey: ['galleries'],
    queryFn: () => galleries.list(0, 100),
    staleTime: 5 * 60 * 1000, // 5 minutes cache
  });

  const galleryList = data?.galleries || [];

  // Filter galleries by search term
  const filteredGalleries = galleryList.filter((gallery) =>
    gallery.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleGallery = (folderId: string) => {
    if (tempSelected.includes(folderId)) {
      setTempSelected(tempSelected.filter((id) => id !== folderId));
    } else {
      setTempSelected([...tempSelected, folderId]);
    }
  };

  const handleApply = () => {
    onSelect(tempSelected);
    setOpen(false);
  };

  const handleCancel = () => {
    setTempSelected(selectedGalleryIds);
    setOpen(false);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setTempSelected(selectedGalleryIds);
    }
    setOpen(newOpen);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        {triggerButton || (
          <Button variant="outline" size="sm" type="button">
            <Folder className="h-4 w-4 mr-2" />
            Select Folders
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Gallery Folders</Label>
            <span className="text-xs text-muted-foreground">{tempSelected.length} selected</span>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search folders..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
          </div>

          {/* Gallery List */}
          <div className="max-h-64 overflow-y-auto space-y-2">
            {isLoading ? (
              <div className="text-center py-4 text-sm text-muted-foreground">
                Loading galleries...
              </div>
            ) : filteredGalleries.length === 0 ? (
              <div className="text-center py-4 text-sm text-muted-foreground">
                {searchTerm ? 'No folders found' : 'No gallery folders available'}
              </div>
            ) : (
              filteredGalleries.map((gallery) => (
                <div
                  key={gallery.folderid}
                  className="flex items-center space-x-2 p-2 rounded-md hover:bg-accent cursor-pointer"
                  onClick={() => toggleGallery(gallery.folderid)}
                >
                  <Checkbox
                    checked={tempSelected.includes(gallery.folderid)}
                    onCheckedChange={() => toggleGallery(gallery.folderid)}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{gallery.name}</p>
                    {gallery.size !== undefined && (
                      <p className="text-xs text-muted-foreground">
                        {gallery.size} item{gallery.size !== 1 ? 's' : ''}
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" size="sm" onClick={handleCancel}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleApply}>
              Apply
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
