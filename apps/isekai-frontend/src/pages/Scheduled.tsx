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

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Clock,
  Upload,
  Eye,
  X,
  Calendar as CalendarIcon,
  Zap,
  Folder,
  Tags as TagsIcon,
  FileImage,
} from "lucide-react";
import { format } from "date-fns";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventClickArg } from "@fullcalendar/core";
import "./scheduled-calendar.css";
import { Card, CardContent } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { GallerySelector } from "@/components/GallerySelector";
import {
  TagTemplateSelector,
  DescriptionTemplateSelector,
} from "@/components/TemplateSelector";
import { deviations } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import {
  formatScheduleDateTimeShort,
  getTimezoneAbbreviation,
} from "@/lib/timezone";
import type { Deviation } from "@isekai/shared";

type ViewMode = "table" | "calendar";

export function Scheduled() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const timezone = getTimezoneAbbreviation();

  // View mode
  const [viewMode, setViewMode] = useState<ViewMode>("table");

  // Calendar state
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Bulk operation states
  const [bulkScheduleDate, setBulkScheduleDate] = useState<Date | undefined>(
    undefined
  );
  const [bulkGalleryIds, setBulkGalleryIds] = useState<string[]>([]);
  const [bulkTags, setBulkTags] = useState<string[]>([]);
  const [bulkDescription, setBulkDescription] = useState<string>("");
  const [tagsOpen, setTagsOpen] = useState(false);
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [showPublishNowDialog, setShowPublishNowDialog] = useState(false);

  // Fetch scheduled deviations (status = scheduled)
  const { data, isLoading } = useQuery({
    queryKey: ["deviations", "scheduled"],
    queryFn: async () => {
      return await deviations.list({ status: "scheduled" });
    },
  });

  const scheduledDeviations = data?.deviations || [];

  // Convert deviations to FullCalendar events
  const calendarEvents = useMemo(() => {
    return scheduledDeviations
      .filter((dev) => dev.scheduledAt) // Only include deviations with a schedule date
      .map((dev) => ({
        id: dev.id,
        title: dev.title,
        start: dev.scheduledAt!,
        end: dev.scheduledAt!,
        extendedProps: {
          deviation: dev,
        },
        backgroundColor:
          new Date(dev.scheduledAt!) < new Date() ? "#ef4444" : "#3b82f6",
        borderColor:
          new Date(dev.scheduledAt!) < new Date() ? "#dc2626" : "#2563eb",
      }));
  }, [scheduledDeviations]);

  // Get deviations for selected date
  const selectedDateDeviations = useMemo(() => {
    if (!selectedDate) return [];
    const dateKey = format(selectedDate, "yyyy-MM-dd");
    return scheduledDeviations.filter((dev) => {
      if (!dev.scheduledAt) return false;
      return format(new Date(dev.scheduledAt), "yyyy-MM-dd") === dateKey;
    });
  }, [selectedDate, scheduledDeviations]);

  // Mutations with optimistic updates
  const batchRescheduleMutation = useMutation({
    mutationFn: async ({
      deviationIds,
      scheduledAt,
    }: {
      deviationIds: string[];
      scheduledAt: string;
    }) => {
      return await deviations.batchReschedule(deviationIds, scheduledAt);
    },
    onMutate: async ({ deviationIds, scheduledAt }) => {
      await queryClient.cancelQueries({
        queryKey: ["deviations", "scheduled"],
      });
      const previousData = queryClient.getQueryData([
        "deviations",
        "scheduled",
      ]);

      queryClient.setQueryData(["deviations", "scheduled"], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          deviations: old.deviations.map((dev: Deviation) =>
            deviationIds.includes(dev.id) ? { ...dev, scheduledAt } : dev
          ),
        };
      });

      return { previousData };
    },
    onError: (error: any, _variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(
          ["deviations", "scheduled"],
          context.previousData
        );
      }
      toast({
        title: "Error",
        description: error.message || "Failed to reschedule",
        variant: "destructive",
      });
    },
    onSuccess: () => {
      setSelectedIds(new Set());
      setBulkScheduleDate(undefined);
      toast({ title: "Rescheduled", description: "Successfully rescheduled" });
    },
  });

  const batchCancelMutation = useMutation({
    mutationFn: async (deviationIds: string[]) => {
      return await deviations.batchCancel(deviationIds);
    },
    onMutate: async (deviationIds) => {
      await queryClient.cancelQueries({
        queryKey: ["deviations", "scheduled"],
      });
      const previousData = queryClient.getQueryData([
        "deviations",
        "scheduled",
      ]);

      queryClient.setQueryData(["deviations", "scheduled"], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          deviations: old.deviations.filter(
            (dev: Deviation) => !deviationIds.includes(dev.id)
          ),
        };
      });

      return { previousData };
    },
    onError: (error: any, _variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(
          ["deviations", "scheduled"],
          context.previousData
        );
      }
      toast({
        title: "Error",
        description: error.message || "Failed to cancel schedule",
        variant: "destructive",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deviations", "draft"] });
      setSelectedIds(new Set());
      toast({ title: "Cancelled", description: "Moved back to drafts" });
    },
  });

  const batchPublishNowMutation = useMutation({
    mutationFn: async (deviationIds: string[]) => {
      return await deviations.batchPublishNow(deviationIds);
    },
    onMutate: async (deviationIds) => {
      await queryClient.cancelQueries({
        queryKey: ["deviations", "scheduled"],
      });
      const previousData = queryClient.getQueryData([
        "deviations",
        "scheduled",
      ]);

      queryClient.setQueryData(["deviations", "scheduled"], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          deviations: old.deviations.filter(
            (dev: Deviation) => !deviationIds.includes(dev.id)
          ),
        };
      });

      return { previousData };
    },
    onError: (error: any, _variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(
          ["deviations", "scheduled"],
          context.previousData
        );
      }
      toast({
        title: "Error",
        description: error.message || "Failed to publish",
        variant: "destructive",
      });
    },
    onSuccess: () => {
      setSelectedIds(new Set());
      setShowPublishNowDialog(false);
      toast({ title: "Publishing", description: "Publishing now..." });
    },
  });

  const batchAssignGalleryMutation = useMutation({
    mutationFn: async ({
      deviationIds,
      galleryIds,
    }: {
      deviationIds: string[];
      galleryIds: string[];
    }) => {
      await Promise.all(
        deviationIds.map((id) => deviations.update(id, { galleryIds }))
      );
    },
    onMutate: async ({ deviationIds, galleryIds }) => {
      await queryClient.cancelQueries({
        queryKey: ["deviations", "scheduled"],
      });
      const previousData = queryClient.getQueryData([
        "deviations",
        "scheduled",
      ]);

      queryClient.setQueryData(["deviations", "scheduled"], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          deviations: old.deviations.map((dev: Deviation) =>
            deviationIds.includes(dev.id) ? { ...dev, galleryIds } : dev
          ),
        };
      });

      return { previousData };
    },
    onSuccess: () => {
      setSelectedIds(new Set());
      setBulkGalleryIds([]);
      toast({ title: "Updated", description: "Gallery folders assigned" });
    },
    onError: (error: any, _variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(
          ["deviations", "scheduled"],
          context.previousData
        );
      }
      toast({
        title: "Error",
        description: error.message || "Failed to assign gallery folders",
        variant: "destructive",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["deviations", "scheduled"] });
    },
  });

  const batchAssignTagsMutation = useMutation({
    mutationFn: async ({
      deviationIds,
      tags,
    }: {
      deviationIds: string[];
      tags: string[];
    }) => {
      await Promise.all(
        deviationIds.map((id) => deviations.update(id, { tags }))
      );
    },
    onMutate: async ({ deviationIds, tags }) => {
      await queryClient.cancelQueries({
        queryKey: ["deviations", "scheduled"],
      });
      const previousData = queryClient.getQueryData([
        "deviations",
        "scheduled",
      ]);

      queryClient.setQueryData(["deviations", "scheduled"], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          deviations: old.deviations.map((dev: Deviation) =>
            deviationIds.includes(dev.id) ? { ...dev, tags } : dev
          ),
        };
      });

      return { previousData };
    },
    onSuccess: () => {
      setSelectedIds(new Set());
      setBulkTags([]);
      setTagsOpen(false);
      toast({ title: "Updated", description: "Tags assigned" });
    },
    onError: (error: any, _variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(
          ["deviations", "scheduled"],
          context.previousData
        );
      }
      toast({
        title: "Error",
        description: error.message || "Failed to assign tags",
        variant: "destructive",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["deviations", "scheduled"] });
    },
  });

  const batchAssignDescriptionMutation = useMutation({
    mutationFn: async ({
      deviationIds,
      description,
    }: {
      deviationIds: string[];
      description: string;
    }) => {
      await Promise.all(
        deviationIds.map((id) => deviations.update(id, { description }))
      );
    },
    onMutate: async ({ deviationIds, description }) => {
      await queryClient.cancelQueries({
        queryKey: ["deviations", "scheduled"],
      });
      const previousData = queryClient.getQueryData([
        "deviations",
        "scheduled",
      ]);

      queryClient.setQueryData(["deviations", "scheduled"], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          deviations: old.deviations.map((dev: Deviation) =>
            deviationIds.includes(dev.id) ? { ...dev, description } : dev
          ),
        };
      });

      return { previousData };
    },
    onSuccess: () => {
      setSelectedIds(new Set());
      setBulkDescription("");
      setDescriptionOpen(false);
      toast({ title: "Updated", description: "Description assigned" });
    },
    onError: (error: any, _variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(
          ["deviations", "scheduled"],
          context.previousData
        );
      }
      toast({
        title: "Error",
        description: error.message || "Failed to assign description",
        variant: "destructive",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["deviations", "scheduled"] });
    },
  });

  // Handlers
  const toggleSelectAll = () => {
    if (selectedIds.size === scheduledDeviations.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(scheduledDeviations.map((d) => d.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleBulkReschedule = () => {
    if (selectedIds.size === 0 || !bulkScheduleDate) return;
    batchRescheduleMutation.mutate({
      deviationIds: Array.from(selectedIds),
      scheduledAt: bulkScheduleDate.toISOString(),
    });
  };

  const handleBulkCancel = () => {
    if (selectedIds.size === 0) return;
    batchCancelMutation.mutate(Array.from(selectedIds));
  };

  const handleBulkPublishNow = () => {
    if (selectedIds.size === 0) return;
    setShowPublishNowDialog(true);
  };

  const confirmBulkPublishNow = () => {
    batchPublishNowMutation.mutate(Array.from(selectedIds));
  };

  const handleBulkAssignTags = () => {
    if (selectedIds.size === 0 || bulkTags.length === 0) return;
    batchAssignTagsMutation.mutate({
      deviationIds: Array.from(selectedIds),
      tags: bulkTags,
    });
  };

  const handleBulkAssignDescription = () => {
    if (selectedIds.size === 0) return;
    batchAssignDescriptionMutation.mutate({
      deviationIds: Array.from(selectedIds),
      description: bulkDescription,
    });
  };

  const addBulkTag = (tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !bulkTags.includes(trimmed)) {
      setBulkTags([...bulkTags, trimmed]);
    }
  };

  const removeBulkTag = (index: number) => {
    setBulkTags(bulkTags.filter((_, i) => i !== index));
  };

  return (
    <div className="h-full flex flex-col gap-4 md:gap-6 overflow-hidden">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Scheduled</h1>
          <p className="text-muted-foreground mt-1">
            Manage your scheduled deviations ({scheduledDeviations.length})
          </p>
        </div>
      </div>

      <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
        <TabsList>
          <TabsTrigger value="table">Table View</TabsTrigger>
          <TabsTrigger value="calendar">Calendar View</TabsTrigger>
        </TabsList>

        <TabsContent value="table" className="mt-4">
          <Card className="flex-1 flex flex-col h-full">
            <CardContent className="pt-6 flex-1 flex flex-col h-full">
              {/* Bulk Operations Toolbar */}
              <div className="mb-4 p-4 border rounded-lg bg-background">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex items-center ${
                        selectedIds.size === 0
                          ? "opacity-50 pointer-events-none"
                          : ""
                      }`}
                    >
                      <DateTimePicker
                        date={bulkScheduleDate}
                        setDate={(date) => {
                          setBulkScheduleDate(date);
                          if (date && selectedIds.size > 0) {
                            batchRescheduleMutation.mutate({
                              deviationIds: Array.from(selectedIds),
                              scheduledAt: date.toISOString(),
                            });
                          }
                        }}
                        label=""
                      />
                    </div>
                    <div className="h-8 w-px bg-border" />
                    <GallerySelector
                      selectedGalleryIds={bulkGalleryIds}
                      onSelect={(galleryIds) => {
                        setBulkGalleryIds(galleryIds);
                        if (selectedIds.size > 0) {
                          batchAssignGalleryMutation.mutate({
                            deviationIds: Array.from(selectedIds),
                            galleryIds,
                          });
                        }
                      }}
                      triggerButton={
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={selectedIds.size === 0}
                          className="h-8"
                        >
                          <Folder className="h-4 w-4 mr-2" />
                          {bulkGalleryIds.length > 0
                            ? `${bulkGalleryIds.length} folder${
                                bulkGalleryIds.length > 1 ? "s" : ""
                              }`
                            : "Assign to Folder"}
                        </Button>
                      }
                    />
                    <Popover open={tagsOpen} onOpenChange={setTagsOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={selectedIds.size === 0}
                          className="h-8"
                        >
                          <TagsIcon className="h-4 w-4 mr-2" />
                          {bulkTags.length > 0
                            ? `${bulkTags.length} tag${
                                bulkTags.length > 1 ? "s" : ""
                              }`
                            : "Add Tags"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-80" align="start">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <Label>Tags</Label>
                            <TagTemplateSelector
                              onSelect={(templateTags) =>
                                setBulkTags(templateTags)
                              }
                            />
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {bulkTags.map((tag, idx) => (
                              <Badge key={idx} variant="secondary">
                                {tag}
                                <button
                                  onClick={() => removeBulkTag(idx)}
                                  className="ml-1 hover:bg-muted rounded-full p-0.5"
                                >
                                  ×
                                </button>
                              </Badge>
                            ))}
                          </div>
                          <Input
                            placeholder="Add tag and press Enter..."
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                addBulkTag(e.currentTarget.value);
                                e.currentTarget.value = "";
                              }
                            }}
                          />
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setTagsOpen(false)}
                            >
                              Cancel
                            </Button>
                            <Button size="sm" onClick={handleBulkAssignTags}>
                              Apply
                            </Button>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                    <Popover
                      open={descriptionOpen}
                      onOpenChange={setDescriptionOpen}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={selectedIds.size === 0}
                          className="h-8"
                        >
                          <FileImage className="h-4 w-4 mr-2" />
                          {bulkDescription
                            ? "Description set"
                            : "Add Description"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-96" align="start">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <Label>Description</Label>
                            <DescriptionTemplateSelector
                              onSelect={(text) => setBulkDescription(text)}
                            />
                          </div>
                          <Textarea
                            value={bulkDescription}
                            onChange={(e) => setBulkDescription(e.target.value)}
                            placeholder="Enter description..."
                            rows={6}
                          />
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setDescriptionOpen(false)}
                            >
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              onClick={handleBulkAssignDescription}
                            >
                              Apply
                            </Button>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="flex items-center gap-2 h-8">
                    {selectedIds.size > 0 && (
                      <>
                        <Button
                          onClick={() => setSelectedIds(new Set())}
                          variant="outline"
                          size="sm"
                          className="h-full"
                        >
                          Clear Selection
                        </Button>
                        <Button
                          onClick={handleBulkCancel}
                          variant="outline"
                          size="sm"
                          className="h-full"
                        >
                          <X className="h-4 w-4 mr-2" />
                          Cancel ({selectedIds.size})
                        </Button>
                        <Button
                          onClick={handleBulkPublishNow}
                          variant="default"
                          size="sm"
                          className="h-full"
                        >
                          <Zap className="h-4 w-4 mr-2" />
                          Publish Now ({selectedIds.size})
                        </Button>
                      </>
                    )}
                    <Button
                      onClick={() => handleBulkReschedule()}
                      disabled={!bulkScheduleDate || selectedIds.size === 0}
                      size="sm"
                      variant="default"
                      className="h-full"
                    >
                      <CalendarIcon className="h-4 w-4 mr-2" />
                      Reschedule{" "}
                      {selectedIds.size > 0 && `(${selectedIds.size})`}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Table */}
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : scheduledDeviations.length === 0 ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center text-muted-foreground">
                    <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium mb-2">
                      No scheduled deviations
                    </p>
                    <p className="text-sm mb-4">
                      Schedule deviations from your drafts to see them here
                    </p>
                    <Button onClick={() => navigate("/draft")}>
                      <Upload className="h-4 w-4 mr-2" />
                      Go to Drafts
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex-1 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">
                          <Checkbox
                            checked={
                              selectedIds.size === scheduledDeviations.length &&
                              scheduledDeviations.length > 0
                            }
                            onCheckedChange={toggleSelectAll}
                          />
                        </TableHead>
                        <TableHead className="w-16">#</TableHead>
                        <TableHead className="w-24">Preview</TableHead>
                        <TableHead>Title</TableHead>
                        <TableHead>Scheduled Time</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {scheduledDeviations.map((deviation, index) => (
                        <ScheduledRow
                          key={deviation.id}
                          deviation={deviation}
                          index={index + 1}
                          isSelected={selectedIds.has(deviation.id)}
                          onSelect={() => toggleSelect(deviation.id)}
                          onView={() => navigate(`/deviations/${deviation.id}`)}
                          onCancel={() =>
                            batchCancelMutation.mutate([deviation.id])
                          }
                          onPublishNow={() => {
                            setSelectedIds(new Set([deviation.id]));
                            setShowPublishNowDialog(true);
                          }}
                          timezone={timezone}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="calendar" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : scheduledDeviations.length === 0 ? (
                <div className="text-center text-muted-foreground p-12">
                  <CalendarIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium mb-2">
                    No scheduled deviations
                  </p>
                  <p className="text-sm mb-4">
                    Schedule deviations from your drafts to see them here
                  </p>
                  <Button onClick={() => navigate("/draft")}>
                    <Upload className="h-4 w-4 mr-2" />
                    Go to Drafts
                  </Button>
                </div>
              ) : (
                <div className="fullcalendar-container">
                  <FullCalendar
                    plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                    initialView="dayGridMonth"
                    headerToolbar={{
                      left: "prev,next today",
                      center: "title",
                      right: "dayGridMonth,timeGridWeek,timeGridDay",
                    }}
                    events={calendarEvents}
                    eventClick={(info: EventClickArg) => {
                      const deviation = info.event.extendedProps
                        .deviation as Deviation;
                      navigate(`/deviations/${deviation.id}`);
                    }}
                    dateClick={(info) => {
                      const clickedDate = new Date(info.dateStr);
                      const hasEvents = scheduledDeviations.some((dev) => {
                        if (!dev.scheduledAt) return false;
                        return (
                          format(new Date(dev.scheduledAt), "yyyy-MM-dd") ===
                          info.dateStr
                        );
                      });

                      if (hasEvents) {
                        setSelectedDate(clickedDate);
                        setSheetOpen(true);
                      }
                    }}
                    height="auto"
                    contentHeight={700}
                    eventTimeFormat={{
                      hour: "2-digit",
                      minute: "2-digit",
                      meridiem: false,
                    }}
                    slotLabelFormat={{
                      hour: "2-digit",
                      minute: "2-digit",
                      meridiem: false,
                    }}
                    displayEventTime={true}
                    displayEventEnd={false}
                    eventDisplay="block"
                    dayMaxEvents={3}
                    moreLinkClick={(info) => {
                      setSelectedDate(info.date);
                      setSheetOpen(true);
                      return "popover";
                    }}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Publish Now Confirmation Dialog */}
      <AlertDialog
        open={showPublishNowDialog}
        onOpenChange={setShowPublishNowDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Publish {selectedIds.size} deviation
              {selectedIds.size > 1 ? "s" : ""} now?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will bypass the schedule and publish immediately. The
              deviations will be uploaded to DeviantArt right away.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmBulkPublishNow}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Publish Now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Calendar Day Sheet - Shows deviations for selected date */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {selectedDate &&
                selectedDate.toLocaleDateString(undefined, {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
            </SheetTitle>
            <SheetDescription>
              {selectedDateDeviations.length} deviation
              {selectedDateDeviations.length > 1 ? "s" : ""} scheduled for this
              day
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-4">
            {selectedDateDeviations.map((deviation) => {
              const scheduledDate = deviation.scheduledAt
                ? new Date(deviation.scheduledAt)
                : null;
              const timeUntil = scheduledDate
                ? getTimeUntil(scheduledDate)
                : null;

              // Status logic: scheduled -> queued (T+1 hour) -> past due (T+1 hour+)
              const now = new Date();
              const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
              const isPastDue = scheduledDate
                ? scheduledDate < oneHourAgo
                : false;
              const isQueued = scheduledDate
                ? scheduledDate < now && scheduledDate >= oneHourAgo
                : false;

              return (
                <div
                  key={deviation.id}
                  className="flex gap-4 p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                >
                  {/* Thumbnail */}
                  {deviation.files &&
                  deviation.files.length > 0 &&
                  deviation.files[0].storageUrl ? (
                    <img
                      src={deviation.files[0].storageUrl}
                      alt={deviation.title}
                      className="w-24 h-24 object-cover rounded flex-shrink-0"
                    />
                  ) : (
                    <div className="w-24 h-24 bg-muted rounded flex items-center justify-center flex-shrink-0">
                      <Upload className="h-12 w-12 text-muted-foreground" />
                    </div>
                  )}

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h4 className="font-medium truncate">
                        {deviation.title}
                      </h4>
                      {isPastDue ? (
                        <Badge
                          variant="destructive"
                          className="text-xs flex-shrink-0"
                        >
                          Past Due
                        </Badge>
                      ) : isQueued ? (
                        <Badge
                          variant="default"
                          className="text-xs flex-shrink-0 bg-blue-500"
                        >
                          Queued
                        </Badge>
                      ) : timeUntil ? (
                        <Badge
                          variant="secondary"
                          className="text-xs flex-shrink-0"
                        >
                          in {timeUntil}
                        </Badge>
                      ) : null}
                    </div>

                    {deviation.tags && deviation.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {deviation.tags.slice(0, 3).map((tag, idx) => (
                          <Badge
                            key={idx}
                            variant="outline"
                            className="text-xs"
                          >
                            {tag}
                          </Badge>
                        ))}
                        {deviation.tags.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{deviation.tags.length - 3}
                          </Badge>
                        )}
                      </div>
                    )}

                    <div className="flex flex-col gap-1 text-sm text-muted-foreground mb-3">
                      <div className="flex items-center gap-2">
                        <Clock className="h-3 w-3" />
                        <span>
                          {scheduledDate &&
                            formatScheduleDateTimeShort(scheduledDate)}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          navigate(`/deviations/${deviation.id}`);
                          setSheetOpen(false);
                        }}
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        View
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          batchCancelMutation.mutate([deviation.id]);
                          setSheetOpen(false);
                        }}
                      >
                        <X className="h-3 w-3 mr-1" />
                        Cancel
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => {
                          setSelectedIds(new Set([deviation.id]));
                          setShowPublishNowDialog(true);
                          setSheetOpen(false);
                        }}
                      >
                        <Zap className="h-3 w-3 mr-1" />
                        Publish Now
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// Scheduled Row Component
function ScheduledRow({
  deviation,
  index,
  isSelected,
  onSelect,
  onView,
  onCancel,
  onPublishNow,
  timezone,
}: {
  deviation: Deviation;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  onView: () => void;
  onCancel: () => void;
  onPublishNow: () => void;
  timezone: string;
}) {
  const scheduledDate = deviation.scheduledAt
    ? new Date(deviation.scheduledAt)
    : null;
  const timeUntil = scheduledDate ? getTimeUntil(scheduledDate) : null;

  // Status logic: scheduled -> queued (T+1 hour) -> past due (T+1 hour+)
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const isPastDue = scheduledDate ? scheduledDate < oneHourAgo : false;
  const isQueued = scheduledDate
    ? scheduledDate < now && scheduledDate >= oneHourAgo
    : false;

  return (
    <TableRow>
      <TableCell>
        <Checkbox checked={isSelected} onCheckedChange={onSelect} />
      </TableCell>
      <TableCell className="text-muted-foreground">{index}</TableCell>
      <TableCell>
        {deviation.files &&
        deviation.files.length > 0 &&
        deviation.files[0].storageUrl ? (
          <img
            src={deviation.files[0].storageUrl}
            alt={deviation.title}
            className="w-20 h-20 object-cover rounded"
          />
        ) : (
          <div className="w-20 h-20 bg-muted rounded flex items-center justify-center">
            <Upload className="h-10 w-10 text-muted-foreground" />
          </div>
        )}
      </TableCell>
      <TableCell>
        <div className="font-medium">{deviation.title}</div>
        {deviation.tags && deviation.tags.length > 0 && (
          <div className="text-xs text-muted-foreground mt-1">
            {deviation.tags.slice(0, 3).join(", ")}
            {deviation.tags.length > 3 && ` +${deviation.tags.length - 3}`}
          </div>
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Clock className="h-3 w-3" />
          <span className="text-sm">
            {scheduledDate && formatScheduleDateTimeShort(scheduledDate)}
          </span>
        </div>
      </TableCell>
      <TableCell>
        {isPastDue ? (
          <Badge variant="destructive" className="text-xs">
            Past Due
          </Badge>
        ) : isQueued ? (
          <Badge className="text-xs bg-blue-500 hover:bg-blue-600">
            Queued
          </Badge>
        ) : timeUntil ? (
          <Badge variant="secondary" className="text-xs">
            in {timeUntil}
          </Badge>
        ) : null}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onView}>
            <Eye className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            <X className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onPublishNow}>
            <Zap className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

// Helper function to calculate time until scheduled date
function getTimeUntil(date: Date): string {
  const now = new Date();
  const diff = date.getTime() - now.getTime();

  if (diff < 0) return "past due";

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} day${days > 1 ? "s" : ""}`;
  if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""}`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? "s" : ""}`;
  return "less than a minute";
}
