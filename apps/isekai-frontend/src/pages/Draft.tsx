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

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Upload,
  FileImage,
  Calendar,
  Trash2,
  Folder,
  Check,
  Tags,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { deviations } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { UploadModeDialog } from "@/components/UploadModeDialog";
import { UploadDialog } from "@/components/UploadDialog";
import { DraftTableRow } from "@/components/DraftTableRow";
import { GallerySelector } from "@/components/GallerySelector";
import {
  TagTemplateSelector,
  DescriptionTemplateSelector,
} from "@/components/TemplateSelector";
import type { Deviation } from "@isekai/shared";
import { PageWrapper, PageHeader, PageContent } from "@/components/ui/page-wrapper";

export function Draft() {
  const queryClient = useQueryClient();
  const [showModeDialog, setShowModeDialog] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [uploadMode, setUploadMode] = useState<"single" | "multiple">("single");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkScheduleDate, setBulkScheduleDate] = useState<Date | undefined>(
    undefined
  );
  const [bulkGalleryIds, setBulkGalleryIds] = useState<string[]>([]);
  const [bulkTags, setBulkTags] = useState<string[]>([]);
  const [bulkDescription, setBulkDescription] = useState<string>("");
  const [tagsOpen, setTagsOpen] = useState(false);
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Fetch drafts (status = draft)
  const { data, isLoading } = useQuery({
    queryKey: ["deviations", "draft"],
    queryFn: async () => {
      const result = await deviations.list({ status: "draft", limit: 1000 }); // Fetch up to 1000 drafts
      return result;
    },
  });

  const deleteDeviation = useMutation({
    mutationFn: (deviationId: string) => deviations.delete(deviationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deviations"] });
      toast({ title: "Deleted", description: "Draft deleted successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete draft",
        variant: "destructive",
      });
    },
  });

  const batchDeleteMutation = useMutation({
    mutationFn: (deviationIds: string[]) =>
      deviations.batchDelete(deviationIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deviations"] });
      setSelectedIds(new Set());
      toast({
        title: "Deleted",
        description: "Selected drafts deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete drafts",
        variant: "destructive",
      });
    },
  });

  const batchUpdateScheduleDateMutation = useMutation({
    mutationFn: async ({
      deviationIds,
      scheduledAt,
    }: {
      deviationIds: string[];
      scheduledAt: string;
    }) => {
      console.log("batchUpdateScheduleDateMutation executing:", {
        deviationIds,
        scheduledAt,
      });
      // Execute all updates sequentially to ensure they complete
      const results = await Promise.all(
        deviationIds.map((id) => deviations.update(id, { scheduledAt }))
      );
      console.log("batchUpdateScheduleDateMutation results:", results);
      return { deviationIds, scheduledAt, results };
    },
    onMutate: async ({ deviationIds, scheduledAt }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["deviations", "draft"] });

      // Snapshot the previous value
      const previousData = queryClient.getQueryData(["deviations", "draft"]);

      // Optimistically update to the new value
      queryClient.setQueryData(["deviations", "draft"], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          deviations: old.deviations.map((dev: Deviation) =>
            deviationIds.includes(dev.id) ? { ...dev, scheduledAt } : dev
          ),
        };
      });

      // Return a context object with the snapshotted value
      return { previousData };
    },
    onSuccess: (data) => {
      // Update cache with actual server responses
      queryClient.setQueryData(["deviations", "draft"], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          deviations: old.deviations.map((dev: Deviation) => {
            const updated = data.results.find((r: any) => r.id === dev.id);
            return updated ? { ...dev, ...updated } : dev;
          }),
        };
      });
    },
    onError: (error: any, _variables, context) => {
      // Rollback on error
      if (context?.previousData) {
        queryClient.setQueryData(["deviations", "draft"], context.previousData);
      }
      toast({
        title: "Error",
        description: error.message || "Failed to update schedule date",
        variant: "destructive",
      });
    },
  });

  const batchScheduleMutation = useMutation({
    mutationFn: async ({
      deviationIds,
      scheduledAt,
    }: {
      deviationIds: string[];
      scheduledAt: string;
    }) => {
      return await deviations.batchSchedule(deviationIds, scheduledAt);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deviations", "draft"] });
      queryClient.invalidateQueries({ queryKey: ["deviations", "scheduled"] });
      setSelectedIds(new Set());
      setBulkScheduleDate(undefined);
      toast({
        title: "Scheduled",
        description: "Selected drafts scheduled successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to schedule drafts",
        variant: "destructive",
      });
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
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["deviations", "draft"] });

      // Snapshot the previous value
      const previousData = queryClient.getQueryData(["deviations", "draft"]);

      // Optimistically update to the new value
      queryClient.setQueryData(["deviations", "draft"], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          deviations: old.deviations.map((dev: Deviation) =>
            deviationIds.includes(dev.id) ? { ...dev, galleryIds } : dev
          ),
        };
      });

      // Return a context object with the snapshotted value
      return { previousData };
    },
    onSuccess: () => {
      setSelectedIds(new Set());
      setBulkGalleryIds([]);
      toast({
        title: "Updated",
        description: "Gallery folders assigned successfully",
      });
    },
    onError: (error: any, _variables, context) => {
      // Rollback on error
      if (context?.previousData) {
        queryClient.setQueryData(["deviations", "draft"], context.previousData);
      }
      toast({
        title: "Error",
        description: error.message || "Failed to assign gallery folders",
        variant: "destructive",
      });
    },
    onSettled: () => {
      // Always refetch after error or success to ensure consistency
      queryClient.invalidateQueries({ queryKey: ["deviations", "draft"] });
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
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["deviations", "draft"] });

      // Snapshot the previous value
      const previousData = queryClient.getQueryData(["deviations", "draft"]);

      // Optimistically update to the new value
      queryClient.setQueryData(["deviations", "draft"], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          deviations: old.deviations.map((dev: Deviation) =>
            deviationIds.includes(dev.id) ? { ...dev, description } : dev
          ),
        };
      });

      // Return a context object with the snapshotted value
      return { previousData };
    },
    onSuccess: () => {
      setSelectedIds(new Set());
      setBulkDescription("");
      setDescriptionOpen(false);
      toast({
        title: "Updated",
        description: "Description assigned successfully",
      });
    },
    onError: (error: any, _variables, context) => {
      // Rollback on error
      if (context?.previousData) {
        queryClient.setQueryData(["deviations", "draft"], context.previousData);
      }
      toast({
        title: "Error",
        description: error.message || "Failed to assign description",
        variant: "destructive",
      });
    },
    onSettled: () => {
      // Always refetch after error or success to ensure consistency
      queryClient.invalidateQueries({ queryKey: ["deviations", "draft"] });
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
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["deviations", "draft"] });

      // Snapshot the previous value
      const previousData = queryClient.getQueryData(["deviations", "draft"]);

      // Optimistically update to the new value
      queryClient.setQueryData(["deviations", "draft"], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          deviations: old.deviations.map((dev: Deviation) =>
            deviationIds.includes(dev.id) ? { ...dev, tags } : dev
          ),
        };
      });

      // Return a context object with the snapshotted value
      return { previousData };
    },
    onSuccess: () => {
      setSelectedIds(new Set());
      setBulkTags([]);
      setTagsOpen(false);
      toast({ title: "Updated", description: "Tags assigned successfully" });
    },
    onError: (error: any, _variables, context) => {
      // Rollback on error
      if (context?.previousData) {
        queryClient.setQueryData(["deviations", "draft"], context.previousData);
      }
      toast({
        title: "Error",
        description: error.message || "Failed to assign tags",
        variant: "destructive",
      });
    },
    onSettled: () => {
      // Always refetch after error or success to ensure consistency
      queryClient.invalidateQueries({ queryKey: ["deviations", "draft"] });
    },
  });

  const drafts = data?.deviations || [];

  const toggleSelectAll = () => {
    if (selectedIds.size === drafts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(drafts.map((d) => d.id)));
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

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    setShowDeleteDialog(true);
  };

  const confirmBulkDelete = () => {
    batchDeleteMutation.mutate(Array.from(selectedIds));
    setShowDeleteDialog(false);
  };

  const handleBulkSchedule = (date?: Date) => {
    const scheduleDate = date || bulkScheduleDate;
    if (selectedIds.size === 0 || !scheduleDate) return;
    batchScheduleMutation.mutate({
      deviationIds: Array.from(selectedIds),
      scheduledAt: scheduleDate.toISOString(),
    });
  };

  const handleBulkAssignGallery = () => {
    if (selectedIds.size === 0 || bulkGalleryIds.length === 0) return;
    batchAssignGalleryMutation.mutate({
      deviationIds: Array.from(selectedIds),
      galleryIds: bulkGalleryIds,
    });
  };

  const handleBulkAssignTags = () => {
    if (selectedIds.size === 0 || bulkTags.length === 0) return;
    batchAssignTagsMutation.mutate({
      deviationIds: Array.from(selectedIds),
      tags: bulkTags,
    });
  };

  const handleBulkClearTags = () => {
    if (selectedIds.size === 0) return;
    batchAssignTagsMutation.mutate({
      deviationIds: Array.from(selectedIds),
      tags: [],
    });
  };

  const addBulkTag = (tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !bulkTags.includes(trimmed)) {
      setBulkTags([...bulkTags, trimmed]);
    }
  };

  const removeBulkTag = (index: number) => {
    const newTags = bulkTags.filter((_, i) => i !== index);
    setBulkTags(newTags);
  };

  const handleBulkAssignDescription = () => {
    if (selectedIds.size === 0) return;
    batchAssignDescriptionMutation.mutate({
      deviationIds: Array.from(selectedIds),
      description: bulkDescription,
    });
  };

  const handleModeSelected = (mode: "single" | "multiple") => {
    setUploadMode(mode);
    setShowModeDialog(false);
    setShowUploadDialog(true);
  };

  return (
    <PageWrapper className="gap-4 md:gap-6">
      <PageHeader>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Draft</h1>
            <p className="text-muted-foreground mt-1">
              Manage your deviation drafts ({drafts.length})
            </p>
          </div>
          <Button onClick={() => setShowModeDialog(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Upload Media
          </Button>
        </div>
      </PageHeader>

      <PageContent>
        <Card className="flex-1 flex flex-col h-full">
        <CardContent className="pt-6 flex-1 flex flex-col h-full">
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
                      console.log("DateTimePicker setDate called:", {
                        date,
                        iso: date?.toISOString(),
                        selectedCount: selectedIds.size,
                      });
                      setBulkScheduleDate(date);
                      if (date && selectedIds.size > 0) {
                        batchUpdateScheduleDateMutation.mutate({
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
                      <Tags className="h-4 w-4 mr-2" />
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
                          onSelect={(templateTags) => setBulkTags(templateTags)}
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
                      <div className="flex justify-between gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleBulkClearTags}
                          disabled={selectedIds.size === 0}
                        >
                          Clear Tags
                        </Button>
                        <div className="flex gap-2">
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
                      {bulkDescription ? "Description set" : "Add Description"}
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
                        <Button size="sm" onClick={handleBulkAssignDescription}>
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
                      onClick={handleBulkDelete}
                      variant="outline"
                      size="sm"
                      className="h-full"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete ({selectedIds.size})
                    </Button>
                  </>
                )}
                <Button
                  onClick={() => handleBulkSchedule()}
                  disabled={!bulkScheduleDate || selectedIds.size === 0}
                  size="sm"
                  variant="default"
                  className="h-full"
                >
                  <Calendar className="h-4 w-4 mr-2" />
                  Schedule {selectedIds.size > 0 && `(${selectedIds.size})`}
                </Button>
              </div>
            </div>
          </div>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : drafts.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <FileImage className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium mb-2">No drafts yet</p>
                <p className="text-sm mb-4">
                  Upload your first deviation to get started
                </p>
                <Button onClick={() => setShowModeDialog(true)}>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Media
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
                          selectedIds.size === drafts.length &&
                          drafts.length > 0
                        }
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead className="w-16">#</TableHead>
                    <TableHead className="w-24">Preview</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Tags</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Folders</TableHead>
                    <TableHead>Schedule Date & Time</TableHead>
                    <TableHead className="w-24">Sta.sh Only</TableHead>
                    <TableHead className="w-32">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drafts.map((draft, index) => (
                    <DraftTableRow
                      key={draft.id}
                      draft={draft}
                      index={index + 1}
                      isSelected={selectedIds.has(draft.id)}
                      onSelect={() => toggleSelect(draft.id)}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      </PageContent>

      <UploadModeDialog
        open={showModeDialog}
        onOpenChange={setShowModeDialog}
        onModeSelected={handleModeSelected}
      />

      <UploadDialog
        open={showUploadDialog}
        onOpenChange={setShowUploadDialog}
        mode={uploadMode}
      />

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectedIds.size} draft{selectedIds.size > 1 ? "s" : ""}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              selected draft{selectedIds.size > 1 ? "s" : ""} and remove the
              associated files from storage.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmBulkDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageWrapper>
  );
}
