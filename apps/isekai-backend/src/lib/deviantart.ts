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

import { prisma } from "../db/index.js";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import type { User, Deviation, DeviationFile } from "../db/index.js";
import type { UploadMode } from "@isekai/shared";
import { getS3Client, getStorageConfig } from "@isekai/shared/storage";
import { logger } from "./logger.js";
import { env } from "./env.js";

const DEVIANTART_TOKEN_URL = "https://www.deviantart.com/oauth2/token";
const DEVIANTART_API_URL = "https://www.deviantart.com/api/v1/oauth2";

// Get S3 client and config from shared storage module
const s3Client = getS3Client();
const storageConfig = getStorageConfig();

export async function refreshTokenIfNeeded(user: User): Promise<string> {
  const now = new Date();
  const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);

  // Check if refresh token itself is expired
  if (user.refreshTokenExpiresAt && user.refreshTokenExpiresAt <= now) {
    const error: any = new Error(
      "REFRESH_TOKEN_EXPIRED: DeviantArt refresh token has expired. User must re-authenticate."
    );
    error.code = "REFRESH_TOKEN_EXPIRED";
    error.userId = user.id;
    error.username = user.username;
    throw error;
  }

  // Check if access token is still valid
  if (user.tokenExpiresAt > fiveMinutesFromNow) {
    return user.accessToken;
  }

  logger.info("Refreshing DeviantArt access token", { userId: user.id });

  const response = await fetch(DEVIANTART_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: process.env.DEVIANTART_CLIENT_ID!,
      client_secret: process.env.DEVIANTART_CLIENT_SECRET!,
      refresh_token: user.refreshToken,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error("DeviantArt token refresh failed", {
      userId: user.id,
      status: response.status,
      error: errorText,
    });

    // Check if refresh token is invalid/expired
    if (
      response.status === 401 ||
      errorText.toLowerCase().includes("invalid") ||
      errorText.toLowerCase().includes("expired")
    ) {
      const expiredError: any = new Error(
        "REFRESH_TOKEN_EXPIRED: DeviantArt refresh token is invalid. User must re-authenticate."
      );
      expiredError.code = "REFRESH_TOKEN_EXPIRED";
      expiredError.userId = user.id;
      expiredError.username = user.username;
      throw expiredError;
    }

    throw new Error("Failed to refresh DeviantArt token");
  }

  const data = await response.json();
  const { access_token, refresh_token, expires_in } = data;
  const tokenExpiresAt = new Date(Date.now() + expires_in * 1000);

  // When we successfully refresh, we also get a NEW refresh token with extended expiry
  const refreshTokenExpiresAt = new Date(
    Date.now() + env.REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000
  );

  await prisma.user.update({
    where: { id: user.id },
    data: {
      accessToken: access_token,
      refreshToken: refresh_token,
      tokenExpiresAt,
      refreshTokenExpiresAt,
      lastRefreshTokenRefresh: new Date(),
    },
  });

  return access_token;
}

export interface RefreshTokenStatus {
  isValid: boolean;
  isExpiringSoon: boolean;
  expiresAt: Date;
  daysUntilExpiry: number;
}

