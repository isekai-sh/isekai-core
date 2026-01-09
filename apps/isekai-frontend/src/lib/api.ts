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

import type {
  User,
  Deviation,
  Gallery,
  UserGallery,
  DeviantArtGalleryFolder,
  CreateGalleryRequest,
  UpdateGalleryRequest,
  AddItemsToGalleryRequest,
  RemoveItemsFromGalleryRequest,
  ReorderGalleryItemsRequest,
  Template,
  TemplateType,
  CreateTemplateRequest,
  UpdateTemplateRequest,
  ApiKey,
  CreateApiKeyRequest,
  CreateApiKeyResponse,
} from '@isekai/shared';

// Runtime-only configuration - NO build-time environment variables
// This ensures the same built image works across all environments
const API_URL = (window as any).ISEKAI_CONFIG?.API_URL || '/api';

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public upgradeRequired?: boolean
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Retry configuration
 */
interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  shouldRetry: (error: any, attempt: number) => boolean;
}

const defaultRetryConfig: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000, // 1 second
  maxDelayMs: 10000, // 10 seconds
  shouldRetry: (error: any, attempt: number) => {
    // Retry on network errors
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return true;
    }

    // Retry on specific HTTP status codes
    if (error instanceof ApiError) {
      const status = error.status;
      // Retry on 429 (rate limit), 5xx (server errors), and 408 (timeout)
      if (status === 429 || status === 408 || (status >= 500 && status < 600)) {
        return true;
      }
    }

    return false;
  },
};

/**
 * Calculate exponential backoff delay
 */
function calculateBackoffDelay(attempt: number, config: RetryConfig): number {
  const exponentialDelay = config.initialDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * 0.3 * exponentialDelay; // Add 0-30% jitter
  return Math.min(exponentialDelay + jitter, config.maxDelayMs);
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Core request function without retry logic
 */
async function requestCore<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new ApiError(response.status, error.message || 'Request failed', error.upgradeRequired);
  }

  // Handle 204 No Content responses
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

/**
 * Request with automatic retry on transient errors
 * Automatically retries GET requests, opt-in for mutations
 */
async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const method = options.method?.toUpperCase() || 'GET';

  // Always enable retry for GET requests (idempotent)
  // For mutations, only retry if explicitly enabled via x-retry-enabled header
  const shouldEnableRetry = method === 'GET' || options.headers?.['x-retry-enabled'] === 'true';

  if (!shouldEnableRetry) {
    return requestCore<T>(endpoint, options);
  }

  // Clean up custom header
  if ((options.headers as any)?.['x-retry-enabled']) {
    const { 'x-retry-enabled': _, ...restHeaders } = options.headers as any;
    options.headers = restHeaders;
  }

  // Implement retry logic
  let lastError: any;
  const config = defaultRetryConfig;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await requestCore<T>(endpoint, options);
    } catch (error) {
      lastError = error;

      // Don't retry if we've exhausted attempts
      if (attempt === config.maxRetries) {
        break;
      }

      // Check if we should retry this error
      if (!config.shouldRetry(error, attempt)) {
        throw error;
      }

      // Calculate backoff delay
      const delayMs = calculateBackoffDelay(attempt, config);
      console.log(
        `[API Retry] Attempt ${attempt + 1}/${
          config.maxRetries
        } failed. Retrying in ${Math.round(delayMs)}ms...`,
        error instanceof ApiError ? `Status: ${error.status}` : error.message
      );

      await sleep(delayMs);
    }
  }

  // All retries exhausted
  throw lastError;
}

// Auth
export const auth = {
  getMe: () => request<User>('/auth/me'),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  getDeviantArtAuthUrl: () => `${API_URL}/auth/deviantart`,
};

