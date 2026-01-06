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

import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ClipboardCheck,
  FileImage,
  Clock,
  History,
  Zap,
  ChevronRight,
  Globe,
  User,
  Sparkles,
  Tag,
  Server,
  ExternalLink,
  BookOpen,
  Rocket,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { deviations, automations } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import { cn } from "@/lib/utils";

export function Dashboard() {
  const { user } = useAuthStore();

  // Fetch stats
  const { data: reviewData, isLoading: loadingReview } = useQuery({
    queryKey: ["deviations", { status: "review" }],
    queryFn: () => deviations.list({ status: "review", limit: 8 }),
    staleTime: 30 * 1000,
  });

  const { data: draftsData, isLoading: loadingDrafts } = useQuery({
    queryKey: ["deviations", { status: "draft" }],
    queryFn: () => deviations.list({ status: "draft", limit: 8 }),
    staleTime: 30 * 1000,
  });

  const { data: scheduledData, isLoading: loadingScheduled } = useQuery({
    queryKey: ["deviations", { status: "scheduled" }],
    queryFn: () => deviations.list({ status: "scheduled", limit: 2 }),
    staleTime: 30 * 1000,
  });

  const { data: publishedData, isLoading: loadingPublished } = useQuery({
    queryKey: ["deviations", { status: "published" }],
    queryFn: () => deviations.list({ status: "published", limit: 5 }),
    staleTime: 30 * 1000,
  });

  const { data: automationsData, isLoading: loadingAutomations } = useQuery({
    queryKey: ["automations"],
    queryFn: () => automations.list(),
    staleTime: 30 * 1000,
  });

  const activeAutomations = automationsData?.automations ?? [];

  const isLoading =
    loadingReview ||
    loadingDrafts ||
    loadingScheduled ||
    loadingPublished ||
    loadingAutomations;

  const stats = [
    { label: "Pending", value: reviewData?.total ?? 0, icon: ClipboardCheck, href: "/review" },
    { label: "Drafts", value: draftsData?.total ?? 0, icon: FileImage, href: "/draft" },
    { label: "Scheduled", value: scheduledData?.total ?? 0, icon: Clock, href: "/scheduled" },
    { label: "Published", value: publishedData?.total ?? 0, icon: History, href: "/published" },
  ];

  const hasNoData = !isLoading &&
    (reviewData?.total ?? 0) === 0 &&
    (draftsData?.total ?? 0) === 0 &&
    (scheduledData?.total ?? 0) === 0 &&
    (publishedData?.total ?? 0) === 0 &&
    activeAutomations.length === 0;

  return (
    <div className="space-y-4">
      {/* Row 1: Stats - compact horizontal row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stats.map((stat) => {
          const Icon = stat.icon;
          const isReview = stat.href === "/review";
          return (
            <Link key={stat.label} to={stat.href}>
              <Card className={cn(
                "relative overflow-hidden transition-all group",
                isReview
                  ? "border-primary/30 bg-gradient-to-br from-primary/10 to-card hover:border-primary/50"
                  : "border-border/50 bg-card/50 hover:border-primary/30"
              )}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{stat.label}</p>
                      {isLoading ? (
                        <Skeleton className="h-6 w-10 mt-0.5" />
                      ) : (
                        <p className={cn(
                          "text-xl font-bold font-mono",
                          isReview && "text-primary"
                        )}>{stat.value}</p>
                      )}
                    </div>
                    <div className={cn(
                      "p-1.5 rounded-md",
                      isReview ? "bg-primary/20" : "bg-primary/10"
                    )}>
                      <Icon className="h-3.5 w-3.5 text-primary" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Empty State Hero */}
      {hasNoData && (
        <a
          href="https://isekai.sh"
          target="_blank"
          rel="noopener noreferrer"
          className="group block"
        >
          <Card className="relative overflow-hidden border-primary/30 bg-gradient-to-br from-primary/10 via-card/50 to-card/50 hover:border-primary/50 transition-all">
            <div className="absolute top-0 right-0 w-96 h-96 bg-primary/20 rounded-full blur-3xl group-hover:bg-primary/30 transition-all" />
            <CardContent className="p-8 relative">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
                {/* Left Column - Content */}
                <div className="space-y-4 px-4">
                  <div className="flex items-center gap-3">
                    <Rocket className="h-6 w-6 text-primary flex-shrink-0" />
                    <h3 className="text-2xl font-bold">Get started with Isekai</h3>
                  </div>
                  <p className="text-muted-foreground font-sans text-base leading-relaxed">
                    Welcome to Isekai! Start by uploading your first artwork, setting up automation workflows,
                    or exploring the documentation to learn how to streamline your DeviantArt publishing workflow.
                  </p>
                  <Button className="bg-primary text-primary-foreground hover:bg-primary/90 w-fit">
                    Read the Documentation
                    <ExternalLink className="ml-2 h-4 w-4" />
                  </Button>
                </div>

                {/* Right Column - Documentation Preview Ornament */}
                <div className="relative hidden lg:block">
                  <div className="relative bg-gradient-to-br from-background/90 to-card/90 backdrop-blur-xl rounded-xl border-2 border-border/50 shadow-2xl group-hover:shadow-primary/20 transition-all">
                    {/* Browser Chrome */}
                    <div className="px-4 py-3 border-b border-border/50">
                      <div className="flex items-center gap-3">
                        {/* Traffic Lights */}
                        <div className="flex gap-2 flex-shrink-0">
                          <div className="w-3 h-3 rounded-full bg-red-500/80" />
                          <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                          <div className="w-3 h-3 rounded-full bg-green-500/80" />
                        </div>
                        {/* Address Bar */}
                        <span className="text-xs font-mono text-muted-foreground">
                          https://isekai.sh
                        </span>
                      </div>
                    </div>

                    {/* Browser Content - Documentation Preview */}
                    <div className="p-4 space-y-2">
                      <div className="flex items-center gap-2 p-2 bg-primary/5 border border-primary/20 rounded-lg">
                        <BookOpen className="h-4 w-4 text-primary" />
                        <span className="text-xs font-medium">Getting Started</span>
                      </div>
                      <div className="flex items-center gap-2 p-2 bg-card/50 border border-border/30 rounded-lg">
                        <Zap className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs font-medium text-muted-foreground">Automation</span>
                      </div>
                      <div className="flex items-center gap-2 p-2 bg-card/50 border border-border/30 rounded-lg">
                        <FileImage className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs font-medium text-muted-foreground">
                          Upload Artwork
                        </span>
                      </div>
                      <div className="flex items-center gap-2 p-2 bg-card/50 border border-border/30 rounded-lg">
                        <Sparkles className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs font-medium text-muted-foreground">
                          ComfyUI Integration
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Decorative glow */}
                  <div className="absolute -z-10 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-primary/10 rounded-full blur-2xl group-hover:bg-primary/20 transition-all" />
                </div>
              </div>
            </CardContent>
          </Card>
        </a>
      )}

      {/* Row 2: Pending Review + Recent Drafts side by side */}
      {!hasNoData && (
      <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pending Review */}
        <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-br from-primary/5 to-card">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2 font-mono">
                <ClipboardCheck className="h-4 w-4 text-primary" />
                Pending Review
              </CardTitle>
              <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
                <Link to="/review">
                  View all <ChevronRight className="h-3 w-3 ml-1" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading ? (
              <div className="grid grid-cols-4 gap-2">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <Skeleton key={i} className="aspect-square rounded" />
                ))}
              </div>
            ) : !reviewData?.deviations?.length ? (
              <div className="py-6 flex flex-col items-center justify-center text-muted-foreground">
                <Sparkles className="h-6 w-6 mb-2 opacity-50" />
                <p className="text-sm">All caught up!</p>
              </div>
            ) : (
              <Link to="/review" className="grid grid-cols-4 gap-2">
                {reviewData.deviations.slice(0, 8).map((item: { id: string; title: string; files?: { storageUrl: string }[] }) => (
                  <div
                    key={item.id}
                    className="aspect-square rounded-sm overflow-hidden group relative"
                  >
                    {item.files?.[0]?.storageUrl ? (
                      <>
                        <img
                          src={item.files[0].storageUrl}
                          alt={item.title}
                          className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                      </>
                    ) : (
                      <div className="h-full w-full bg-muted flex items-center justify-center">
                        <FileImage className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                ))}
              </Link>
            )}
          </CardContent>
        </Card>

        {/* Recent Drafts */}
        <Card className="relative overflow-hidden border-border/50 bg-card/50">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2 font-mono">
                <FileImage className="h-4 w-4 text-primary" />
                Recent Drafts
              </CardTitle>
              <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
                <Link to="/draft">
                  View all <ChevronRight className="h-3 w-3 ml-1" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading ? (
              <div className="grid grid-cols-4 gap-2">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <Skeleton key={i} className="aspect-square rounded" />
                ))}
              </div>
            ) : !draftsData?.deviations?.length ? (
              <div className="py-6 flex flex-col items-center justify-center text-muted-foreground">
                <FileImage className="h-6 w-6 mb-2 opacity-50" />
                <p className="text-sm">No drafts yet</p>
              </div>
            ) : (
              <Link to="/draft" className="grid grid-cols-4 gap-2">
                {draftsData.deviations.slice(0, 8).map((item: { id: string; title: string; files?: { storageUrl: string }[] }) => (
                  <div
                    key={item.id}
                    className="aspect-square rounded-sm overflow-hidden group relative"
                  >
                    {item.files?.[0]?.storageUrl ? (
                      <>
                        <img
                          src={item.files[0].storageUrl}
                          alt={item.title}
                          className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                      </>
                    ) : (
                      <div className="h-full w-full bg-muted flex items-center justify-center">
                        <FileImage className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                ))}
              </Link>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Schedule + Automations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Upcoming Schedule */}
        <Card className="relative overflow-hidden border-border/50 bg-card/50">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2 font-mono">
                <Clock className="h-4 w-4 text-primary" />
                Upcoming Schedule
              </CardTitle>
              <Button variant="ghost" size="sm" className="h-7 text-xs text-primary hover:text-primary" asChild>
                <Link to="/scheduled">
                  View all <ChevronRight className="h-3 w-3 ml-1" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : !scheduledData?.deviations?.length ? (
              <div className="py-6 flex flex-col items-center justify-center text-muted-foreground">
                <Clock className="h-6 w-6 mb-2 opacity-50" />
                <p className="text-sm">No scheduled posts</p>
              </div>
            ) : (
              <Link to="/scheduled" className="block space-y-1">
                {scheduledData.deviations.slice(0, 2).map((item: { id: string; title: string; scheduledAt?: string; files?: { storageUrl: string }[] }, idx: number) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors group"
                  >
                    <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground w-20 shrink-0">
                      <div className={cn(
                        "w-1.5 h-1.5 rounded-full shrink-0",
                        idx === 0 ? "bg-primary" : "bg-muted-foreground/50"
                      )} />
                      <span>
                        {item.scheduledAt
                          ? new Date(item.scheduledAt).toLocaleTimeString(undefined, {
                              hour: "numeric",
                              minute: "2-digit",
                            })
                          : "--:--"}
                      </span>
                    </div>
                    {item.files?.[0]?.storageUrl ? (
                      <img
                        src={item.files[0].storageUrl}
                        alt={item.title}
                        className="h-8 w-8 rounded-sm object-cover"
                      />
                    ) : (
                      <div className="h-8 w-8 rounded-sm bg-muted flex items-center justify-center">
                        <FileImage className="h-3 w-3 text-muted-foreground" />
                      </div>
                    )}
                    <p className="text-sm truncate group-hover:text-primary transition-colors flex-1">
                      {item.title || "Untitled"}
                    </p>
                  </div>
                ))}
              </Link>
            )}
          </CardContent>
        </Card>

        {/* Active Automations */}
        <Card className="relative overflow-hidden border-border/50 bg-card/50">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2 font-mono">
                <Zap className="h-4 w-4 text-primary" />
                Active Automations
              </CardTitle>
              <Button variant="ghost" size="sm" className="h-7 text-xs text-primary hover:text-primary" asChild>
                <Link to="/automation">
                  View all <ChevronRight className="h-3 w-3 ml-1" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : !activeAutomations.filter((a: { isEnabled: boolean }) => a.isEnabled).length ? (
              <div className="py-6 flex flex-col items-center justify-center text-muted-foreground">
                <Zap className="h-6 w-6 mb-2 opacity-50" />
                <p className="text-sm">No active automations</p>
              </div>
            ) : (
              <Link to="/automation" className="block space-y-1">
                {activeAutomations
                  .filter((a: { isEnabled: boolean }) => a.isEnabled)
                  .slice(0, 2)
                  .map((automation: { id: string; name: string; scheduleType: string; intervalMinutes?: number | null }) => (
                    <div
                      key={automation.id}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors group"
                    >
                      <div className="h-8 w-8 rounded-sm bg-primary/10 flex items-center justify-center">
                        <Zap className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate group-hover:text-primary transition-colors">
                          {automation.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {automation.scheduleType === "interval"
                            ? `Every ${automation.intervalMinutes} min`
                            : "Fixed schedule"}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 px-1.5 py-0.5 bg-emerald-500/10 rounded text-emerald-500">
                        <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        <span className="text-[10px] font-medium">Running</span>
                      </div>
                    </div>
                  ))}
              </Link>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 4: Instance Info */}
      <Card className="border-border/50 bg-card/30">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-y-2 text-sm">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Account:</span>
              <span className="font-mono text-muted-foreground/80">{user?.username || "Not connected"}</span>
            </div>
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Instance:</span>
              <span className="font-mono text-muted-foreground/80">{window.location.origin}</span>
            </div>
            <div className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Version:</span>
              <span className="font-mono text-muted-foreground/80">{__APP_VERSION__}</span>
            </div>
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Environment:</span>
              <span className="font-mono text-muted-foreground/80 capitalize">{import.meta.env.MODE}</span>
            </div>
          </div>
        </CardContent>
      </Card>
      </>
      )}
    </div>
  );
}
