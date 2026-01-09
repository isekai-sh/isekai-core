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
import { Link } from 'react-router-dom';
import { MoreVertical, Pencil, Trash2, Image as ImageIcon } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { DeviantArtGalleryFolder } from '@isekai/shared';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { galleries } from '@/lib/api';
import { EditGalleryDialog } from './EditGalleryDialog';

interface GalleryListItemProps {
  gallery: DeviantArtGalleryFolder;
}

export function GalleryListItem({ gallery }: GalleryListItemProps) {
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const deleteMutation = useMutation({
    mutationFn: () => galleries.delete(gallery.folderid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['galleries'] });
      toast({
        title: 'Gallery deleted',
        description: 'The gallery has been deleted successfully.',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to delete gallery. Please try again.',
        variant: 'destructive',
      });
    },
  });

  return (
    <>
      <div className="group relative rounded-lg border bg-card overflow-hidden hover:shadow-md transition-shadow">
        <div className="flex gap-4 p-4">
          {/* Thumbnail */}
          <Link
            to={`/galleries/${gallery.folderid}`}
            className="flex-shrink-0 w-32 h-24 rounded-md overflow-hidden bg-muted flex items-center justify-center"
          >
            {gallery.thumb?.preview?.src ? (
              <img
                src={gallery.thumb.preview.src}
                alt={gallery.name}
                className="w-full h-full object-cover"
                onError={(e) => {
                  console.error('Failed to load image:', gallery.thumb?.preview?.src);
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <ImageIcon className="h-8 w-8 text-muted-foreground/50" />
            )}
          </Link>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-2">
              <Link
                to={`/galleries/${gallery.folderid}`}
                className="flex-1 min-w-0 hover:underline"
              >
                <h3 className="font-semibold text-lg">{gallery.name}</h3>
              </Link>

              {/* Actions Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setEditDialogOpen(true)}>
                    <Pencil className="h-4 w-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setDeleteDialogOpen(true)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {gallery.description && (
              <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                {gallery.description}
              </p>
            )}

            <div className="text-sm text-muted-foreground">
              {gallery.size || 0} {gallery.size === 1 ? 'post' : 'posts'}
            </div>
          </div>
        </div>
      </div>

      {/* Edit Dialog */}
      <EditGalleryDialog
        gallery={gallery as any}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Gallery?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{gallery.name}"? This action cannot be undone. Posts
              in this gallery will not be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
