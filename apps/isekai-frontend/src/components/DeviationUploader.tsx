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

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DndContext, DragEndEvent, closestCenter } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { Upload, Calendar, Send } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from '@/hooks/use-toast';
import { formatScheduleDateTime } from '@/lib/timezone';
import { FilePreview } from '@/components/FilePreview';
import { deviations, uploads } from '@/lib/api';

interface FileWithPreview {
  id: string;
  file: File;
  preview: string;
  progress?: number;
  error?: string;
}

export function DeviationUploader() {
  const queryClient = useQueryClient();
  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [uploadMode, setUploadMode] = useState<'single' | 'multiple'>('single');
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles = acceptedFiles.map((file) => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      preview: URL.createObjectURL(file),
    }));
    setFiles((prev) => [...prev, ...newFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.bmp'],
      'video/*': ['.mp4', '.webm'],
    },
    maxSize: 30 * 1024 * 1024, // 30MB
  });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setFiles((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const removeFile = (id: string) => {
    setFiles((prev) => {
      const file = prev.find((f) => f.id === id);
      if (file) URL.revokeObjectURL(file.preview);
      return prev.filter((f) => f.id !== id);
    });
  };

  const uploadFiles = async (deviationId: string) => {
    setIsUploading(true);

    for (let i = 0; i < files.length; i++) {
      const fileData = files[i];
      try {
        // Update progress
        setFiles((prev) => prev.map((f) => (f.id === fileData.id ? { ...f, progress: 0 } : f)));

        // Get presigned URL
        const { uploadUrl, fileId, storageKey } = await uploads.getPresignedUrl(
          fileData.file.name,
          fileData.file.type,
          fileData.file.size
        );

        // Upload to storage
        const xhr = new XMLHttpRequest();
        await new Promise((resolve, reject) => {
          xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
              const progress = Math.round((e.loaded / e.total) * 100);
              setFiles((prev) => prev.map((f) => (f.id === fileData.id ? { ...f, progress } : f)));
            }
          });

          xhr.addEventListener('load', () => {
            if (xhr.status === 200) resolve(xhr.response);
            else reject(new Error(`Upload failed: ${xhr.status}`));
          });

          xhr.addEventListener('error', () => reject(new Error('Upload failed')));
          xhr.open('PUT', uploadUrl);
          xhr.setRequestHeader('Content-Type', fileData.file.type);
          xhr.send(fileData.file);
        });

        // Get image/video dimensions
        let width: number | undefined;
        let height: number | undefined;
        let duration: number | undefined;

        if (fileData.file.type.startsWith('image/')) {
          const img = new Image();
          await new Promise((resolve) => {
            img.onload = () => {
              width = img.width;
              height = img.height;
              resolve(null);
            };
            img.src = fileData.preview;
          });
        } else if (fileData.file.type.startsWith('video/')) {
          const video = document.createElement('video');
          await new Promise((resolve) => {
            video.onloadedmetadata = () => {
              width = video.videoWidth;
              height = video.videoHeight;
              duration = Math.round(video.duration);
              resolve(null);
            };
            video.src = fileData.preview;
          });
        }

        // Complete upload
        await uploads.complete(
          fileId,
          deviationId,
          storageKey,
          fileData.file.name,
          fileData.file.type,
          fileData.file.size,
          width,
          height,
          duration
        );

        // Mark as complete
        setFiles((prev) => prev.map((f) => (f.id === fileData.id ? { ...f, progress: 100 } : f)));
      } catch (error: any) {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileData.id ? { ...f, error: error.message, progress: undefined } : f
          )
        );
        throw error;
      }
    }

    setIsUploading(false);
  };

  const createAndSchedule = useMutation({
    mutationFn: async () => {
      // Create deviation
      const deviation = await deviations.create({
        title,
        description,
        uploadMode, // Pass uploadMode to backend
      });

      // Upload files
      await uploadFiles(deviation.id);

      // Schedule if date/time provided
      if (scheduleDate && scheduleTime) {
        const scheduledAt = new Date(`${scheduleDate}T${scheduleTime}`).toISOString();
        await deviations.schedule(deviation.id, scheduledAt);
      }

      return deviation;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deviations'] });
      toast({
        title: 'Success',
        description:
          scheduleDate && scheduleTime
            ? 'Deviation scheduled successfully'
            : 'Draft created successfully',
      });
      // Reset form
      setFiles([]);
      setTitle('');
      setDescription('');
      setScheduleDate('');
      setScheduleTime('');
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create deviation',
        variant: 'destructive',
      });
    },
  });

  const publishNow = useMutation({
    mutationFn: async () => {
      // Create deviation
      const deviation = await deviations.create({
        title,
        description,
        uploadMode, // Pass uploadMode to backend
      });

      // Upload files
      await uploadFiles(deviation.id);

      // Publish immediately
      await deviations.publishNow(deviation.id);

      return deviation;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deviations'] });
      toast({
        title: 'Publishing',
        description: 'Your deviation is being published to DeviantArt',
      });
      // Reset form
      setFiles([]);
      setTitle('');
      setDescription('');
      setScheduleDate('');
      setScheduleTime('');
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to publish deviation',
        variant: 'destructive',
      });
    },
  });

  const canSubmit = files.length > 0 && title.trim().length > 0 && !isUploading;
  const hasScheduleTime = scheduleDate && scheduleTime;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create New Deviation</CardTitle>
        <CardDescription>Upload files and schedule your DeviantArt deviation</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Dropzone */}
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            isDragActive
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/25 hover:border-primary/50'
          }`}
        >
          <input {...getInputProps()} />
          <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          {isDragActive ? (
            <p className="text-lg font-medium">Drop files here...</p>
          ) : (
            <div>
              <p className="text-lg font-medium mb-2">Drag & drop files here</p>
              <p className="text-sm text-muted-foreground mb-2">or click to browse</p>
              <p className="text-xs text-muted-foreground">
                Supports images (PNG, JPG, GIF, BMP) and videos (MP4, WebM) up to 30MB
              </p>
            </div>
          )}
        </div>

        {/* File Previews */}
        {files.length > 0 && (
          <div>
            <Label className="mb-3 block">Files ({files.length})</Label>
            <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={files.map((f) => f.id)} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {files.map((fileData) => (
                    <FilePreview key={fileData.id} fileData={fileData} onRemove={removeFile} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        )}

        {/* Upload Mode */}
        {files.length > 1 && (
          <div className="space-y-2">
            <Label>Upload Mode</Label>
            <RadioGroup
              value={uploadMode}
              onValueChange={(v: string) => setUploadMode(v as 'single' | 'multiple')}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="single" id="single" />
                <Label htmlFor="single" className="font-normal cursor-pointer">
                  Single deviation with multiple images (max 100)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="multiple" id="multiple" />
                <Label htmlFor="multiple" className="font-normal cursor-pointer">
                  Multiple deviations (one per file)
                </Label>
              </div>
            </RadioGroup>
          </div>
        )}

        {/* Title */}
        <div className="space-y-2">
          <Label htmlFor="title">Title *</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter deviation title"
            maxLength={50}
          />
          <p className="text-xs text-muted-foreground">{title.length}/50 characters</p>
        </div>

        {/* Description */}
        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Enter deviation description..."
            className="min-h-[100px]"
          />
        </div>

        {/* Schedule Date/Time */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="schedule-date">Schedule Date (Optional)</Label>
            <Input
              id="schedule-date"
              type="date"
              value={scheduleDate}
              onChange={(e) => setScheduleDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="schedule-time">Schedule Time</Label>
            <Input
              id="schedule-time"
              type="time"
              value={scheduleTime}
              onChange={(e) => setScheduleTime(e.target.value)}
            />
          </div>
        </div>

        {scheduleDate && scheduleTime && (
          <p className="text-sm text-muted-foreground">
            Will be published on {formatScheduleDateTime(`${scheduleDate}T${scheduleTime}`)}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            onClick={() => publishNow.mutate()}
            disabled={!canSubmit || publishNow.isPending}
            className="flex-1"
            size="lg"
          >
            <Send className="h-5 w-5 mr-2" />
            {publishNow.isPending ? 'Publishing...' : 'Publish Now'}
          </Button>
          <Button
            onClick={() => createAndSchedule.mutate()}
            disabled={!canSubmit || createAndSchedule.isPending}
            variant={hasScheduleTime ? 'default' : 'outline'}
            className="flex-1"
            size="lg"
          >
            <Calendar className="h-5 w-5 mr-2" />
            {createAndSchedule.isPending
              ? 'Saving...'
              : hasScheduleTime
                ? 'Schedule'
                : 'Save as Draft'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
