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

import { formatDistanceToNow } from 'date-fns';
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileImage,
  History,
  Loader2,
  RefreshCw,
  Rocket,
  ShoppingBag,
  Sparkles,
  TriangleAlert,
  Zap,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { DashboardOverviewResponse } from '@isekai/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { dashboard } from '@/lib/api';
import { fallbackImageToOriginal, ImageSize, selectImageVariant } from '@/lib/image';
import { formatScheduleDateTimeShort } from '@/lib/timezone';
import { cn } from '@/lib/utils';

type DashboardDeviation = DashboardOverviewResponse['recentIntake'][number];
type DashboardAutomation = DashboardOverviewResponse['automations'][number];
type DashboardRule = DashboardAutomation['scheduleRules'][number];

const POLL_INTERVAL_MS = 15_000;

function formatRule(rule: DashboardRule): string {
  let description = 'Custom schedule';

  if (rule.type === 'fixed_time' && rule.timeOfDay) {
    description = `Fixed time · ${rule.timeOfDay} account time`;
  } else if (rule.type === 'fixed_interval' && rule.intervalMinutes && rule.deviationsPerInterval) {
    description = `${rule.deviationsPerInterval} every ${rule.intervalMinutes} min`;
  } else if (rule.type === 'daily_quota' && rule.dailyQuota) {
    description = `${rule.dailyQuota} per day`;
  }

  if ((rule.daysOfWeek?.length ?? 0) > 0) {
    const days = rule.daysOfWeek!.map((day) => day.slice(0, 3)).join(', ');
    return `${description} · ${days}`;
  }

  return description;
}

