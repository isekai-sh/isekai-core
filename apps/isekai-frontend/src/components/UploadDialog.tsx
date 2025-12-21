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

import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Upload, Check, X, AlertCircle } from "lucide-react";
import { deviations, uploads } from "@/lib/api";
import { toast } from "@/hooks/use-toast";

interface FileWithMetadata {
  id: string;
  file: File;
  preview: string;
  fileId?: string;
  r2Key?: string;
  r2Url?: string;
  uploadProgress?: number;
  error?: string;
}

interface UploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "single" | "multiple";
}

export function UploadDialog({ open, onOpenChange, mode }: UploadDialogProps) {
  const queryClient = useQueryClient();
  const [files, setFiles] = useState<FileWithMetadata[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadComplete, setUploadComplete] = useState(false);
  const [createdDrafts, setCreatedDrafts] = useState<any[]>([]);

  const startUpload = async (filesToUpload: FileWithMetadata[]) => {
    setIsUploading(true);

    try {
      console.log(
        "[Upload] Starting upload with mode:",
        mode,
        "files:",
        filesToUpload.length
      );

      // Upload all files to R2
      for (const fileData of filesToUpload) {
        await uploadFile(fileData);
      }

      // Create draft(s)
      console.log("[Upload] All files uploaded, creating drafts...");
      if (mode === "single") {
        console.log("[Upload] Creating single draft with all files");
        await createSingleDraft(filesToUpload);
      } else {
        console.log("[Upload] Creating multiple drafts (one per file)");
        await createMultipleDrafts(filesToUpload);
      }

      // Refresh the drafts table
      queryClient.invalidateQueries({ queryKey: ["deviations"] });

      // Show success toast
      const draftCount = mode === "single" ? 1 : filesToUpload.length;
      toast({
        title: "Upload complete",
        description: `${draftCount} draft${
          draftCount > 1 ? "s" : ""
        } created successfully`,
      });

      // Auto-close dialog after short delay
      setTimeout(() => {
        handleClose();
      }, 500);
    } catch (error: any) {
      console.error("[Upload] Upload failed:", error);
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload files",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const uploadFile = async (fileData: FileWithMetadata) => {
    try {
      // Update progress
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileData.id ? { ...f, uploadProgress: 0 } : f
        )
      );

      // Get presigned URL
      const { uploadUrl, fileId, r2Key } = await uploads.getPresignedUrl(
        fileData.file.name,
        fileData.file.type,
        fileData.file.size
      );

      // Upload to R2
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            const progress = Math.round((e.loaded / e.total) * 100);
            setFiles((prev) =>
              prev.map((f) =>
                f.id === fileData.id ? { ...f, uploadProgress: progress } : f
              )
            );
          }
        });

        xhr.addEventListener("load", () => {
          if (xhr.status === 200) {
            resolve();
          } else {
            reject(new Error(`Upload failed: ${xhr.status}`));
          }
        });

        xhr.addEventListener("error", () => reject(new Error("Upload failed")));

        xhr.open("PUT", uploadUrl);
        xhr.setRequestHeader("Content-Type", fileData.file.type);
        xhr.send(fileData.file);
      });

      // Get dimensions
      let width: number | undefined;
      let height: number | undefined;
      let duration: number | undefined;

      if (fileData.file.type.startsWith("image/")) {
        const img = new Image();
        await new Promise<void>((resolve) => {
          img.onload = () => {
            width = img.width;
            height = img.height;
            resolve();
          };
          img.src = fileData.preview;
        });
      } else if (fileData.file.type.startsWith("video/")) {
        const video = document.createElement("video");
        await new Promise<void>((resolve) => {
          video.onloadedmetadata = () => {
            width = video.videoWidth;
            height = video.videoHeight;
            duration = Math.round(video.duration);
            resolve();
          };
          video.src = fileData.preview;
        });
      }

      // Store metadata
      fileData.fileId = fileId;
      fileData.r2Key = r2Key;
      fileData.r2Url = `${
        (window as any).ISEKAI_CONFIG?.R2_PUBLIC_URL || "https://storage.isekai.sh"
      }/${r2Key}`;
      fileData.uploadProgress = 100;

      // Store dimensions for later
      (fileData as any).width = width;
      (fileData as any).height = height;
      (fileData as any).duration = duration;

      setFiles((prev) =>
        prev.map((f) => (f.id === fileData.id ? { ...fileData } : f))
      );
    } catch (error: any) {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileData.id
            ? { ...f, error: error.message, uploadProgress: undefined }
            : f
        )
      );
      throw error;
    }
  };

  const createSingleDraft = async (filesToUpload: FileWithMetadata[]) => {
    // Get title from first filename
    const firstFile = filesToUpload[0];
    const title = firstFile.file.name.replace(/\.[^/.]+$/, "");

    // Create deviation
    const draft = await deviations.create({
      title,
      uploadMode: "single",
    });

    // Link all files
    for (let i = 0; i < filesToUpload.length; i++) {
      const fileData = filesToUpload[i];
      await uploads.complete(
        fileData.fileId!,
        draft.id,
        fileData.r2Key!,
        fileData.file.name,
        fileData.file.type,
        fileData.file.size,
        (fileData as any).width,
        (fileData as any).height,
        (fileData as any).duration
      );
    }

    setCreatedDrafts([draft]);
  };

  const createMultipleDrafts = async (filesToUpload: FileWithMetadata[]) => {
    const drafts = [];

    console.log(
      "[Upload] Creating multiple drafts for",
      filesToUpload.length,
      "files"
    );

    for (const fileData of filesToUpload) {
      const title = fileData.file.name.replace(/\.[^/.]+$/, "");

      console.log("[Upload] Creating draft:", title);
      // Create deviation
      const draft = await deviations.create({
        title,
        uploadMode: "multiple",
      });
      console.log("[Upload] Draft created:", draft.id);

      // Link file
      console.log(
        "[Upload] Linking file:",
        fileData.fileId,
        "to draft:",
        draft.id
      );
      await uploads.complete(
        fileData.fileId!,
        draft.id,
        fileData.r2Key!,
        fileData.file.name,
        fileData.file.type,
        fileData.file.size,
        (fileData as any).width,
        (fileData as any).height,
        (fileData as any).duration
      );
      console.log("[Upload] File linked successfully");

      drafts.push(draft);
    }

    console.log("[Upload] All drafts created:", drafts.length);
    setCreatedDrafts(drafts);
  };

  const handleClose = () => {
    queryClient.invalidateQueries({ queryKey: ["deviations"] });
    setFiles([]);
    setUploadComplete(false);
    setCreatedDrafts([]);
    onOpenChange(false);
  };

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      // Filter to only supported extensions
      const allowedExtensions = [
        ".png",
        ".jpg",
        ".jpeg",
        ".gif",
        ".bmp",
        ".webp",
        ".mp4",
        ".webm",
        ".mov",
      ];
      const validFiles = acceptedFiles.filter((file) => {
        const ext = file.name.toLowerCase().match(/\.[^.]*$/)?.[0];
        return ext && allowedExtensions.includes(ext);
      });

      // Skip if no valid files
      if (validFiles.length === 0) return;

      const newFiles = validFiles.map((file) => ({
        id: Math.random().toString(36).substr(2, 9),
        file,
        preview: URL.createObjectURL(file),
      }));
      setFiles(newFiles);

      // Start uploading immediately
      startUpload(newFiles);
    },
    [mode, startUpload]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/*": [".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp"],
      "video/*": [".mp4", ".webm", ".mov"],
    },
    maxSize: 50 * 1024 * 1024, // 50MB
  });

  const totalFiles = files.length;
  const completedFiles = files.filter((f) => f.uploadProgress === 100).length;
  const overallProgress =
    totalFiles > 0 ? (completedFiles / totalFiles) * 100 : 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {uploadComplete
              ? "Upload Complete"
              : isUploading
              ? "Uploading..."
              : "Upload Files"}
          </DialogTitle>
          <DialogDescription>
            {uploadComplete
              ? `${createdDrafts.length} draft${
                  createdDrafts.length > 1 ? "s" : ""
                } created successfully`
              : isUploading
              ? `Uploading ${
                  mode === "single"
                    ? "files for single artwork"
                    : "multiple artworks"
                }...`
              : "Drop your files here to start uploading"}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {!isUploading && !uploadComplete && files.length === 0 && (
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
                isDragActive
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-primary/50"
              }`}
            >
              <input {...getInputProps()} />
              <Upload className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
              {isDragActive ? (
                <p className="text-lg font-medium">Drop files here...</p>
              ) : (
                <div>
                  <p className="text-lg font-medium mb-2">
                    Drag & drop files here
                  </p>
                  <p className="text-sm text-muted-foreground mb-2">
                    or click to browse
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Images (PNG, JPG, GIF, WebP) and Videos (MP4, WebM) up to
                    50MB
                  </p>
                </div>
              )}
            </div>
          )}

          {(isUploading || uploadComplete) && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">
                    {completedFiles} of {totalFiles} files uploaded
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {Math.round(overallProgress)}%
                  </span>
                </div>
                <Progress value={overallProgress} className="h-2" />
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {files.map((fileData) => (
                  <div
                    key={fileData.id}
                    className="flex items-center gap-3 p-3 border rounded-lg"
                  >
                    <img
                      src={fileData.preview}
                      alt={fileData.file.name}
                      className="w-12 h-12 object-cover rounded"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {fileData.file.name}
                      </p>
                      {fileData.uploadProgress !== undefined &&
                        fileData.uploadProgress < 100 && (
                          <Progress
                            value={fileData.uploadProgress}
                            className="h-1 mt-1"
                          />
                        )}
                      {fileData.error && (
                        <p className="text-xs text-red-500 mt-1">
                          {fileData.error}
                        </p>
                      )}
                    </div>
                    {fileData.uploadProgress === 100 && (
                      <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
                    )}
                    {fileData.error && (
                      <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {uploadComplete && (
          <div className="flex justify-end gap-2">
            <Button onClick={handleClose}>
              <Check className="h-4 w-4 mr-2" />
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
