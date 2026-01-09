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

import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, X, Tag } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { browse } from '@/lib/api';

interface TagAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSearch: (tag: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
}

export interface TagAutocompleteRef {
  focus: () => void;
}

export const TagAutocomplete = forwardRef<TagAutocompleteRef, TagAutocompleteProps>(
  function TagAutocomplete(
    { value, onChange, onSearch, placeholder = 'Search tags...', className, inputClassName },
    ref
  ) {
    const [open, setOpen] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Expose focus method to parent
    useImperativeHandle(ref, () => ({
      focus: () => {
        inputRef.current?.focus();
      },
    }));

    // Debounced query for tag suggestions
    const { data: suggestions, isLoading } = useQuery({
      queryKey: ['tagSearch', value],
      queryFn: () => browse.searchTags(value),
      enabled: value.length >= 2,
      staleTime: 60 * 1000, // Cache for 1 minute
    });

    const tags = suggestions?.tags || [];

    // Handle click outside to close dropdown
    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
          setOpen(false);
        }
      };

      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      onChange(newValue);
      setOpen(newValue.length >= 2);
    };

    const handleTagSelect = (tag: string) => {
      onChange(tag);
      setOpen(false);
      onSearch(tag);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && value.trim()) {
        e.preventDefault();
        setOpen(false);
        onSearch(value.trim());
      }
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };

    const handleClear = () => {
      onChange('');
      setOpen(false);
      inputRef.current?.focus();
    };

    return (
      <div ref={containerRef} className={cn('relative', className)}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            type="text"
            value={value}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              if (value.length >= 2) setOpen(true);
            }}
            placeholder={placeholder}
            className={cn('pl-9 pr-9', inputClassName)}
          />
          {value && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
              onClick={handleClear}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>

        {/* Dropdown */}
        {open && (
          <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-popover border rounded-md shadow-lg overflow-hidden">
            {isLoading ? (
              <div className="p-3 text-sm text-muted-foreground text-center">Searching...</div>
            ) : tags.length > 0 ? (
              <div className="max-h-60 overflow-y-auto">
                {tags.map((tag) => (
                  <button
                    key={tag}
                    className={cn(
                      'w-full px-3 py-2 text-left text-sm flex items-center gap-2',
                      'hover:bg-accent transition-colors'
                    )}
                    onClick={() => handleTagSelect(tag)}
                  >
                    <Tag className="h-3 w-3 text-muted-foreground" />
                    <span>{tag}</span>
                  </button>
                ))}
              </div>
            ) : value.length >= 2 ? (
              <div className="p-3 text-sm text-muted-foreground text-center">
                No tags found. Press Enter to search.
              </div>
            ) : null}
          </div>
        )}
      </div>
    );
  }
);