// Deviations
export const deviations = {
  list: (params?: { status?: string; page?: number; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set('status', params.status);
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    const query = searchParams.toString();
    return request<{ deviations: Deviation[]; total: number }>(
      `/deviations${query ? `?${query}` : ''}`
    );
  },
  get: (id: string) => request<Deviation>(`/deviations/${id}`),
  create: (data: Partial<Deviation>) =>
    request<Deviation>('/deviations', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<Deviation>) =>
    request<Deviation>(`/deviations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  delete: (id: string) => request<void>(`/deviations/${id}`, { method: 'DELETE' }),
  schedule: (id: string, scheduledAt: string) =>
    request<Deviation>(`/deviations/${id}/schedule`, {
      method: 'POST',
      body: JSON.stringify({ scheduledAt }),
    }),
  publishNow: (id: string) =>
    request<Deviation>(`/deviations/${id}/publish-now`, { method: 'POST' }),
  cancel: (id: string) => request<Deviation>(`/deviations/${id}/cancel`, { method: 'POST' }),
  reorderFiles: (id: string, fileIds: string[]) =>
    request<{ success: boolean }>(`/deviations/${id}/files/reorder`, {
      method: 'PATCH',
      body: JSON.stringify({ fileIds }),
    }),
  batchDelete: (deviationIds: string[]) =>
    request<{ success: boolean; deletedCount: number }>('/deviations/batch-delete', {
      method: 'POST',
      body: JSON.stringify({ deviationIds }),
    }),
  batchSchedule: (deviationIds: string[], scheduledAt: string) =>
    request<{ deviations: Deviation[] }>('/deviations/batch-schedule', {
      method: 'POST',
      body: JSON.stringify({ deviationIds, scheduledAt }),
    }),
  batchReschedule: (deviationIds: string[], scheduledAt: string) =>
    request<{ deviations: Deviation[] }>('/deviations/batch-reschedule', {
      method: 'POST',
      body: JSON.stringify({ deviationIds, scheduledAt }),
    }),
  batchCancel: (deviationIds: string[]) =>
    request<{ deviations: Deviation[] }>('/deviations/batch-cancel', {
      method: 'POST',
      body: JSON.stringify({ deviationIds }),
    }),
  batchPublishNow: (deviationIds: string[]) =>
    request<{ deviations: Deviation[] }>('/deviations/batch-publish-now', {
      method: 'POST',
      body: JSON.stringify({ deviationIds }),
    }),
};

// Uploads
export const uploads = {
  getPresignedUrl: (filename: string, contentType: string, fileSize: number) =>
    request<{ uploadUrl: string; fileId: string; storageKey: string }>('/uploads/presigned', {
      method: 'POST',
      body: JSON.stringify({ filename, contentType, fileSize }),
    }),
  complete: (
    fileId: string,
    deviationId: string,
    storageKey: string,
    originalFilename: string,
    mimeType: string,
    fileSize: number,
    width?: number,
    height?: number,
    duration?: number
  ) =>
    request<void>('/uploads/complete', {
      method: 'POST',
      body: JSON.stringify({
        fileId,
        deviationId,
        storageKey,
        originalFilename,
        mimeType,
        fileSize,
        width,
        height,
        duration,
      }),
    }),
  delete: (fileId: string) => request<void>(`/uploads/${fileId}`, { method: 'DELETE' }),
  batchDelete: (fileIds: string[]) =>
    request<{ success: boolean; deletedCount: number }>('/uploads/batch-delete', {
      method: 'POST',
      body: JSON.stringify({ fileIds }),
    }),
};

// DeviantArt
export const deviantart = {
  getGalleries: () => request<{ galleries: Gallery[] }>('/deviantart/galleries'),
  getCategories: () =>
    request<{ categories: { path: string; name: string }[] }>('/deviantart/categories'),
};

// Browse types
// Only modes that exist in DeviantArt API v1.20240701
export type BrowseMode =
  | 'home'
  | 'daily'
  | 'following'
  | 'tags'
  | 'topic'
  | 'user-gallery'
  | 'keyword-search';

export interface BrowseDeviation {
  deviationId: string;
  title: string;
  url: string;
  thumbUrl: string | null;
  previewUrl: string | null;
  author: {
    username: string;
    avatarUrl: string;
    userId: string;
  };
  stats: {
    favourites: number;
    comments: number;
  };
  publishedTime: string;
  isDownloadable: boolean;
  isMature: boolean;
  category: string | null;
  // Premium/Exclusive content fields
  tierAccess: 'locked' | 'unlocked' | 'locked-subscribed' | null;
  isExclusive: boolean;
  isPremium: boolean;
  printId: string | null;
}

export interface BrowseParams {
  offset?: number;
  limit?: number;
  tag?: string; // for tags mode
  date?: string; // for daily mode (yyyy-mm-dd)
  topic?: string; // for topic mode
  username?: string; // for user-gallery and keyword-search modes
  keywords?: string; // for keyword-search mode
  mature_content?: boolean;
}

export interface BrowseResponse {
  deviations: BrowseDeviation[];
  hasMore: boolean;
  nextOffset: number;
  estimatedTotal?: number;
  // Cache indicator fields (when serving cached data on rate limit)
  fromCache?: boolean;
  cachedAt?: string;
}

export interface TopicItem {
  name: string;
  canonicalName: string;
  exampleDeviations: BrowseDeviation[];
}

export interface TopTopicItem {
  name: string;
  canonicalName: string;
  exampleDeviation: BrowseDeviation | null;
}

export interface MoreLikeThisResponse {
  deviations: BrowseDeviation[];
  seed: BrowseDeviation | null;
  author: {
    username: string;
    avatarUrl: string;
  } | null;
}

export interface DeviationDetail {
  deviationId: string;
  title: string;
  url: string;
  thumbUrl: string | null;
  previewUrl: string | null;
  fullImageUrl: string | null;
  author: {
    username: string;
    avatarUrl: string;
    userId: string;
    isWatched?: boolean;
  };
  description: string | null;
  tags: string[];
  category: string | null;
  stats: {
    favourites: number;
    comments: number;
    views: number;
    downloads: number;
  };
  publishedTime: string;
  isDownloadable: boolean;
  isMature: boolean;
  matureLevel: string | null;
  downloadUrl: string | null;
  downloadFilesize: number | null;
}

export interface TrendingTag {
  name: string;
  count?: number;
}

// Galleries
export const galleries = {
  list: (offset = 0, limit = 24) =>
    request<{
      galleries: DeviantArtGalleryFolder[];
      hasMore: boolean;
      nextOffset: number;
    }>(`/galleries/all?offset=${offset}&limit=${limit}&calculate_size=true&ext_preload=true`),
  listAll: async function () {
    let allGalleries: DeviantArtGalleryFolder[] = [];
    let hasMore = true;
    let offset = 0;
    const limit = 50; // Max limit for the API endpoint

    while (hasMore) {
      try {
        const response = await this.list(offset, limit);
        if (response.galleries) {
          allGalleries = allGalleries.concat(response.galleries);
        }
        hasMore = response.hasMore;
        offset = response.nextOffset;
      } catch (error) {
        console.error('Error fetching a page of galleries, stopping pagination.', error);
        hasMore = false; // Stop on error
      }
    }

    return allGalleries;
  },
  get: (id: string, params?: { limit?: number; offset?: number }) => {
    const searchParams = new URLSearchParams();
    searchParams.set('mature_content', 'true');
    searchParams.set('limit', String(params?.limit || 50));
    searchParams.set('offset', String(params?.offset || 0));
    const query = searchParams.toString();
    return request<{ results: any[]; hasMore: boolean; nextOffset: number }>(
      `/galleries/${id}?${query}`
    );
  },
  create: (data: CreateGalleryRequest) =>
    request<DeviantArtGalleryFolder>('/galleries/folders/create', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: UpdateGalleryRequest) =>
    request<DeviantArtGalleryFolder>(`/galleries/folders/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  delete: (id: string) => request<void>(`/galleries/folders/${id}`, { method: 'DELETE' }),
  addItems: (target_folderid: string, deviationids: string[]) =>
    request<{ success: boolean }>('/galleries/folders/copy-deviations', {
      method: 'POST',
      body: JSON.stringify({ target_folderid, deviationids }),
    }),
  removeItems: (folderId: string, deviationids: string[]) =>
    request<void>(`/galleries/folders/${folderId}/deviations`, {
      method: 'DELETE',
      body: JSON.stringify({ deviationids }),
    }),
  reorder: (folderId: string, deviationids: string[]) =>
    request<{ success: boolean }>(`/galleries/folders/${folderId}/deviation-order`, {
      method: 'PATCH',
      body: JSON.stringify({ deviationids }),
    }),
  reorderFolders: (folderids: string[]) =>
    request<{ success: boolean }>('/galleries/folders/order', {
      method: 'PATCH',
      body: JSON.stringify({ folderids }),
    }),
};

// Browse API
export const browse = {
  get: (mode: BrowseMode, params: BrowseParams = {}) => {
    const searchParams = new URLSearchParams();
    if (params.offset !== undefined) searchParams.set('offset', String(params.offset));
    if (params.limit) searchParams.set('limit', String(params.limit));
    if (params.tag) searchParams.set('tag', params.tag);
    if (params.date) searchParams.set('date', params.date);
    if (params.topic) searchParams.set('topic', params.topic);
    if (params.username) searchParams.set('username', params.username);
    if (params.keywords) searchParams.set('keywords', params.keywords);
    if (params.mature_content) searchParams.set('mature_content', 'true');
    const query = searchParams.toString();
    return request<BrowseResponse>(`/browse/${mode}${query ? `?${query}` : ''}`);
  },

  searchTags: (tagName: string) =>
    request<{ tags: string[] }>(`/browse/tags/search?tag_name=${encodeURIComponent(tagName)}`),

  moreLikeThis: (deviationId: string) =>
    request<MoreLikeThisResponse>(`/browse/morelikethis/${deviationId}`),

  topics: () => request<{ topics: TopicItem[]; hasMore: boolean }>('/browse/topics/list'),

  topTopics: () => request<{ topics: TopTopicItem[] }>('/browse/toptopics'),

  getDeviation: (deviationId: string) =>
    request<DeviationDetail>(`/browse/deviation/${deviationId}`),

  trendingTags: () => request<{ tags: TrendingTag[] }>('/browse/trendingtags'),
};

// Templates API
export const templates = {
  list: (type?: TemplateType) => {
    const query = type ? `?type=${type}` : '';
    return request<{ templates: Template[] }>(`/templates${query}`);
  },
  get: (id: string) => request<Template>(`/templates/${id}`),
  create: (data: CreateTemplateRequest) =>
    request<Template>('/templates', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: UpdateTemplateRequest) =>
    request<Template>(`/templates/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  delete: (id: string) => request<void>(`/templates/${id}`, { method: 'DELETE' }),
};

// API Keys API
export const apiKeys = {
  list: () => request<{ apiKeys: ApiKey[] }>('/api-keys'),
  create: (data: CreateApiKeyRequest) =>
    request<CreateApiKeyResponse>('/api-keys', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  revoke: (id: string) => request<void>(`/api-keys/${id}`, { method: 'DELETE' }),
  delete: (id: string) => request<void>(`/api-keys/${id}/permanent`, { method: 'DELETE' }),
};

// Review API
export const review = {
  list: (params?: { page?: number; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    const query = searchParams.toString();
    return request<{ deviations: Deviation[]; total: number }>(
      `/review${query ? `?${query}` : ''}`
    );
  },
  approve: (id: string) => request<Deviation>(`/review/${id}/approve`, { method: 'POST' }),
  reject: (id: string) => request<void>(`/review/${id}/reject`, { method: 'POST' }),
  batchApprove: (deviationIds: string[]) =>
    request<{ success: boolean; approvedCount: number }>('/review/batch-approve', {
      method: 'POST',
      body: JSON.stringify({ deviationIds }),
    }),
  batchReject: (deviationIds: string[]) =>
    request<{ success: boolean; rejectedCount: number }>('/review/batch-reject', {
      method: 'POST',
      body: JSON.stringify({ deviationIds }),
    }),
};

// Price Presets API
export interface PricePreset {
  id: string;
  userId: string;
  name: string;
  price: number; // in cents - used for fixed pricing
  minPrice?: number | null; // minimum for random range (in cents)
  maxPrice?: number | null; // maximum for random range (in cents)
  currency: string;
  description?: string;
  isDefault: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePricePresetRequest {
  name: string;
  price?: number; // fixed price (optional if using range)
  minPrice?: number; // min for random range
  maxPrice?: number; // max for random range
  currency?: string;
  description?: string;
  isDefault?: boolean;
  sortOrder?: number;
}

export const pricePresets = {
  list: () => request<{ presets: PricePreset[] }>('/price-presets'),
  get: (id: string) => request<PricePreset>(`/price-presets/${id}`),
  create: (data: CreatePricePresetRequest) =>
    request<PricePreset>('/price-presets', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<CreatePricePresetRequest>) =>
    request<PricePreset>(`/price-presets/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  delete: (id: string) => request<void>(`/price-presets/${id}`, { method: 'DELETE' }),
};

// Sale Queue API
export interface SaleQueueItem {
  id: string;
  userId: string;
  deviationId: string;
  pricePresetId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';
  attempts: number;
  lastAttemptAt?: string;
  completedAt?: string;
  errorMessage?: string;
  errorDetails?: any;
  screenshotKey?: string;
  createdAt: string;
  updatedAt: string;
  deviation: {
    id: string;
    title: string;
    deviationUrl?: string;
    publishedAt?: string;
  };
  pricePreset: {
    id: string;
    name: string;
    price: number;
    currency: string;
  };
}

export interface AddToSaleQueueRequest {
  deviationIds: string[];
  pricePresetId: string;
}

export const saleQueue = {
  list: (params?: { status?: string; page?: number; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set('status', params.status);
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    const query = searchParams.toString();
    return request<{
      items: SaleQueueItem[];
      total: number;
      page: number;
      limit: number;
    }>(`/sale-queue${query ? `?${query}` : ''}`);
  },
  addToQueue: (data: AddToSaleQueueRequest) =>
    request<{ created: number; skipped: number; message: string }>('/sale-queue', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  remove: (id: string) => request<void>(`/sale-queue/${id}`, { method: 'DELETE' }),
  getNext: (clientId: string) =>
    request<{ item: SaleQueueItem | null; message: string }>(
      `/sale-queue/next?clientId=${clientId}`
    ),
  complete: (id: string) =>
    request<SaleQueueItem>(`/sale-queue/${id}/complete`, { method: 'POST' }),
  fail: (id: string, errorMessage: string, errorDetails?: any, screenshotKey?: string) =>
    request<{ item: SaleQueueItem; willRetry: boolean }>(`/sale-queue/${id}/fail`, {
      method: 'POST',
      body: JSON.stringify({ errorMessage, errorDetails, screenshotKey }),
    }),
};

// Automation Workflows
export const automations = {
  list: () => request<{ automations: any[] }>('/automations'),
  get: (id: string) => request<{ automation: any }>(`/automations/${id}`),
  create: (data: any) =>
    request<{ automation: any }>('/automations', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: any) =>
    request<{ automation: any }>(`/automations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  delete: (id: string) => request<void>(`/automations/${id}`, { method: 'DELETE' }),
  toggle: (id: string) =>
    request<{ automation: any }>(`/automations/${id}/toggle`, {
      method: 'POST',
    }),
  reorder: (automationIds: string[]) =>
    request<{ success: boolean }>('/automations/reorder', {
      method: 'PATCH',
      body: JSON.stringify({ automationIds }),
    }),
  getLogs: (id: string, params?: { page?: number; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    const query = searchParams.toString();
    return request<{ logs: any[]; pagination: any }>(
      `/automations/${id}/logs${query ? `?${query}` : ''}`
    );
  },
  test: (id: string) =>
    request<{ message: string; config: any }>(`/automations/${id}/test`, {
      method: 'POST',
    }),
};

export const automationScheduleRules = {
  list: (automationId: string) => {
    const searchParams = new URLSearchParams();
    searchParams.set('automationId', automationId);
    return request<{ rules: any[] }>(`/automation-schedule-rules?${searchParams.toString()}`);
  },
  create: (automationId: string, data: any) =>
    request<{ rule: any }>('/automation-schedule-rules', {
      method: 'POST',
      body: JSON.stringify({ ...data, automationId }),
    }),
  update: (id: string, data: any) =>
    request<{ rule: any }>(`/automation-schedule-rules/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  delete: (id: string) => request<void>(`/automation-schedule-rules/${id}`, { method: 'DELETE' }),
};

export const automationDefaultValues = {
  list: (automationId: string) => {
    const searchParams = new URLSearchParams();
    searchParams.set('automationId', automationId);
    return request<{ values: any[] }>(`/automation-default-values?${searchParams.toString()}`);
  },
  create: (automationId: string, data: any) =>
    request<{ value: any }>('/automation-default-values', {
      method: 'POST',
      body: JSON.stringify({ ...data, automationId }),
    }),
  update: (id: string, data: any) =>
    request<{ value: any }>(`/automation-default-values/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  delete: (id: string) => request<void>(`/automation-default-values/${id}`, { method: 'DELETE' }),
};

// Admin API
export interface InstanceUser {
  id: string;
  daUserId: string;
  daUsername: string;
  daAvatar: string | null;
  role: 'admin' | 'member';
  createdAt: string;
  lastLoginAt: string | null;
}

export interface InstanceInfo {
  instanceId: string | null;
  tier: 'pro' | 'agency' | 'self-hosted';
  limits: {
    maxDaAccounts: number;
    currentDaAccounts: number;
    unlimited: boolean;
  };
  stats: {
    teamMembers: number;
    deviations: number;
    storageUsedBytes: number;
  };
  settings: {
    teamInvitesEnabled: boolean;
    whitelabelEnabled: boolean;
  };
}

export interface InstanceSettings {
  teamInvitesEnabled: boolean;
}

export const admin = {
  getTeam: () => request<{ users: InstanceUser[] }>('/admin/team'),
  removeTeamMember: (id: string) =>
    request<{
      success: boolean;
      message: string;
      cleanup: { jobsCancelled: number; filesQueued: number; cacheKeysDeleted: number } | null;
    }>(`/admin/team/${id}`, { method: 'DELETE' }),
  getInstance: () => request<InstanceInfo>('/admin/instance'),
  getSettings: () => request<InstanceSettings>('/admin/settings'),
  updateSettings: (data: Partial<InstanceSettings>) =>
    request<InstanceSettings>('/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
};

// Config API (public)
export interface WhitelabelConfig {
  enabled: boolean;
  productName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  footerText: string | null;
  supportEmail: string | null;
}

export interface LimitsConfig {
  maxAccounts: number;
  currentAccounts: number;
  unlimited: boolean;
  teamInvitesEnabled: boolean;
}

export const config = {
  getWhitelabel: () => request<WhitelabelConfig>('/config/whitelabel'),
  getLimits: () => request<LimitsConfig>('/config/limits'),
  getInstance: () => request<{ tier: string; productName: string }>('/config/instance'),
};

export { ApiError };
