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

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FIELD_LABELS } from '@/components/DefaultValueEditor';
import { Trash2 } from 'lucide-react';

interface DefaultValue {
  id: string;
  fieldName: string;
  value: any;
  applyIfEmpty: boolean;
}

interface DefaultValuesListProps {
  values: DefaultValue[];
  onDelete: (id: string) => void;
  deletingId?: string | null;
}

function formatValue(fieldName: string, value: any): string {
  switch (fieldName) {
    case 'description':
    case 'categoryPath':
      return value || '(empty)';

    case 'tags':
      return Array.isArray(value) && value.length > 0 ? value.join(', ') : '(no tags)';

    case 'galleryIds':
      return Array.isArray(value) && value.length > 0
        ? `${value.length} ${value.length === 1 ? 'gallery' : 'galleries'} selected`
        : '(no galleries)';

    case 'isMature':
    case 'allowComments':
    case 'allowFreeDownload':
    case 'isAiGenerated':
    case 'noAi':
      return value ? 'Yes' : 'No';

    case 'matureLevel':
      return value === 'moderate' ? 'Moderate' : 'Strict';

    default:
      return String(value);
  }
}

export function DefaultValuesList({ values, onDelete, deletingId }: DefaultValuesListProps) {
  if (values.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No default values configured. Add a default value to automatically apply settings to
        scheduled drafts.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {values.map((defaultValue) => (
        <Card key={defaultValue.id} className="p-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <h4 className="font-medium text-sm">{FIELD_LABELS[defaultValue.fieldName]}</h4>
                {defaultValue.applyIfEmpty && (
                  <Badge variant="secondary" className="text-xs">
                    If empty
                  </Badge>
                )}
              </div>

              <div className="text-sm">
                {defaultValue.fieldName === 'description' && (
                  <p className="whitespace-pre-wrap text-muted-foreground">
                    {formatValue(defaultValue.fieldName, defaultValue.value)}
                  </p>
                )}

                {defaultValue.fieldName === 'tags' && Array.isArray(defaultValue.value) && (
                  <div className="flex flex-wrap gap-1">
                    {defaultValue.value.map((tag) => (
                      <Badge key={tag} variant="outline">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}

                {!['description', 'tags'].includes(defaultValue.fieldName) && (
                  <p className="text-muted-foreground">
                    {formatValue(defaultValue.fieldName, defaultValue.value)}
                  </p>
                )}
              </div>
            </div>

            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              onClick={() => onDelete(defaultValue.id)}
              disabled={deletingId === defaultValue.id}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
