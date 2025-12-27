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

import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Calendar, Clock, Send, Save, Trash2, X } from "lucide-react";
import { deviations } from "@/lib/api";
import { formatScheduleDateTime } from "@/lib/timezone";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function EditDeviation() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");

  const { data: deviation, isLoading } = useQuery({
    queryKey: ["deviation", id],
    queryFn: () => deviations.get(id!),
    enabled: !!id,
  });

  useEffect(() => {
    if (deviation) {
      setTitle(deviation.title);
      setDescription(deviation.description || "");
      if (deviation.scheduledAt) {
        const date = new Date(deviation.scheduledAt);
        setScheduleDate(date.toISOString().split("T")[0]);
        setScheduleTime(date.toTimeString().slice(0, 5));
      }
    }
  }, [deviation]);

  const updateDeviation = useMutation({
    mutationFn: () => deviations.update(id!, { title, description }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deviation", id] });
      queryClient.invalidateQueries({ queryKey: ["deviations"] });
      toast({ title: "Saved", description: "Deviation updated successfully." });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update deviation",
        variant: "destructive",
      });
    },
  });

  const scheduleDeviation = useMutation({
    mutationFn: () => {
      const scheduledAt = new Date(
        `${scheduleDate}T${scheduleTime}`
      ).toISOString();
      return deviations.schedule(id!, scheduledAt);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deviation", id] });
      queryClient.invalidateQueries({ queryKey: ["deviations"] });
      setShowScheduleDialog(false);
      toast({
        title: "Scheduled",
        description: "Deviation scheduled successfully.",
      });
      navigate("/schedule");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to schedule deviation",
        variant: "destructive",
      });
    },
  });

  const publishNow = useMutation({
    mutationFn: () => deviations.publishNow(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deviation", id] });
      queryClient.invalidateQueries({ queryKey: ["deviations"] });
      toast({
        title: "Publishing...",
        description: "Your deviation is being published to DeviantArt.",
      });
      navigate("/schedule");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to publish deviation",
        variant: "destructive",
      });
    },
  });

  const cancelScheduled = useMutation({
    mutationFn: () => deviations.cancel(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deviation", id] });
      queryClient.invalidateQueries({ queryKey: ["deviations"] });
      toast({
        title: "Cancelled",
        description: "Scheduled deviation cancelled.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to cancel deviation",
        variant: "destructive",
      });
    },
  });

  const deleteDeviation = useMutation({
    mutationFn: () => deviations.delete(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deviations"] });
      toast({
        title: "Deleted",
        description: "Deviation deleted successfully.",
      });
      navigate("/schedule");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete deviation",
        variant: "destructive",
      });
    },
  });

  const handleSchedule = () => {
    // Set default date/time to 1 hour from now
    const now = new Date();
    now.setHours(now.getHours() + 1);
    setScheduleDate(now.toISOString().split("T")[0]);
    setScheduleTime(now.toTimeString().slice(0, 5));
    setShowScheduleDialog(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" role="status"></div>
      </div>
    );
  }

  if (!deviation) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Deviation not found</p>
      </div>
    );
  }

  const getStatusBadge = () => {
    switch (deviation.status) {
      case "draft":
        return <Badge variant="secondary">Draft</Badge>;
      case "scheduled":
        return <Badge className="bg-blue-500">Scheduled</Badge>;
      case "uploading":
      case "publishing":
        return <Badge className="bg-yellow-500">Publishing</Badge>;
      case "published":
        return <Badge className="bg-green-500">Published</Badge>;
      case "failed":
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="outline">{deviation.status}</Badge>;
    }
  };

  const canEdit =
    deviation.status === "draft" ||
    deviation.status === "scheduled" ||
    deviation.status === "failed";
  const canSchedule =
    deviation.status === "draft" &&
    deviation.files &&
    deviation.files.length > 0;
  const canCancel = deviation.status === "scheduled";
  const canPublish =
    (deviation.status === "draft" || deviation.status === "failed") &&
    deviation.files &&
    deviation.files.length > 0;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/schedule")}
          >
            <X className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Edit Deviation</h1>
            <div className="flex items-center gap-2 mt-1">
              {getStatusBadge()}
              {deviation.scheduledAt && (
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatScheduleDateTime(deviation.scheduledAt)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {/* Deviation Details */}
        <Card>
          <CardHeader>
            <CardTitle>Deviation Details</CardTitle>
            <CardDescription>Update your deviation information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter deviation title"
                maxLength={50}
                disabled={!canEdit}
              />
              <p className="text-xs text-muted-foreground">
                {title.length}/50 characters
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Enter deviation description..."
                className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!canEdit}
              />
            </div>

            {canEdit && (
              <Button
                onClick={() => updateDeviation.mutate()}
                disabled={!title || updateDeviation.isPending}
              >
                <Save className="h-4 w-4 mr-2" />
                {updateDeviation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Files */}
        {deviation.files && deviation.files.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Files</CardTitle>
              <CardDescription>
                Uploaded files for this deviation
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                {deviation.files.map((file) => (
                  <div
                    key={file.id}
                    className="relative aspect-square rounded-lg overflow-hidden border"
                  >
                    <img
                      src={file.storageUrl}
                      alt={file.originalFilename}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Actions</CardTitle>
            <CardDescription>Manage your deviation</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {canSchedule && (
              <Button onClick={handleSchedule} className="w-full" size="lg">
                <Calendar className="h-5 w-5 mr-2" />
                Schedule for Later
              </Button>
            )}

            {canPublish && (
              <Button
                onClick={() => publishNow.mutate()}
                className="w-full"
                size="lg"
                variant="default"
              >
                <Send className="h-5 w-5 mr-2" />
                Publish Now
              </Button>
            )}

            {canCancel && (
              <Button
                onClick={() => cancelScheduled.mutate()}
                className="w-full"
                variant="outline"
              >
                <X className="h-4 w-4 mr-2" />
                Cancel Schedule
              </Button>
            )}

            {deviation.status === "published" && deviation.deviationUrl && (
              <Button asChild className="w-full" variant="outline">
                <a
                  href={deviation.deviationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View on DeviantArt
                </a>
              </Button>
            )}

            {deviation.status === "failed" && deviation.errorMessage && (
              <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-lg">
                <p className="text-sm font-medium text-red-900 dark:text-red-100 mb-1">
                  Error:
                </p>
                <p className="text-sm text-red-700 dark:text-red-300">
                  {deviation.errorMessage}
                </p>
              </div>
            )}

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="w-full">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Deviation
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete your deviation and all
                    associated files. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => deleteDeviation.mutate()}>
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      </div>

      {/* Schedule Dialog */}
      <Dialog open={showScheduleDialog} onOpenChange={setShowScheduleDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule Deviation</DialogTitle>
            <DialogDescription>
              Choose when you want this deviation to be published to DeviantArt
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="schedule-date">Date</Label>
              <Input
                id="schedule-date"
                type="date"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="schedule-time">Time</Label>
              <Input
                id="schedule-time"
                type="time"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
              />
            </div>
            {scheduleDate && scheduleTime && (
              <p className="text-sm text-muted-foreground">
                Will be published on{" "}
                {formatScheduleDateTime(`${scheduleDate}T${scheduleTime}`)}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowScheduleDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => scheduleDeviation.mutate()}
              disabled={
                !scheduleDate || !scheduleTime || scheduleDeviation.isPending
              }
            >
              {scheduleDeviation.isPending
                ? "Scheduling..."
                : "Schedule Deviation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