export function getRefreshTokenStatus(user: User): RefreshTokenStatus {
  const now = new Date();
  const expiresAt = user.refreshTokenExpiresAt;
  const daysUntilExpiry = Math.floor(
    (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  return {
    isValid: expiresAt > now,
    isExpiringSoon: daysUntilExpiry <= 14, // Warning threshold
    expiresAt,
    daysUntilExpiry,
  };
}

export interface PublishResult {
  deviationId: string;
  url: string;
}

// Helper function to fetch file from S3 storage
async function fetchFileFromStorage(r2Key: string): Promise<Buffer> {
  const getCommand = new GetObjectCommand({
    Bucket: storageConfig.bucketName,
    Key: r2Key,
  });

  const response = await s3Client.send(getCommand);
  if (!response.Body) {
    throw new Error("Failed to fetch file from storage");
  }

  // Convert stream to buffer
  const chunks: Uint8Array[] = [];
  for await (const chunk of response.Body as any) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// Helper function to upload a single file to DeviantArt
async function uploadSingleFileToDeviantArt(
  file: DeviationFile,
  deviation: Deviation,
  accessToken: string,
  isMultiImage: boolean = false
): Promise<PublishResult> {
  let itemId: string;

  // Check if we already have a stashItemId from a previous attempt
  if (deviation.stashItemId) {
    logger.debug("Reusing existing stash item ID", {
      stashItemId: deviation.stashItemId,
      deviationId: deviation.id,
    });
    itemId = deviation.stashItemId;
  } else {
    // Upload to sta.sh
    // Fetch file from S3 storage
    const fileBuffer = await fetchFileFromStorage(file.r2Key);

    // Create form data for DeviantArt upload
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(fileBuffer)], {
      type: file.mimeType,
    });
    formData.append("file", blob, file.originalFilename);

    // For multi-image deviations, use the main deviation title
    // For single files in multiple mode, could use original filename
    formData.append("title", deviation.title);

    if (deviation.description) {
      formData.append("artist_comments", deviation.description);
    }

    // Note: Tags are NOT sent during stash/submit - they will be added during publish
    // This is because DeviantArt's stash/submit doesn't properly handle tags

    if (deviation.isMature) {
      formData.append("is_mature", "true");
      if (deviation.matureLevel) {
        formData.append("mature_level", deviation.matureLevel);
      }
    }

    if (deviation.categoryPath) {
      formData.append("catpath", deviation.categoryPath);
    }

    // Note: Gallery IDs are also NOT sent during stash/submit - will be added during publish

    if (deviation.allowComments !== undefined) {
      formData.append("allow_comments", deviation.allowComments.toString());
    }

    if (deviation.allowFreeDownload) {
      formData.append("allow_free_download", "true");
    }

    if (deviation.isAiGenerated) {
      formData.append("is_ai_generated", "true");
    }

    // Submit to DeviantArt
    const uploadResponse = await fetch(`${DEVIANTART_API_URL}/stash/submit`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: formData,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();

      // Extract headers for rate limiting and debugging
      const retryAfter = uploadResponse.headers.get("Retry-After");
      const xRateLimit = uploadResponse.headers.get("X-RateLimit-Reset");
      const xRateLimitRemaining = uploadResponse.headers.get(
        "X-RateLimit-Remaining"
      );

      logger.error("DeviantArt stash upload failed", {
        status: uploadResponse.status,
        error: errorText,
        retryAfter,
        xRateLimit,
        xRateLimitRemaining,
        deviationId: deviation.id,
      });

      // Build detailed error with headers
      const error: any = new Error(
        `DeviantArt API error: ${uploadResponse.status}`
      );
      error.status = uploadResponse.status;
      error.statusCode = uploadResponse.status;
      error.response = uploadResponse;
      error.retryAfter = retryAfter;
      error.rateLimitReset = xRateLimit;
      error.rateLimitRemaining = xRateLimitRemaining;
      error.headers = Object.fromEntries(uploadResponse.headers.entries());
      error.responseBody = errorText;

      // Specific error messages based on status code
      if (uploadResponse.status === 429) {
        error.message = retryAfter
          ? `DeviantArt API rate limit exceeded. Retry after ${retryAfter} seconds.`
          : "DeviantArt API rate limit exceeded. Please try again later.";
      } else if (uploadResponse.status === 401) {
        error.message =
          "DeviantArt authentication failed. Please reconnect your account.";
      } else if (uploadResponse.status === 403) {
        error.message =
          "DeviantArt permission denied. Check your account permissions.";
      } else if (uploadResponse.status === 400) {
        error.message = `DeviantArt validation error: ${errorText}`;
      } else if (uploadResponse.status >= 500) {
        error.message = `DeviantArt server error (${uploadResponse.status}). This is temporary.`;
      } else {
        error.message = `DeviantArt API error: ${uploadResponse.status} ${errorText}`;
      }

      throw error;
    }

    const uploadResult = await uploadResponse.json();

    logger.debug("DeviantArt stash/submit response received", {
      response: uploadResult,
      deviationId: deviation.id,
    });

    // The stash/submit response should contain itemid or stackid
    const rawItemId = uploadResult.itemid || uploadResult.stackid;

    if (!rawItemId) {
      logger.error("DeviantArt response missing item/stack ID", {
        response: uploadResult,
        responseKeys: Object.keys(uploadResult),
        deviationId: deviation.id,
      });
      throw new Error(
        `DeviantArt did not return an item ID. Response keys: ${Object.keys(
          uploadResult
        ).join(", ")}`
      );
    }

    // Convert to string explicitly (DeviantArt returns numeric IDs, but Prisma expects String)
    itemId = String(rawItemId);

    logger.info("Item uploaded to DeviantArt stash", {
      itemId,
      deviationId: deviation.id,
    });

    // Store the itemId in the database to avoid duplicate uploads on retry
    await prisma.deviation.update({
      where: { id: deviation.id },
      data: { stashItemId: itemId, updatedAt: new Date() },
    });
  }

  logger.info("Publishing stash item to DeviantArt", {
    itemId,
    deviationId: deviation.id,
  });

  // Step 2: Publish the stashed item
  // Build form data manually to properly handle arrays
  const formParts: string[] = [
    `itemid=${encodeURIComponent(itemId)}`,
    `is_mature=${deviation.isMature ? "true" : "false"}`,
  ];

  // Start with is_dirty=false, will change if we add tags/galleries
  let isDirty = false;

  if (deviation.isMature && deviation.matureLevel) {
    formParts.push(`mature_level=${encodeURIComponent(deviation.matureLevel)}`);
  }

  // Sanitize and add tags as array with brackets (replace spaces with underscores, DeviantArt allows only letters/numbers/underscore)
  if (deviation.tags && deviation.tags.length > 0) {
    const sanitizedTags = deviation.tags
      .map((tag) => tag.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, ""))
      .filter((tag) => tag.length > 0);

    if (sanitizedTags.length > 0) {
      // Send as array with brackets (don't encode the brackets): tags[]=dog&tags[]=cat
      sanitizedTags.forEach((tag) => {
        formParts.push(`tags[]=${encodeURIComponent(tag)}`);
      });
      isDirty = true;
      logger.debug("Adding tags to DeviantArt publish", {
        tagCount: sanitizedTags.length,
        tags: sanitizedTags,
        deviationId: deviation.id,
      });
    }
  }

  // Add gallery folders as array with brackets
  if (deviation.galleryIds && deviation.galleryIds.length > 0) {
    deviation.galleryIds.forEach((galleryId) => {
      formParts.push(`galleryids[]=${encodeURIComponent(galleryId)}`);
    });
    isDirty = true;
    logger.debug("Adding galleries to DeviantArt publish", {
      galleryCount: deviation.galleryIds.length,
      galleryIds: deviation.galleryIds,
      deviationId: deviation.id,
    });
  }

  // Add display resolution (0=original, 1-8 for various sizes)
  if (
    deviation.displayResolution !== undefined &&
    deviation.displayResolution !== null
  ) {
    formParts.push(`display_resolution=${deviation.displayResolution}`);
    logger.debug("Setting display resolution for DeviantArt publish", {
      displayResolution: deviation.displayResolution,
      deviationId: deviation.id,
    });

    // Add watermark only if display_resolution is present (watermark requires display_resolution)
    if (deviation.displayResolution > 0 && deviation.addWatermark) {
      formParts.push(`add_watermark=true`);
      logger.debug("Adding watermark to DeviantArt publish", {
        deviationId: deviation.id,
      });
    }
  }

  formParts.push(`is_dirty=${isDirty ? "true" : "false"}`);

  const publishBody = formParts.join("&");
  logger.debug("DeviantArt publish request body prepared", {
    body: publishBody,
    deviationId: deviation.id,
  });

  const publishResponse = await fetch(`${DEVIANTART_API_URL}/stash/publish`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: publishBody,
  });

  if (!publishResponse.ok) {
    const errorText = await publishResponse.text();
    logger.error("DeviantArt stash publish failed", {
      status: publishResponse.status,
      error: errorText,
      deviationId: deviation.id,
    });

    const error: any = new Error(
      `DeviantArt publish error: ${publishResponse.status}`
    );
    error.status = publishResponse.status;
    error.responseBody = errorText;
    throw error;
  }

  const publishResult = await publishResponse.json();
  logger.debug("DeviantArt stash/publish response received", {
    response: publishResult,
    deviationId: deviation.id,
  });

  // The publish response should contain the deviation info
  const deviationId = publishResult.deviationid || publishResult.deviationId;
  const url = publishResult.url;

  if (!deviationId) {
    logger.error("DeviantArt publish response missing deviation ID", {
      response: publishResult,
      responseKeys: Object.keys(publishResult),
      deviationId: deviation.id,
    });
    throw new Error(
      `DeviantArt did not return a deviation ID after publishing. Response keys: ${Object.keys(
        publishResult
      ).join(", ")}`
    );
  }

  logger.info("Successfully published deviation to DeviantArt", {
    deviationId,
    url,
    originalDeviationId: deviation.id,
  });

  return {
    deviationId: deviationId,
    url: url || `https://www.deviantart.com/deviation/${deviationId}`,
  };
}

