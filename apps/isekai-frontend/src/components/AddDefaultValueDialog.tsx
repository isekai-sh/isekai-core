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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { DefaultValueEditor, FIELD_LABELS } from '@/components/DefaultValueEditor';

interface AddDefaultValueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { fieldName: string; value: any; applyIfEmpty: boolean }) => Promise<void>;
  existingFields: string[];
}

const AVAILABLE_FIELDS = [
  'description',
  'tags',
  'isMature',
  'matureLevel',
  'categoryPath',
  'galleryIds',
  'allowComments',
  'allowFreeDownload',
  'isAiGenerated',
  'noAi',
  'addWatermark',
  'displayResolution',
];

export function AddDefaultValueDialog({
  open,
  onOpenChange,
  onSubmit,
  existingFields,
}: AddDefaultValueDialogProps) {
  const [fieldName, setFieldName] = useState('');
  const [value, setValue] = useState<any>(null);
  const [applyIfEmpty, setApplyIfEmpty] = useState(true);
  const [loading, setLoading] = useState(false);

  const availableFields = AVAILABLE_FIELDS.filter((field) => !existingFields.includes(field));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fieldName || value === null || value === undefined) return;

    setLoading(true);
    try {
      await onSubmit({
        fieldName,
        value,
        applyIfEmpty,
      });

      // Reset form
      setFieldName('');
      setValue(null);
      setApplyIfEmpty(true);
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  const handleFieldChange = (newField: string) => {
    setFieldName(newField);

    // Set default values based on field type
    switch (newField) {
      case 'description':
      case 'categoryPath':
        setValue('');
        break;
      case 'tags':
      case 'galleryIds':
        setValue([]);
        break;
      case 'isMature':
      case 'allowComments':
      case 'allowFreeDownload':
      case 'isAiGenerated':
      case 'noAi':
        setValue(true);
        break;
      case 'matureLevel':
        setValue('moderate');
        break;
      default:
        setValue(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add Default Value</DialogTitle>
            <DialogDescription>
              Set a default value that will be applied to drafts when they are scheduled.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {availableFields.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                All available fields already have default values configured.
              </p>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>
                    Field <span className="text-destructive">*</span>
                  </Label>
                  <Select value={fieldName} onValueChange={handleFieldChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a field..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableFields.map((field) => (
                        <SelectItem key={field} value={field}>
                          {FIELD_LABELS[field]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {fieldName && (
                  <>
                    <DefaultValueEditor fieldName={fieldName} value={value} onChange={setValue} />

                    <div className="flex items-center justify-between pt-4 border-t">
                      <div className="space-y-0.5">
                        <Label>Only apply if empty</Label>
                        <p className="text-sm text-muted-foreground">
                          Only set this value if the draft doesn't already have one
                        </p>
                      </div>
                      <Switch checked={applyIfEmpty} onCheckedChange={setApplyIfEmpty} />
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                !fieldName ||
                value === null ||
                value === undefined ||
                loading ||
                availableFields.length === 0
              }
            >
              {loading ? 'Adding...' : 'Add Default'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
