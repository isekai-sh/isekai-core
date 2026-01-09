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
import { FileText, Tag, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { templates } from '@/lib/api';
import type { Template, TagContent, DescriptionContent } from '@isekai/shared';

interface TagTemplateSelectorProps {
  onSelect: (tags: string[]) => void;
  currentTags?: string[];
}

export function TagTemplateSelector({ onSelect, currentTags = [] }: TagTemplateSelectorProps) {
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ['templates', 'tag'],
    queryFn: () => templates.list('tag'),
  });

  const templateList = data?.templates || [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" type="button">
          <Tag className="h-4 w-4 mr-2" />
          Templates
          <ChevronDown className="h-4 w-4 ml-2" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-2">
          <h4 className="font-medium text-sm">Tag Templates</h4>
          {templateList.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No templates yet</p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {templateList.map((template) => {
                const content = template.content as TagContent;
                return (
                  <button
                    key={template.id}
                    onClick={() => {
                      onSelect(content.tags);
                      setOpen(false);
                    }}
                    className="w-full text-left p-3 border rounded hover:bg-accent transition-colors"
                  >
                    <div className="font-medium text-sm mb-1">{template.name}</div>
                    <div className="flex flex-wrap gap-1">
                      {content.tags.map((tag, idx) => (
                        <Badge key={idx} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface DescriptionTemplateSelectorProps {
  onSelect: (text: string) => void;
}

export function DescriptionTemplateSelector({ onSelect }: DescriptionTemplateSelectorProps) {
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ['templates', 'description'],
    queryFn: () => templates.list('description'),
  });

  const templateList = data?.templates || [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" type="button">
          <FileText className="h-4 w-4 mr-2" />
          Templates
          <ChevronDown className="h-4 w-4 ml-2" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-2">
          <h4 className="font-medium text-sm">Description Templates</h4>
          {templateList.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No templates yet</p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {templateList.map((template) => {
                const content = template.content as DescriptionContent;
                return (
                  <button
                    key={template.id}
                    onClick={() => {
                      onSelect(content.text);
                      setOpen(false);
                    }}
                    className="w-full text-left p-3 border rounded hover:bg-accent transition-colors"
                  >
                    <div className="font-medium text-sm mb-1">{template.name}</div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{content.text}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