export async function publishToDeviantArt(
  deviation: Deviation & { files: DeviationFile[] },
  user: User,
  uploadMode: UploadMode
): Promise<PublishResult | PublishResult[]> {
  // Refresh token if needed
  const accessToken = await refreshTokenIfNeeded(user);

  if (!deviation.files || deviation.files.length === 0) {
    throw new Error("No files to upload");
  }

  // Sort files by sortOrder to ensure correct order
  const sortedFiles = [...deviation.files].sort(
    (a, b) => a.sortOrder - b.sortOrder
  );

  if (uploadMode === "multiple") {
    // Multiple mode: Create separate deviation for each file
    const results: PublishResult[] = [];

    for (const file of sortedFiles) {
      logger.info("Publishing file as separate deviation", {
        filename: file.originalFilename,
        deviationId: deviation.id,
      });
      const result = await uploadSingleFileToDeviantArt(
        file,
        deviation,
        accessToken,
        false
      );
      results.push(result);

      // Adaptive delay between uploads to avoid rate limiting
      if (sortedFiles.indexOf(file) < sortedFiles.length - 1) {
        const baseDelay = 3000; // 3 seconds base delay
        const jitter = Math.random() * 1000; // 0-1s jitter
        const delay = baseDelay + jitter;

        logger.debug("Waiting before next upload to respect rate limits", {
          delayMs: Math.round(delay),
          deviationId: deviation.id,
        });
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    return results;
  } else {
    // Single mode: Upload first file (multi-image support TBD)
    // TODO: Research DeviantArt multi-image API
    // For now, we only upload the primary (first) file
    logger.info("Publishing single deviation", {
      fileCount: sortedFiles.length,
      deviationId: deviation.id,
    });

    if (sortedFiles.length > 1) {
      logger.warn("Multi-image upload not yet supported, uploading first file only", {
        fileCount: sortedFiles.length,
        deviationId: deviation.id,
      });
    }

    const primaryFile = sortedFiles[0];
    return await uploadSingleFileToDeviantArt(
      primaryFile,
      deviation,
      accessToken,
      sortedFiles.length > 1
    );
  }
}