function statusLabel(status: string): string {
  return status.replace(/_/g, ' ').replace(/^./, (letter) => letter.toUpperCase());
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  href,
  urgent = false,
}: {
  label: string;
  value: number;
  detail: string;
  icon: typeof FileImage;
  href?: string;
  urgent?: boolean;
}) {
  const content = (
    <Card
      className={cn(
        'h-full border-border/60 bg-card/70 transition-colors',
        href && 'hover:border-primary/50 hover:bg-card',
        urgent && value > 0 && 'border-destructive/40'
      )}
    >
      <CardContent className="flex h-full items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p
            className={cn(
              'mt-1 text-3xl font-semibold tabular-nums',
              urgent && value > 0 && 'text-destructive'
            )}
          >
            {value.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        </div>
        <div
          className={cn(
            'rounded-lg bg-primary/10 p-2 text-primary',
            urgent && value > 0 && 'bg-destructive/10 text-destructive'
          )}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </div>
      </CardContent>
    </Card>
  );

  return href ? (
    <Link
      className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      to={href}
    >
      {content}
    </Link>
  ) : (
    content
  );
}

function ArtworkThumbnail({ deviation }: { deviation: DashboardDeviation }) {
  const file = deviation.files[0];

  return (
    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-muted sm:h-16 sm:w-16">
      {file?.storageUrl ? (
        <img
          src={selectImageVariant(file, ImageSize.XS)}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          onError={(event) => fallbackImageToOriginal(event.currentTarget, file.storageUrl)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <FileImage className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}

function IntakeRow({ deviation }: { deviation: DashboardDeviation }) {
  const isUncurated = deviation.curationStatus === 'uncurated';

  return (
    <Link
      to={`/deviations/${deviation.id}`}
      className="flex items-center gap-3 rounded-lg border border-transparent p-2 transition-colors hover:border-border hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ArtworkThumbnail deviation={deviation} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{deviation.title || 'Untitled deviation'}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <Badge variant={deviation.status === 'review' ? 'default' : 'secondary'}>
            {statusLabel(deviation.status)}
          </Badge>
          {deviation.status === 'draft' && (
            <Badge variant={isUncurated ? 'outline' : 'secondary'}>
              {isUncurated ? 'Uncurated' : 'Curated'}
            </Badge>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Added {formatDistanceToNow(new Date(deviation.createdAt), { addSuffix: true })}
        </p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}

function UpcomingRow({ deviation }: { deviation: DashboardDeviation }) {
  return (
    <Link
      to={`/deviations/${deviation.id}`}
      className="flex items-center gap-3 rounded-lg border border-transparent p-2 transition-colors hover:border-border hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ArtworkThumbnail deviation={deviation} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{deviation.title || 'Untitled deviation'}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {deviation.actualPublishAt
            ? formatScheduleDateTimeShort(deviation.actualPublishAt)
            : 'Publish time unavailable'}
        </p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}

function AutomationRow({ automation }: { automation: DashboardAutomation }) {
  const activeRules = automation.scheduleRules.filter((rule) => rule.enabled);
  const status = automation.isExecuting ? 'Running now' : 'Enabled';
  const StatusIcon = automation.isExecuting ? Loader2 : CheckCircle2;
  const lastExecution = automation.lastExecution;
  const lastRunSummary = lastExecution
    ? lastExecution.errorMessage
      ? `Last run: ${lastExecution.errorMessage} · ${formatDistanceToNow(new Date(lastExecution.executedAt), { addSuffix: true })}`
      : `Last run scheduled ${lastExecution.scheduledCount} · ${formatDistanceToNow(new Date(lastExecution.executedAt), { addSuffix: true })}`
    : 'No execution recorded';

  return (
    <Link
      to={`/automation/${automation.id}`}
      className="block rounded-lg border border-border/60 p-3 transition-colors hover:border-primary/40 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{automation.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">{lastRunSummary}</p>
        </div>
        <Badge variant="default" className="shrink-0 gap-1">
          <StatusIcon
            className={cn('h-3 w-3', automation.isExecuting && 'animate-spin')}
            aria-hidden="true"
          />
          {status}
        </Badge>
      </div>
      <div className="mt-2 space-y-1">
        {activeRules.length === 0 ? (
          <p className="text-xs text-muted-foreground">No active schedule rules</p>
        ) : (
          activeRules.slice(0, 2).map((rule) => (
            <p key={rule.id} className="truncate text-xs text-muted-foreground">
              {formatRule(rule)}
            </p>
          ))
        )}
        {activeRules.length > 2 && (
          <p className="text-xs text-muted-foreground">+{activeRules.length - 2} more rules</p>
        )}
      </div>
    </Link>
  );
}

function DashboardLoading() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading dashboard">
      <div className="space-y-2">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="h-28 rounded-lg" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-80 rounded-lg" />
        <Skeleton className="h-80 rounded-lg" />
      </div>
      <span className="sr-only">Loading dashboard</span>
    </div>
  );
}

export function Dashboard() {
  const { data, isLoading, isError, error, isFetching, refetch } = useQuery({
    queryKey: ['dashboard', 'overview'],
    queryFn: dashboard.overview,
    staleTime: 5_000,
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnMount: 'always',
    retry: false,
  });

  if (isLoading) return <DashboardLoading />;

  if (!data) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">Publishing operations at a glance.</p>
        </div>
        <Card className="border-destructive/40">
          <CardContent className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center">
            <AlertCircle className="h-6 w-6 shrink-0 text-destructive" aria-hidden="true" />
            <div className="flex-1">
              <h2 className="font-semibold">Dashboard could not be loaded</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {error instanceof Error ? error.message : 'Check the connection and try again.'}
              </p>
            </div>
            <Button onClick={() => void refetch()}>Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { counts } = data;
  const exclusiveJobs = counts.salePending + counts.saleProcessing + counts.saleFailed;
  const hasNoData =
    counts.review === 0 &&
    counts.uncurated === 0 &&
    counts.curatedDrafts === 0 &&
    counts.scheduled === 0 &&
    counts.failed === 0 &&
    counts.published7Days === 0 &&
    exclusiveJobs === 0 &&
    data.automations.length === 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Publishing operations at a glance. Updates every 15 seconds.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground" aria-live="polite">
            Updated {formatDistanceToNow(new Date(data.generatedAt), { addSuffix: true })}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            disabled={isFetching}
            aria-label="Refresh dashboard"
          >
            <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} aria-hidden="true" />
            Refresh
          </Button>
        </div>
      </header>

      {isError && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm sm:flex-row sm:items-center"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
          <p className="flex-1">
            Live refresh failed. Showing the last successful dashboard snapshot.
          </p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Retry refresh
          </Button>
        </div>
      )}

      {hasNoData && (
        <Card className="border-primary/30 bg-gradient-to-br from-primary/10 to-card">
          <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
            <div className="rounded-lg bg-primary/10 p-3 text-primary">
              <Rocket className="h-6 w-6" aria-hidden="true" />
            </div>
            <div className="flex-1">
              <h2 className="font-semibold">Start your publishing pipeline</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Add artwork to Drafts, then schedule it manually or with an automation.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link to="/draft">Open Drafts</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/automation">Set up automation</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <section aria-labelledby="attention-heading" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="attention-heading" className="text-lg font-semibold">
            Needs attention
          </h2>
          {data.oldestPendingSaleAt && (
            <p className="text-xs text-muted-foreground">
              Oldest pending exclusive job{' '}
              {formatDistanceToNow(new Date(data.oldestPendingSaleAt), { addSuffix: true })}
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard
            label="Review"
            value={counts.review}
            detail="Awaiting approval"
            icon={Sparkles}
            href="/review"
          />
          <MetricCard
            label="Uncurated"
            value={counts.uncurated}
            detail="Filter in Drafts to check"
            icon={TriangleAlert}
            href="/draft"
            urgent
          />
          <MetricCard
            label="Publishing failed"
            value={counts.failed}
            detail="Failed records to inspect"
            icon={AlertCircle}
            urgent
          />
          <MetricCard
            label="Exclusive jobs"
            value={exclusiveJobs}
            detail={`${counts.salePending} pending · ${counts.saleProcessing} processing · ${counts.saleFailed} failed`}
            icon={ShoppingBag}
            href="/exclusives-queue"
            urgent={counts.saleFailed > 0}
          />
        </div>
      </section>

      <section aria-labelledby="pipeline-heading" className="space-y-3">
        <h2 id="pipeline-heading" className="text-lg font-semibold">
          Pipeline
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard
            label="Curated drafts"
            value={counts.curatedDrafts}
            detail="Marked as curated"
            icon={CheckCircle2}
            href="/draft"
          />
          <MetricCard
            label="Scheduled"
            value={counts.scheduled}
            detail="Marked for publishing"
            icon={CalendarClock}
            href="/scheduled"
          />
          <MetricCard
            label="Published · 24h"
            value={counts.published24Hours}
            detail="Rolling 24 hours"
            icon={Clock3}
            href="/published"
          />
          <MetricCard
            label="Published · 7d"
            value={counts.published7Days}
            detail="Rolling seven days"
            icon={History}
            href="/published"
          />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-labelledby="recent-waiting-heading">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
              <h2
                id="recent-waiting-heading"
                className="text-base font-semibold leading-none tracking-tight"
              >
                Recent waiting items
              </h2>
              <div className="flex items-center gap-1">
                <Button asChild variant="ghost" size="sm">
                  <Link to="/review">Review</Link>
                </Button>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/draft">Drafts</Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-1 px-4 pb-4">
              {data.recentIntake.length > 0 ? (
                data.recentIntake.map((deviation) => (
                  <IntakeRow key={deviation.id} deviation={deviation} />
                ))
              ) : (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  No recent artwork waiting.
                </p>
              )}
            </CardContent>
          </Card>
        </section>

        <section aria-labelledby="upcoming-heading">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
              <h2
                id="upcoming-heading"
                className="text-base font-semibold leading-none tracking-tight"
              >
                Upcoming
              </h2>
              <Button asChild variant="ghost" size="sm">
                <Link to="/scheduled">Open schedule</Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-1 px-4 pb-4">
              {data.upcoming.length > 0 ? (
                data.upcoming.map((deviation) => (
                  <UpcomingRow key={deviation.id} deviation={deviation} />
                ))
              ) : (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  No future scheduled items.
                </p>
              )}
            </CardContent>
          </Card>
        </section>
      </div>

      <section aria-labelledby="automations-heading">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <h2
              id="automations-heading"
              className="flex items-center gap-2 text-base font-semibold leading-none tracking-tight"
            >
              <Zap className="h-4 w-4 text-primary" aria-hidden="true" />
              Automations
            </h2>
            <Button asChild variant="ghost" size="sm">
              <Link to="/automation">Manage</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {data.automations.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {data.automations.map((automation) => (
                  <AutomationRow key={automation.id} automation={automation} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <p className="text-sm text-muted-foreground">No enabled automations.</p>
                <Button asChild variant="outline" size="sm">
                  <Link to="/automation">Create automation</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
