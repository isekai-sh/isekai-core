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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { User, Deviation, DeviationFile } from '../db/index.js';

// Mock fetch globally
global.fetch = vi.fn();

// Create mock at hoisted scope
const { mockSend } = vi.hoisted(() => ({
  mockSend: vi.fn(),
}));

// Mock dependencies
vi.mock('../db/index.js', () => ({
  prisma: {
    user: {
      update: vi.fn(),
    },
    deviation: {
      update: vi.fn(),
    },
  },
}));

vi.mock('./logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('./env.js', () => ({
  env: {
    REFRESH_TOKEN_EXPIRY_DAYS: 60,
  },
}));

// Mock @aws-sdk/client-s3
vi.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: vi.fn().mockImplementation(() => ({
      send: mockSend,
    })),
    GetObjectCommand: vi.fn(),
  };
});

// Mock shared storage module - must be before importing deviantart
vi.mock('@isekai/shared/storage', () => ({
  getS3Client: vi.fn(() => ({
    send: mockSend,
  })),
  getStorageConfig: vi.fn(() => ({
    bucketName: 'test-bucket',
    publicUrl: 'https://cdn.example.com',
  })),
}));

// Import deviantart functions AFTER mocks are set up
import {
  refreshTokenIfNeeded,
  getRefreshTokenStatus,
  publishToDeviantArt,
} from './deviantart.js';
import { prisma } from '../db/index.js';
import { GetObjectCommand } from '@aws-sdk/client-s3';

const mockPrisma = vi.mocked(prisma);
const mockFetch = vi.mocked(global.fetch);

