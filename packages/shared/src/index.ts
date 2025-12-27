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

// ============================================
// Enums
// ============================================

export const DeviationStatus = {
  REVIEW: "review",
  DRAFT: "draft",
  SCHEDULED: "scheduled",
  UPLOADING: "uploading",
  PUBLISHING: "publishing",
  PUBLISHED: "published",
  FAILED: "failed",
} as const;
export type DeviationStatus =
  (typeof DeviationStatus)[keyof typeof DeviationStatus];

export const UploadMode = {
  SINGLE: "single",
  MULTIPLE: "multiple",
} as const;
export type UploadMode = (typeof UploadMode)[keyof typeof UploadMode];

export const MatureLevel = {
  MODERATE: "moderate",
  STRICT: "strict",
} as const;
export type MatureLevel = (typeof MatureLevel)[keyof typeof MatureLevel];

export const TemplateType = {
  TAG: "tag",
  DESCRIPTION: "description",
  COMMENT: "comment",
} as const;
export type TemplateType = (typeof TemplateType)[keyof typeof TemplateType];

// ============================================
// API Types
// ============================================

export interface User {
  id: string;
  deviantartId: string;
  username: string;
  avatarUrl: string | null;
  email: string | null;
  createdAt: string;
}

export interface Deviation {
  id: string;
  userId: string;
  status: DeviationStatus;
  title: string;
  description: string | null;
  tags: string[];
  categoryPath: string | null;
  galleryIds: string[];
  isMature: boolean;
  matureLevel: MatureLevel | null;
  allowComments: boolean;
  allowFreeDownload: boolean;
  isAiGenerated: boolean;
  noAi: boolean;
  addWatermark: boolean;
  displayResolution: number;
  uploadMode: UploadMode;
  scheduledAt: string | null;
  jitterSeconds: number;
  actualPublishAt: string | null;
  publishedAt: string | null;
  deviationId: string | null;
  deviationUrl: string | null;
  errorMessage: string | null;
  retryCount: number;
  lastRetryAt: string | null;
  files: DeviationFile[];
  createdAt: string;
  updatedAt: string;
}

export interface DeviationFile {
  id: string;
  deviationId: string;
  originalFilename: string;
  storageKey: string;
  storageUrl: string;
  mimeType: string;
  fileSize: number;
  width: number | null;
  height: number | null;
  duration: number | null; // For videos
  sortOrder: number;
  createdAt: string;
}

export interface Gallery {
  folderId: string;
  name: string;
  parentId: string | null;
}

// DeviantArt Gallery Folder (from API)
export interface DeviantArtGalleryFolder {
  folderid: string;
  parent: string | null;
  name: string;
  description: string;
  size?: number;
  thumb?: {
    preview?: {
      src: string;
      height: number;
      width: number;
      transparency: boolean;
    };
    thumbs?: Array<{
      src: string;
      height: number;
      width: number;
      transparency: boolean;
    }>;
  } | null;
  has_subfolders?: boolean;
}

// Frontend-friendly gallery folder type
export interface GalleryFolder {
  id: string;
  parentId: string | null;
  name: string;
  description: string;
  itemCount: number;
  coverImageUrl: string | null;
  hasSubfolders: boolean;
}

export interface UserGallery {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  coverImageUrl: string | null;
  isDefault: boolean;
  itemCount: number;
  items?: GalleryItemWithPost[];
  createdAt: string;
  updatedAt: string;
}

export interface GalleryItem {
  id: string;
  galleryId: string;
  postId: string;
  sortOrder: number;
  addedAt: string;
}

export interface GalleryItemWithPost extends GalleryItem {
  post: Deviation;
}

export interface TagContent {
  tags: string[];
}

export interface DescriptionContent {
  text: string;
  variables?: string[];
}

export interface CommentContent {
  text: string;
  category?: string;
}

export interface Template {
  id: string;
  userId: string;
  type: TemplateType;
  name: string;
  content: TagContent | DescriptionContent | CommentContent;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// API Request/Response Types
// ============================================

export interface CreateDeviationRequest {
  title: string;
  description?: string;
  tags?: string[];
  categoryPath?: string;
  galleryIds?: string[];
  isMature?: boolean;
  matureLevel?: MatureLevel;
  allowComments?: boolean;
  allowFreeDownload?: boolean;
  isAiGenerated?: boolean;
  noAi?: boolean;
  addWatermark?: boolean;
  displayResolution?: number;
  uploadMode?: UploadMode;
}

export interface UpdateDeviationRequest
  extends Partial<CreateDeviationRequest> {
  scheduledAt?: string;
}

export interface ScheduleDeviationRequest {
  scheduledAt: string;
}

export interface PresignedUrlRequest {
  filename: string;
  contentType: string;
  fileSize: number;
}

export interface PresignedUrlResponse {
  uploadUrl: string;
  fileId: string;
  storageKey: string;
}

export interface CreateGalleryRequest {
  folder: string;
  description?: string;
}

// Extends CreateGalleryRequest with all fields optional
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface UpdateGalleryRequest extends Partial<CreateGalleryRequest> {}

export interface AddItemsToGalleryRequest {
  deviationIds: string[];
}

export interface RemoveItemsFromGalleryRequest {
  deviationIds: string[];
}

export interface ReorderGalleryItemsRequest {
  itemIds: string[];
}

export interface ReorderDeviationFilesRequest {
  fileIds: string[];
}

export interface CreateTemplateRequest {
  type: TemplateType;
  name: string;
  content: TagContent | DescriptionContent | CommentContent;
}

export interface UpdateTemplateRequest {
  name?: string;
  content?: TagContent | DescriptionContent | CommentContent;
}

// ============================================
// API Error Response
// ============================================

export interface ApiError {
  error: string;
  message: string;
  upgradeRequired?: boolean;
}

// ============================================
// Utility Functions
// ============================================

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// ============================================
// API Key Types
// ============================================

export interface ApiKey {
  id: string;
  userId: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}

export interface CreateApiKeyRequest {
  name: string;
}

export interface CreateApiKeyResponse {
  id: string;
  name: string;
  key: string; // Only returned once on creation
  keyPrefix: string;
  createdAt: string;
}

// ============================================
// ComfyUI Upload Types
// ============================================

export interface ComfyUIUploadRequest {
  file: File | Blob;
  title?: string;
  description?: string;
  tags?: string[];
  isMature?: boolean;
  matureLevel?: MatureLevel;
  isAiGenerated?: boolean;
}

export interface ComfyUIUploadResponse {
  success: boolean;
  deviationId: string;
  status: "review";
  message: string;
}

// ============================================
// Admin Dashboard Types
// ============================================

export interface AdminUser extends User {
  totalDeviations: number;
  publishedDeviations: number;
  failedDeviations: number;
  lastLoginAt: string | null;
  apiKeyCount: number;
}

export interface AdminUsersResponse {
  users: AdminUser[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AdminStatsResponse {
  totalUsers: number;
  totalDeviations: number;
  recentActivity: {
    newUsersToday: number;
    deviationsPublishedToday: number;
  };
}

// ============================================
// Publisher Module
// ============================================

export * from "./publisher/index.js";

// ============================================
// Storage Module
// ============================================

export * from "./storage/index.js";

// ============================================
// Database Types
// ============================================

// Re-export Prisma types for convenience
export type { PrismaClient } from "@prisma/client";
