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

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { FileImage, Images } from 'lucide-react';

interface UploadModeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onModeSelected: (mode: 'single' | 'multiple') => void;
}

export function UploadModeDialog({ open, onOpenChange, onModeSelected }: UploadModeDialogProps) {
  const handleModeSelect = (mode: 'single' | 'multiple') => {
    onModeSelected(mode);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>How would you like to upload?</DialogTitle>
          <DialogDescription>
            Choose whether to create a single artwork with multiple files or separate artworks
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-4">
          <Card
            className="p-4 cursor-pointer hover:bg-accent transition-colors border-2 hover:border-primary group"
            onClick={() => handleModeSelect('multiple')}
          >
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <FileImage className="h-5 w-5 text-primary group-hover:text-accent-foreground" />
                  <Label
                    htmlFor="multiple"
                    className="text-base font-semibold cursor-pointer group-hover:text-accent-foreground"
                  >
                    Single Media Deviation
                  </Label>
                </div>
                <p className="text-sm text-muted-foreground group-hover:text-accent-foreground">
                  Each file becomes its own deviation. Great for batch uploading individual pieces.
                </p>
              </div>
            </div>
          </Card>

          <Card
            className="p-4 cursor-pointer hover:bg-accent transition-colors border-2 hover:border-primary group"
            onClick={() => handleModeSelect('single')}
          >
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Images className="h-5 w-5 text-primary group-hover:text-accent-foreground" />
                  <Label
                    htmlFor="single"
                    className="text-base font-semibold cursor-pointer group-hover:text-accent-foreground"
                  >
                    Multiple Media Deviation
                  </Label>
                </div>
                <p className="text-sm text-muted-foreground group-hover:text-accent-foreground">
                  Perfect for galleries, photo sets, or multi-page artworks. All files will be part
                  of one deviation.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