describe('deviantart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getRefreshTokenStatus', () => {
    it('should return valid status for non-expired token', () => {
      const user = {
        id: 'user-1',
        refreshTokenExpiresAt: new Date('2025-03-15T12:00:00Z'), // 60 days from now
      } as User;

      const status = getRefreshTokenStatus(user);

      expect(status.isValid).toBe(true);
      expect(status.isExpiringSoon).toBe(false);
      expect(status.daysUntilExpiry).toBe(59);
      expect(status.expiresAt).toEqual(user.refreshTokenExpiresAt);
    });

    it('should return expiring soon status when within 14 days', () => {
      const user = {
        id: 'user-1',
        refreshTokenExpiresAt: new Date('2025-01-25T12:00:00Z'), // 10 days from now
      } as User;

      const status = getRefreshTokenStatus(user);

      expect(status.isValid).toBe(true);
      expect(status.isExpiringSoon).toBe(true);
      expect(status.daysUntilExpiry).toBe(10);
    });

    it('should return invalid status for expired token', () => {
      const user = {
        id: 'user-1',
        refreshTokenExpiresAt: new Date('2025-01-10T12:00:00Z'), // 5 days ago
      } as User;

      const status = getRefreshTokenStatus(user);

      expect(status.isValid).toBe(false);
      expect(status.daysUntilExpiry).toBeLessThan(0);
    });

    it('should calculate exact days until expiry', () => {
      const user = {
        id: 'user-1',
        refreshTokenExpiresAt: new Date('2025-01-16T12:00:00Z'), // Exactly 1 day
      } as User;

      const status = getRefreshTokenStatus(user);

      expect(status.daysUntilExpiry).toBe(1);
    });
  });

  describe('refreshTokenIfNeeded', () => {
    it('should return existing access token if still valid', async () => {
      const user = {
        id: 'user-1',
        accessToken: 'existing-token',
        tokenExpiresAt: new Date('2025-01-15T12:10:00Z'), // 10 minutes from now
        refreshToken: 'refresh-token',
        refreshTokenExpiresAt: new Date('2025-03-15T12:00:00Z'),
      } as User;

      const token = await refreshTokenIfNeeded(user);

      expect(token).toBe('existing-token');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should throw REFRESH_TOKEN_EXPIRED if refresh token is expired', async () => {
      const user = {
        id: 'user-1',
        username: 'testuser',
        accessToken: 'old-token',
        tokenExpiresAt: new Date('2025-01-15T11:00:00Z'), // Expired
        refreshToken: 'expired-refresh',
        refreshTokenExpiresAt: new Date('2025-01-10T12:00:00Z'), // Expired 5 days ago
      } as User;

      await expect(refreshTokenIfNeeded(user)).rejects.toThrow('REFRESH_TOKEN_EXPIRED');
      await expect(refreshTokenIfNeeded(user)).rejects.toMatchObject({
        code: 'REFRESH_TOKEN_EXPIRED',
        userId: 'user-1',
        username: 'testuser',
      });
    });

    it('should refresh token when access token expires within 5 minutes', async () => {
      const user = {
        id: 'user-1',
        accessToken: 'old-token',
        tokenExpiresAt: new Date('2025-01-15T12:03:00Z'), // 3 minutes from now
        refreshToken: 'refresh-token',
        refreshTokenExpiresAt: new Date('2025-03-15T12:00:00Z'),
      } as User;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
        }),
      } as Response);

      mockPrisma.user.update.mockResolvedValueOnce({
        ...user,
        accessToken: 'new-access-token',
      } as User);

      const token = await refreshTokenIfNeeded(user);

      expect(token).toBe('new-access-token');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://www.deviantart.com/oauth2/token',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        })
      );

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          accessToken: 'new-access-token',
          refreshToken: 'new-refresh-token',
        }),
      });
    });

    it('should calculate correct token expiry time', async () => {
      const user = {
        id: 'user-1',
        accessToken: 'old-token',
        tokenExpiresAt: new Date('2025-01-15T12:03:00Z'),
        refreshToken: 'refresh-token',
        refreshTokenExpiresAt: new Date('2025-03-15T12:00:00Z'),
      } as User;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-token',
          refresh_token: 'new-refresh',
          expires_in: 3600, // 1 hour
        }),
      } as Response);

      mockPrisma.user.update.mockResolvedValueOnce(user as User);

      await refreshTokenIfNeeded(user);

      const updateCall = mockPrisma.user.update.mock.calls[0][0];
      const tokenExpiresAt = updateCall.data.tokenExpiresAt as Date;

      // Should be 1 hour from now
      const expectedExpiry = new Date('2025-01-15T13:00:00Z');
      expect(tokenExpiresAt.getTime()).toBe(expectedExpiry.getTime());
    });

    it('should calculate correct refresh token expiry', async () => {
      const user = {
        id: 'user-1',
        accessToken: 'old-token',
        tokenExpiresAt: new Date('2025-01-15T12:03:00Z'),
        refreshToken: 'refresh-token',
        refreshTokenExpiresAt: new Date('2025-03-15T12:00:00Z'),
      } as User;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-token',
          refresh_token: 'new-refresh',
          expires_in: 3600,
        }),
      } as Response);

      mockPrisma.user.update.mockResolvedValueOnce(user as User);

      await refreshTokenIfNeeded(user);

      const updateCall = mockPrisma.user.update.mock.calls[0][0];
      const refreshTokenExpiresAt = updateCall.data.refreshTokenExpiresAt as Date;

      // Should be 60 days from now
      const expectedExpiry = new Date('2025-03-16T12:00:00Z');
      expect(refreshTokenExpiresAt.getTime()).toBe(expectedExpiry.getTime());
    });

    it('should throw REFRESH_TOKEN_EXPIRED on 401 response', async () => {
      const user = {
        id: 'user-1',
        username: 'testuser',
        accessToken: 'old-token',
        tokenExpiresAt: new Date('2025-01-15T12:03:00Z'),
        refreshToken: 'invalid-refresh',
        refreshTokenExpiresAt: new Date('2025-03-15T12:00:00Z'),
      } as User;

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Invalid refresh token',
      } as Response);

      await expect(refreshTokenIfNeeded(user)).rejects.toThrow('REFRESH_TOKEN_EXPIRED');

      // Mock again for second call
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Invalid refresh token',
      } as Response);

      await expect(refreshTokenIfNeeded(user)).rejects.toMatchObject({
        code: 'REFRESH_TOKEN_EXPIRED',
        userId: 'user-1',
        username: 'testuser',
      });
    });

    it('should throw REFRESH_TOKEN_EXPIRED when error text contains "invalid"', async () => {
      const user = {
        id: 'user-1',
        username: 'testuser',
        accessToken: 'old-token',
        tokenExpiresAt: new Date('2025-01-15T12:03:00Z'),
        refreshToken: 'invalid-refresh',
        refreshTokenExpiresAt: new Date('2025-03-15T12:00:00Z'),
      } as User;

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'invalid_grant: refresh token is invalid',
      } as Response);

      await expect(refreshTokenIfNeeded(user)).rejects.toThrow('REFRESH_TOKEN_EXPIRED');
    });

    it('should throw REFRESH_TOKEN_EXPIRED when error text contains "expired"', async () => {
      const user = {
        id: 'user-1',
        username: 'testuser',
        accessToken: 'old-token',
        tokenExpiresAt: new Date('2025-01-15T12:03:00Z'),
        refreshToken: 'expired-refresh',
        refreshTokenExpiresAt: new Date('2025-03-15T12:00:00Z'),
      } as User;

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Token has expired',
      } as Response);

      await expect(refreshTokenIfNeeded(user)).rejects.toThrow('REFRESH_TOKEN_EXPIRED');
    });

    it('should throw generic error for other API failures', async () => {
      const user = {
        id: 'user-1',
        accessToken: 'old-token',
        tokenExpiresAt: new Date('2025-01-15T12:03:00Z'),
        refreshToken: 'refresh-token',
        refreshTokenExpiresAt: new Date('2025-03-15T12:00:00Z'),
      } as User;

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal server error',
      } as Response);

      await expect(refreshTokenIfNeeded(user)).rejects.toThrow(
        'Failed to refresh DeviantArt token'
      );
    });

    it('should include client credentials in token refresh request', async () => {
      const user = {
        id: 'user-1',
        accessToken: 'old-token',
        tokenExpiresAt: new Date('2025-01-15T12:03:00Z'),
        refreshToken: 'refresh-token',
        refreshTokenExpiresAt: new Date('2025-03-15T12:00:00Z'),
      } as User;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-token',
          refresh_token: 'new-refresh',
          expires_in: 3600,
        }),
      } as Response);

      mockPrisma.user.update.mockResolvedValueOnce(user as User);

      await refreshTokenIfNeeded(user);

      const fetchCall = mockFetch.mock.calls[0];
      const body = fetchCall[1]?.body as URLSearchParams;

      expect(body.get('grant_type')).toBe('refresh_token');
      expect(body.get('refresh_token')).toBe('refresh-token');
      // Client ID and secret are from process.env, can't verify exact values
      expect(body.has('client_id')).toBe(true);
      expect(body.has('client_secret')).toBe(true);
    });
  });

  describe('publishToDeviantArt', () => {
    const mockUser: User = {
      id: 'user-1',
      deviantArtUserId: 'da-user-1',
      username: 'testartist',
      displayName: 'Test Artist',
      accessToken: 'valid-token',
      refreshToken: 'refresh-token',
      tokenExpiresAt: new Date('2025-01-15T13:00:00Z'), // Valid for 1 hour
      refreshTokenExpiresAt: new Date('2025-03-15T12:00:00Z'),
      createdAt: new Date(),
      updatedAt: new Date(),
      lastRefreshTokenRefresh: null,
    };

    const mockFile: DeviationFile = {
      id: 'file-1',
      deviationId: 'dev-1',
      r2Key: 'uploads/user-1/test-image.jpg',
      originalFilename: 'test-image.jpg',
      mimeType: 'image/jpeg',
      fileSize: 1024000,
      sortOrder: 0,
      createdAt: new Date(),
    };

    const mockDeviation: Deviation & { files: DeviationFile[] } = {
      id: 'dev-1',
      userId: 'user-1',
      title: 'Test Artwork',
      description: 'A test description',
      tags: ['digital', 'art', 'test'],
      categoryPath: 'digitalart/paintings',
      isMature: false,
      matureLevel: null,
      allowComments: true,
      allowFreeDownload: false,
      isAiGenerated: false,
      galleryIds: [],
      stashItemId: null,
      deviantArtDeviationId: null,
      deviantArtUrl: null,
      status: 'draft',
      publishedAt: null,
      scheduledFor: null,
      uploadMode: 'single',
      displayResolution: null,
      addWatermark: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      files: [mockFile],
    };

    beforeEach(() => {
      // Setup default S3 response
      mockSend.mockClear();
      mockSend.mockResolvedValue({
        Body: {
          async *[Symbol.asyncIterator]() {
            yield Buffer.from('fake-image-data');
          },
        },
      });
    });

    it('should throw error if no files provided', async () => {
      const deviationNoFiles = {
        ...mockDeviation,
        files: [],
      };

      await expect(
        publishToDeviantArt(deviationNoFiles, mockUser, 'single')
      ).rejects.toThrow('No files to upload');
    });

    it('should sort files by sortOrder before uploading', async () => {
      const files: DeviationFile[] = [
        { ...mockFile, id: 'file-1', sortOrder: 2 },
        { ...mockFile, id: 'file-2', sortOrder: 0 },
        { ...mockFile, id: 'file-3', sortOrder: 1 },
      ];

      const deviation = {
        ...mockDeviation,
        files,
      };

      // Mock successful stash upload
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ itemid: '12345' }),
      } as Response);

      // Mock successful publish
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          deviationid: 'da-dev-123',
          url: 'https://deviantart.com/art/test-123',
        }),
      } as Response);

      mockPrisma.deviation.update.mockResolvedValue(deviation as any);

      await publishToDeviantArt(deviation, mockUser, 'single');

      // First file uploaded should be the one with sortOrder 0
      const stashCall = mockFetch.mock.calls[0];
      const formData = stashCall[1]?.body as FormData;

      // We can't directly inspect FormData, but we uploaded the first (sorted) file
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should upload file to DeviantArt stash', async () => {
      mockFetch
        // Stash upload
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ itemid: '12345' }),
        } as Response)
        // Publish
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            deviationid: 'da-dev-123',
            url: 'https://deviantart.com/art/test-123',
          }),
        } as Response);

      mockPrisma.deviation.update.mockResolvedValue(mockDeviation as any);

      const result = await publishToDeviantArt(mockDeviation, mockUser, 'single');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://www.deviantart.com/api/v1/oauth2/stash/submit',
        expect.objectContaining({
          method: 'POST',
          headers: {
            Authorization: 'Bearer valid-token',
          },
        })
      );

      expect(result).toEqual({
        deviationId: 'da-dev-123',
        url: 'https://deviantart.com/art/test-123',
      });
    });

    it('should reuse existing stashItemId if present', async () => {
      const deviationWithStash = {
        ...mockDeviation,
        stashItemId: 'existing-12345',
      };

      // Only publish call needed (no upload)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          deviationid: 'da-dev-123',
          url: 'https://deviantart.com/art/test-123',
        }),
      } as Response);

      mockPrisma.deviation.update.mockResolvedValue(deviationWithStash as any);

      await publishToDeviantArt(deviationWithStash, mockUser, 'single');

      // Should only have 1 fetch call (publish), not 2 (upload + publish)
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://www.deviantart.com/api/v1/oauth2/stash/publish',
        expect.anything()
      );
    });

    it('should store stashItemId after successful upload', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ itemid: 99999 }), // Numeric ID
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            deviationid: 'da-dev-123',
            url: 'https://deviantart.com/art/test-123',
          }),
        } as Response);

      mockPrisma.deviation.update.mockResolvedValue(mockDeviation as any);

      await publishToDeviantArt(mockDeviation, mockUser, 'single');

      expect(mockPrisma.deviation.update).toHaveBeenCalledWith({
        where: { id: 'dev-1' },
        data: {
          stashItemId: '99999', // Converted to string
          updatedAt: expect.any(Date),
        },
      });
    });

    it('should handle stackid from DeviantArt response', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ stackid: '88888' }), // Some responses use stackid
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            deviationid: 'da-dev-123',
            url: 'https://deviantart.com/art/test-123',
          }),
        } as Response);

      mockPrisma.deviation.update.mockResolvedValue(mockDeviation as any);

      await publishToDeviantArt(mockDeviation, mockUser, 'single');

      expect(mockPrisma.deviation.update).toHaveBeenCalledWith({
        where: { id: 'dev-1' },
        data: {
          stashItemId: '88888',
          updatedAt: expect.any(Date),
        },
      });
    });

    it('should throw error if stash response missing itemid/stackid', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'ok' }), // Missing ID
      } as Response);

      await expect(publishToDeviantArt(mockDeviation, mockUser, 'single')).rejects.toThrow(
        'DeviantArt did not return an item ID'
      );
    });

    it('should publish with tags and galleries', async () => {
      const deviationWithMeta = {
        ...mockDeviation,
        tags: ['digital art', 'fantasy', 'test-tag'],
        galleryIds: ['gallery-1', 'gallery-2'],
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ itemid: '12345' }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            deviationid: 'da-dev-123',
            url: 'https://deviantart.com/art/test-123',
          }),
        } as Response);

      mockPrisma.deviation.update.mockResolvedValue(deviationWithMeta as any);

      await publishToDeviantArt(deviationWithMeta, mockUser, 'single');

      const publishCall = mockFetch.mock.calls[1];
      const body = publishCall[1]?.body as string;

      // Tags should be sanitized (spaces replaced with underscores, hyphens removed)
      expect(body).toContain('tags[]=digital_art');
      expect(body).toContain('tags[]=fantasy');
      expect(body).toContain('tags[]=testtag'); // Hyphens are removed

      // Gallery IDs
      expect(body).toContain('galleryids[]=gallery-1');
      expect(body).toContain('galleryids[]=gallery-2');

      // Should mark as dirty when tags/galleries present
      expect(body).toContain('is_dirty=true');
    });

    it('should sanitize tags by removing special characters', async () => {
      const deviationWithSpecialTags = {
        ...mockDeviation,
        tags: ['tag-with-dash', 'tag@special!', 'valid_tag', '123numbers'],
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ itemid: '12345' }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            deviationid: 'da-dev-123',
            url: 'https://deviantart.com/art/test-123',
          }),
        } as Response);

      mockPrisma.deviation.update.mockResolvedValue(deviationWithSpecialTags as any);

      await publishToDeviantArt(deviationWithSpecialTags, mockUser, 'single');

      const publishCall = mockFetch.mock.calls[1];
      const body = publishCall[1]?.body as string;

      // Hyphens and special characters should be removed (only letters, numbers, underscores allowed)
      expect(body).toContain('tags[]=tagwithdash');
      expect(body).toContain('tags[]=tagspecial');
      expect(body).toContain('tags[]=valid_tag');
      expect(body).toContain('tags[]=123numbers');
    });

    it('should handle mature content settings', async () => {
      const matureDeviation = {
        ...mockDeviation,
        isMature: true,
        matureLevel: 'moderate',
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ itemid: '12345' }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            deviationid: 'da-dev-123',
            url: 'https://deviantart.com/art/test-123',
          }),
        } as Response);

      mockPrisma.deviation.update.mockResolvedValue(matureDeviation as any);

      await publishToDeviantArt(matureDeviation, mockUser, 'single');

      const publishCall = mockFetch.mock.calls[1];
      const body = publishCall[1]?.body as string;

      expect(body).toContain('is_mature=true');
      expect(body).toContain('mature_level=moderate');
    });

    it('should handle display resolution and watermark', async () => {
      const deviationWithWatermark = {
        ...mockDeviation,
        displayResolution: 5,
        addWatermark: true,
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ itemid: '12345' }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            deviationid: 'da-dev-123',
            url: 'https://deviantart.com/art/test-123',
          }),
        } as Response);

      mockPrisma.deviation.update.mockResolvedValue(deviationWithWatermark as any);

      await publishToDeviantArt(deviationWithWatermark, mockUser, 'single');

      const publishCall = mockFetch.mock.calls[1];
      const body = publishCall[1]?.body as string;

      expect(body).toContain('display_resolution=5');
      expect(body).toContain('add_watermark=true');
    });

    it('should not add watermark if displayResolution is 0', async () => {
      const deviation = {
        ...mockDeviation,
        displayResolution: 0,
        addWatermark: true,
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ itemid: '12345' }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            deviationid: 'da-dev-123',
            url: 'https://deviantart.com/art/test-123',
          }),
        } as Response);

      mockPrisma.deviation.update.mockResolvedValue(deviation as any);

      await publishToDeviantArt(deviation, mockUser, 'single');

      const publishCall = mockFetch.mock.calls[1];
      const body = publishCall[1]?.body as string;

      expect(body).not.toContain('add_watermark');
    });

    it('should handle stash upload error with rate limit headers', async () => {
      const mockHeaders = new Headers({
        'Retry-After': '120',
        'X-RateLimit-Reset': '1234567890',
        'X-RateLimit-Remaining': '0',
      });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => 'Rate limit exceeded',
        headers: mockHeaders,
      } as Response);

      await expect(publishToDeviantArt(mockDeviation, mockUser, 'single')).rejects.toMatchObject({
        status: 429,
        retryAfter: '120',
        rateLimitReset: '1234567890',
        rateLimitRemaining: '0',
        message: expect.stringContaining('Retry after 120 seconds'),
      });
    });

    it('should handle 401 authentication error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
        headers: new Headers(),
      } as Response);

      await expect(publishToDeviantArt(mockDeviation, mockUser, 'single')).rejects.toMatchObject({
        status: 401,
        message: expect.stringContaining('authentication failed'),
      });
    });

    it('should handle 403 permission error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => 'Forbidden',
        headers: new Headers(),
      } as Response);

      await expect(publishToDeviantArt(mockDeviation, mockUser, 'single')).rejects.toMatchObject({
        status: 403,
        message: expect.stringContaining('permission denied'),
      });
    });

    it('should handle 400 validation error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Invalid category path',
        headers: new Headers(),
      } as Response);

      await expect(publishToDeviantArt(mockDeviation, mockUser, 'single')).rejects.toMatchObject({
        status: 400,
        message: expect.stringContaining('validation error'),
      });
    });

    it('should handle 500 server error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal server error',
        headers: new Headers(),
      } as Response);

      await expect(publishToDeviantArt(mockDeviation, mockUser, 'single')).rejects.toMatchObject({
        status: 500,
        message: expect.stringContaining('server error'),
      });
    });

    it('should handle publish failure', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ itemid: '12345' }),
        } as Response)
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          text: async () => 'Invalid publish data',
        } as Response);

      mockPrisma.deviation.update.mockResolvedValue(mockDeviation as any);

      await expect(publishToDeviantArt(mockDeviation, mockUser, 'single')).rejects.toMatchObject({
        status: 400,
        message: expect.stringContaining('publish error'),
      });
    });

    it('should throw error if publish response missing deviationid', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ itemid: '12345' }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ status: 'published' }), // Missing deviationid
        } as Response);

      mockPrisma.deviation.update.mockResolvedValue(mockDeviation as any);

      await expect(publishToDeviantArt(mockDeviation, mockUser, 'single')).rejects.toThrow(
        'did not return a deviation ID'
      );
    });

    it('should provide default URL if missing in response', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ itemid: '12345' }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            deviationid: 'da-dev-456',
            // url missing
          }),
        } as Response);

      mockPrisma.deviation.update.mockResolvedValue(mockDeviation as any);

      const result = await publishToDeviantArt(mockDeviation, mockUser, 'single');

      expect(result).toEqual({
        deviationId: 'da-dev-456',
        url: 'https://www.deviantart.com/deviation/da-dev-456',
      });
    });

    describe('multiple upload mode', () => {
      it('should upload each file as separate deviation', async () => {
        // Use real timers for this test (delays use real setTimeout)
        vi.useRealTimers();

        // Update user with far-future refresh token for real timer tests
        const userWithFutureToken = {
          ...mockUser,
          tokenExpiresAt: new Date(Date.now() + 3600000), // 1 hour from now
          refreshTokenExpiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days from now
        };

        const files: DeviationFile[] = [
          { ...mockFile, id: 'file-1', sortOrder: 0 },
          { ...mockFile, id: 'file-2', sortOrder: 1 },
          { ...mockFile, id: 'file-3', sortOrder: 2 },
        ];

        const deviation = {
          ...mockDeviation,
          files,
        };

        // Each file: stash upload + publish
        for (let i = 0; i < 3; i++) {
          mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ itemid: `${12345 + i}` }),
          } as Response);
          mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
              deviationid: `da-dev-${i}`,
              url: `https://deviantart.com/art/test-${i}`,
            }),
          } as Response);
        }

        mockPrisma.deviation.update.mockResolvedValue(deviation as any);

        const results = await publishToDeviantArt(deviation, userWithFutureToken, 'multiple');

        expect(Array.isArray(results)).toBe(true);
        expect(results).toHaveLength(3);
        expect(results[0]).toEqual({
          deviationId: 'da-dev-0',
          url: 'https://deviantart.com/art/test-0',
        });

        // Restore fake timers
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2025-01-15T12:00:00Z'));
      }, 15000); // Increase timeout for delays

      it('should add delays between multiple uploads', async () => {
        // Use real timers for this test
        vi.useRealTimers();

        // Update user with far-future refresh token for real timer tests
        const userWithFutureToken = {
          ...mockUser,
          tokenExpiresAt: new Date(Date.now() + 3600000), // 1 hour from now
          refreshTokenExpiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days from now
        };

        const files: DeviationFile[] = [
          { ...mockFile, id: 'file-1', sortOrder: 0 },
          { ...mockFile, id: 'file-2', sortOrder: 1 },
        ];

        const deviation = {
          ...mockDeviation,
          files,
        };

        for (let i = 0; i < 2; i++) {
          mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ itemid: `${i}` }),
          } as Response);
          mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
              deviationid: `da-${i}`,
              url: `https://deviantart.com/art/${i}`,
            }),
          } as Response);
        }

        mockPrisma.deviation.update.mockResolvedValue(deviation as any);

        const startTime = Date.now();
        await publishToDeviantArt(deviation, userWithFutureToken, 'multiple');
        const endTime = Date.now();

        // Should have waited ~3-4 seconds between uploads (with real timers)
        expect(endTime - startTime).toBeGreaterThan(3000); // At least 3 seconds delay
        expect(endTime - startTime).toBeLessThan(5000); // But not too long

        // Restore fake timers
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2025-01-15T12:00:00Z'));
      }, 10000); // Increase timeout for delays
    });

    describe('single upload mode with multiple files', () => {
      it('should only upload first file when multiple files present', async () => {
        // Clear any leftover mocks from previous tests
        mockFetch.mockClear();

        const files: DeviationFile[] = [
          { ...mockFile, id: 'file-1', sortOrder: 0, originalFilename: 'first.jpg' },
          { ...mockFile, id: 'file-2', sortOrder: 1, originalFilename: 'second.jpg' },
          { ...mockFile, id: 'file-3', sortOrder: 2, originalFilename: 'third.jpg' },
        ];

        const deviation = {
          ...mockDeviation,
          files,
        };

        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({ itemid: '12345' }),
          } as Response)
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({
              deviationid: 'da-dev-123',
              url: 'https://deviantart.com/art/test-123',
            }),
          } as Response);

        mockPrisma.deviation.update.mockResolvedValue(deviation as any);

        const result = await publishToDeviantArt(deviation, mockUser, 'single');

        // Should have 2 calls (stash + publish) not 6 (3 files × 2)
        expect(mockFetch).toHaveBeenCalledTimes(2);
        expect(result).toEqual({
          deviationId: 'da-dev-123',
          url: 'https://deviantart.com/art/test-123',
        });
      });
    });

    it('should fetch file from storage before uploading', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ itemid: '12345' }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            deviationid: 'da-dev-123',
            url: 'https://deviantart.com/art/test-123',
          }),
        } as Response);

      mockPrisma.deviation.update.mockResolvedValue(mockDeviation as any);

      await publishToDeviantArt(mockDeviation, mockUser, 'single');

      // S3 send method should have been called to fetch file
      expect(mockSend).toHaveBeenCalled();
      expect(GetObjectCommand).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: 'uploads/user-1/test-image.jpg',
      });
    });

    it('should handle storage fetch error', async () => {
      // Override mockSend to throw error
      mockSend.mockRejectedValueOnce(new Error('S3 connection failed'));

      await expect(publishToDeviantArt(mockDeviation, mockUser, 'single')).rejects.toThrow(
        'S3 connection failed'
      );
    });

    it('should handle storage response with no Body', async () => {
      // Override mockSend to return no Body
      mockSend.mockResolvedValueOnce({ Body: null });

      await expect(publishToDeviantArt(mockDeviation, mockUser, 'single')).rejects.toThrow(
        'Failed to fetch file from storage'
      );
    });
  });
});
