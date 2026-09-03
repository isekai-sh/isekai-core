/*
 * Copyright (C) 2025 Isekai
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArchiveRestore, Check, RotateCcw, Trash2, X } from 'lucide-react';
import { DecisionDetailPanel } from '@/components/DecisionDetailPanel';
import { ReviewGridPanel } from '@/components/ReviewGridPanel';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { curation, deviations, type CurationScope } from '@/lib/api';
import type { Deviation } from '@isekai/shared';

const PAGE_SIZE = 50;
type WorkspaceScope = CurationScope | 'trash';
type DecisionKind = 'keep' | 'discard';

interface LastDecision {
  kind: DecisionKind;
  deviation: Deviation;
}

interface CurationWorkspaceProps {
  onExit: () => void;
}

export function isCurationShortcutBlocked(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return true;
  if (
    target.closest(
      'input, textarea, select, button, a[href], [contenteditable="true"], [role="dialog"], [role="alertdialog"], [role="combobox"], [role="listbox"], [role="option"], [role="menu"], [role="menuitem"]'
    )
  )
    return true;
  return Boolean(
    document.querySelector(
      '[role="dialog"], [role="alertdialog"], [role="listbox"], [role="menu"], [data-radix-popper-content-wrapper] [data-state="open"]'
    )
  );
}

export function CurationWorkspace({ onExit }: CurationWorkspaceProps) {
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<WorkspaceScope>('uncurated');
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [lastDecision, setLastDecision] = useState<LastDecision | null>(null);
  const [sessionReviewed, setSessionReviewed] = useState(0);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'title'>('newest');
  const [filterBy, setFilterBy] = useState<'all' | 'has-tags' | 'no-tags'>('all');

  const queryKey = ['curation', scope] as const;
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam = 1 }) =>
      scope === 'trash'
        ? curation.trash({ page: pageParam, limit: PAGE_SIZE })
        : curation.list({ scope, page: pageParam, limit: PAGE_SIZE }),
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((count, page) => count + page.deviations.length, 0);
      return loaded < lastPage.total ? pages.length + 1 : undefined;
    },
    initialPageParam: 1,
  });

  const allItems = useMemo(
    () => data?.pages.flatMap((page) => page.deviations) || [],
    [data?.pages]
  );
  const visibleItems = useMemo(() => {
    let items = allItems.filter((item) => !hiddenIds.has(item.id));
    if (filterBy === 'has-tags') items = items.filter((item) => item.tags.length > 0);
    if (filterBy === 'no-tags') items = items.filter((item) => item.tags.length === 0);
    if (sortBy === 'title') return [...items].sort((a, b) => a.title.localeCompare(b.title));
    return [...items].sort((a, b) => {
      const delta = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return sortBy === 'oldest' ? -delta : delta;
    });
  }, [allItems, filterBy, hiddenIds, sortBy]);

  const focusedIndex = Math.max(
    0,
    visibleItems.findIndex((item) => item.id === focusedId)
  );
  const focusedDeviation = visibleItems.find((item) => item.id === focusedId) || visibleItems[0];
  const totalCount = data?.pages[0]?.total || 0;
  const purgeMessage =
    scope === 'trash' && focusedDeviation
      ? focusedDeviation.purgeStartedAt
        ? 'Permanent deletion has started. This draft can no longer be restored.'
        : focusedDeviation.purgeAfter
          ? `Restore before ${new Date(focusedDeviation.purgeAfter).toLocaleString()} to prevent permanent deletion.`
          : 'This discarded draft is waiting for its retention deadline.'
      : undefined;

  useEffect(() => {
    if (visibleItems.length === 0) {
      setFocusedId(null);
    } else if (!focusedId || !visibleItems.some((item) => item.id === focusedId)) {
      setFocusedId(visibleItems[0].id);
    }
  }, [focusedId, visibleItems]);

  useEffect(() => {
    if (visibleItems.length <= 5 && hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, visibleItems.length]);

  const decisionMutation = useMutation({
    mutationFn: ({ id, kind }: { id: string; kind: DecisionKind }) =>
      kind === 'keep' ? curation.keep(id) : curation.discard(id),
    onMutate: ({ id }) => {
      const previousFocus = focusedId;
      setLastDecision(null);
      setHiddenIds((current) => new Set(current).add(id));
      return { previousFocus };
    },
    onSuccess: (_result, variables) => {
      const original = allItems.find((item) => item.id === variables.id);
      const canUndo =
        variables.kind === 'discard' ||
        original?.curationStatus === 'uncurated' ||
        (original?.curationStatus === null &&
          original.ingestSource === 'direct_to_draft' &&
          original.curatedAt === null);
      if (original && canUndo) setLastDecision({ kind: variables.kind, deviation: original });
      setSessionReviewed((count) => count + 1);
      queryClient.invalidateQueries({ queryKey: ['curation'] });
      queryClient.invalidateQueries({ queryKey: ['deviations', 'draft'] });
    },
    onError: (error: Error, variables, context) => {
      setHiddenIds((current) => {
        const next = new Set(current);
        next.delete(variables.id);
        return next;
      });
      setFocusedId(context?.previousFocus || variables.id);
      toast({
        title: 'Decision not saved',
        description: error.message || 'Please try again',
        variant: 'destructive',
      });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => curation.restore(id),
    onMutate: (id) => {
      setHiddenIds((current) => new Set(current).add(id));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['curation'] });
      queryClient.invalidateQueries({ queryKey: ['deviations', 'draft'] });
      toast({ title: 'Restored', description: 'Draft returned from Trash' });
    },
    onError: (error: Error, id) => {
      setHiddenIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
      toast({
        title: 'Restore failed',
        description: error.message || 'Please try again',
        variant: 'destructive',
      });
    },
  });

  const undoMutation = useMutation({
    mutationFn: (decision: LastDecision) =>
      decision.kind === 'keep'
        ? curation.uncurate(decision.deviation.id)
        : curation.restore(decision.deviation.id),
    onMutate: () => setLastDecision(null),
    onSuccess: (_result, decision) => {
      setHiddenIds((current) => {
        const next = new Set(current);
        next.delete(decision.deviation.id);
        return next;
      });
      setFocusedId(decision.deviation.id);
      setSessionReviewed((count) => Math.max(0, count - 1));
      queryClient.invalidateQueries({ queryKey: ['curation'] });
      queryClient.invalidateQueries({ queryKey: ['deviations', 'draft'] });
      toast({
        title: 'Undone',
        description:
          decision.kind === 'keep' ? 'Draft marked uncurated again' : 'Draft restored from Trash',
      });
    },
    onError: (error: Error, decision) => {
      setLastDecision(decision);
      toast({
        title: 'Undo failed',
        description: error.message || 'Please try again',
        variant: 'destructive',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Deviation> }) =>
      deviations.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['curation'] }),
    onError: (error: Error) =>
      toast({
        title: 'Update failed',
        description: error.message || 'Please try again',
        variant: 'destructive',
      }),
  });

  const busy =
    decisionMutation.isPending ||
    restoreMutation.isPending ||
    undoMutation.isPending ||
    updateMutation.isPending;
  const decide = useCallback(
    (kind: DecisionKind) => {
      if (focusedDeviation && !busy && scope !== 'trash')
        decisionMutation.mutate({ id: focusedDeviation.id, kind });
    },
    [busy, decisionMutation, focusedDeviation, scope]
  );
  const undo = useCallback(() => {
    if (lastDecision && !busy) undoMutation.mutate(lastDecision);
  }, [busy, lastDecision, undoMutation]);
  const navigate = useCallback(
    (delta: -1 | 1) => {
      if (!visibleItems.length) return;
      const nextIndex = Math.min(visibleItems.length - 1, Math.max(0, focusedIndex + delta));
      setFocusedId(visibleItems[nextIndex].id);
    },
    [focusedIndex, visibleItems]
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.isComposing || isCurationShortcutBlocked(event.target) || busy)
        return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        if (lastDecision) {
          event.preventDefault();
          undo();
        }
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        onExit();
        return;
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        if (!visibleItems.length) return;
        event.preventDefault();
        navigate(event.key === 'ArrowLeft' ? -1 : 1);
        return;
      }
      if (scope === 'trash' || !focusedDeviation) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        decide('keep');
      }
      if (event.key === 'Backspace') {
        event.preventDefault();
        decide('discard');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [busy, decide, focusedDeviation, lastDecision, navigate, onExit, scope, undo, visibleItems]);

  const changeScope = (value: WorkspaceScope) => {
    setScope(value);
    setFocusedId(null);
    setHiddenIds(new Set());
    setLastDecision(null);
    setSessionReviewed(0);
  };

  return (
    <div className="relative flex h-full flex-col overflow-hidden" data-testid="curation-workspace">
      <Card className="mb-3 flex-shrink-0">
        <CardContent className="flex flex-wrap items-center justify-between gap-2 p-3">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Exit Curation mode"
              onClick={onExit}
            >
              <X className="h-4 w-4" />
            </Button>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold">Curation mode</h1>
              <p className="hidden text-xs text-muted-foreground sm:block">
                Keep drafts worth publishing. Discarded drafts remain in Trash.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {sessionReviewed > 0 && (
              <span className="hidden text-xs text-muted-foreground lg:inline">
                {sessionReviewed} reviewed this session
              </span>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!lastDecision || busy}
              aria-label="Undo last curation decision"
              onClick={undo}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Undo
            </Button>
            <Select
              value={scope}
              onValueChange={(value) => changeScope(value as WorkspaceScope)}
              disabled={busy}
            >
              <SelectTrigger aria-label="Curation queue" className="h-9 w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="uncurated">Uncurated</SelectItem>
                <SelectItem value="curated">Curated</SelectItem>
                <SelectItem value="all">All drafts</SelectItem>
                <SelectItem value="trash">Trash</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="min-h-0 flex-1">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
          </div>
        ) : (
          <div className="flex h-full gap-4">
            <ReviewGridPanel
              className="hidden xl:flex"
              deviations={visibleItems}
              selectedIds={new Set()}
              focusedId={focusedDeviation?.id || null}
              viewMode={viewMode}
              sortBy={sortBy}
              filterBy={filterBy}
              totalCount={totalCount}
              onToggleSelect={() => undefined}
              onFocus={setFocusedId}
              onViewModeChange={setViewMode}
              onSortChange={(value) => setSortBy(value as typeof sortBy)}
              onFilterChange={(value) => setFilterBy(value as typeof filterBy)}
              onSelectAll={() => undefined}
              onDeselectAll={() => undefined}
              onLoadMore={() => {
                if (hasNextPage && !isFetchingNextPage) fetchNextPage();
              }}
              hasMore={Boolean(hasNextPage)}
              isLoadingMore={isFetchingNextPage}
              selectable={false}
              footerLabel={scope === 'trash' ? 'in Trash' : 'in this queue'}
            />
            <DecisionDetailPanel
              deviation={focusedDeviation}
              disabled={busy}
              emptyMessage={
                scope === 'trash' ? 'Trash is empty' : 'No drafts in this curation queue'
              }
              progressText={
                visibleItems.length
                  ? `${Math.min(totalCount, sessionReviewed + focusedIndex + 1)} of ${totalCount}`
                  : undefined
              }
              contextMessage={purgeMessage}
              hasPrevious={focusedIndex > 0}
              hasNext={focusedIndex < visibleItems.length - 1}
              onPrevious={() => navigate(-1)}
              onNext={() => navigate(1)}
              onUpdate={(id, data) => updateMutation.mutate({ id, data })}
              secondaryAction={
                scope === 'trash'
                  ? undefined
                  : {
                      label: 'Discard to Trash',
                      mobileLabel: 'Discard',
                      shortcut: 'Backspace',
                      icon: Trash2,
                      variant: 'outline',
                      onAction: () => decide('discard'),
                    }
              }
              primaryAction={
                scope === 'trash'
                  ? {
                      label: 'Restore draft',
                      mobileLabel: 'Restore',
                      icon: ArchiveRestore,
                      disabled: Boolean(focusedDeviation?.purgeStartedAt),
                      onAction: (id) => restoreMutation.mutate(id),
                    }
                  : {
                      label: 'Keep draft',
                      mobileLabel: 'Keep',
                      shortcut: 'Enter',
                      icon: Check,
                      onAction: () => decide('keep'),
                    }
              }
            />
          </div>
        )}
      </div>

      {lastDecision && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-lg border bg-background px-4 py-3 shadow-xl md:bottom-6"
        >
          <span className="max-w-[55vw] truncate text-sm">
            {lastDecision.kind === 'keep' ? 'Draft kept' : 'Draft moved to Trash'}:{' '}
            {lastDecision.deviation.title}
          </span>
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={undo}>
            Undo
          </Button>
        </div>
      )}
    </div>
  );
}
