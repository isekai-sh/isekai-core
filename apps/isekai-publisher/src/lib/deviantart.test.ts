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
import type { User, Deviation, DeviationFile } from '../db/index';

// Mock fetch globally
global.fetch = vi.fn();

// Create mock at hoisted scope
const { mockSend } = vi.hoisted(() => ({
  mockSend: vi.fn(),
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

// Mock smithy
vi.mock('@smithy/node-http-handler', () => ({
  NodeHttpHandler: vi.fn(),
}));

// Mock prisma
vi.mock('../db/index.js', async () => {
  const actual = await vi.importActual('../db/index.js');
  return {
    ...actual,
    prisma: {
      user: {
        update: vi.fn(),
      },
      deviation: {
        update: vi.fn(),
      },
    },
  };
});

// Import deviantart functions AFTER mocks are set up
import { refreshTokenIfNeeded, getRefreshTokenStatus, publishToDeviantArt } from './deviantart';
import { prisma } from '../db/index.js';
import { GetObjectCommand } from '@aws-sdk/client-s3';

const mockPrisma = vi.mocked(prisma);
const mockFetch = vi.mocked(global.fetch);

describe('deviantart', () => {
  let mockUser: User;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = {
      id: 'user-1',
      username: 'testuser',
      email: 'test@example.com',
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
      refreshTokenExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
      createdAt: new Date(),
      updatedAt: new Date(),
    } as User;

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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getRefreshTokenStatus', () => {
    it('should return valid status when token is not expiring soon', () => {
      const result = getRefreshTokenStatus(mockUser);

      expect(result.isValid).toBe(true);
      expect(result.isExpiringSoon).toBe(false);
      expect(result.daysUntilExpiry).toBeGreaterThan(14);
      expect(result.expiresAt).toEqual(mockUser.refreshTokenExpiresAt);
    });

    it('should return expiring soon when within 14 days', () => {
      mockUser.refreshTokenExpiresAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000); // 5 days

      const result = getRefreshTokenStatus(mockUser);

      expect(result.isValid).toBe(true);
      expect(result.isExpiringSoon).toBe(true);
      expect(result.daysUntilExpiry).toBeLessThanOrEqual(14);
    });

    it('should return invalid status when token is expired', () => {
      mockUser.refreshTokenExpiresAt = new Date(Date.now() - 1000); // Past

      const result = getRefreshTokenStatus(mockUser);

      expect(result.isValid).toBe(false);
      expect(result.isExpiringSoon).toBe(true); // Expired tokens are also "expiring soon"
      expect(result.daysUntilExpiry).toBeLessThan(0);
    });

    it('should correctly calculate days until expiry', () => {
      const exactlyTwoWeeks = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      mockUser.refreshTokenExpiresAt = exactlyTwoWeeks;

      const result = getRefreshTokenStatus(mockUser);

      expect(result.daysUntilExpiry).toBe(14);
      expect(result.isExpiringSoon).toBe(true);
    });
  });

  describe('refreshTokenIfNeeded', () => {
    it('should return existing token when still valid', async () => {
      const result = await refreshTokenIfNeeded(mockUser);

      expect(result).toBe('access-token');
      expect(fetch).not.toHaveBeenCalled();
    });

    it('should throw error when refresh token is expired', async () => {
      mockUser.refreshTokenExpiresAt = new Date(Date.now() - 1000); // Expired

      await expect(refreshTokenIfNeeded(mockUser)).rejects.toThrow('REFRESH_TOKEN_EXPIRED');
    });

    it('should refresh token when access token expires soon', async () => {
      mockUser.tokenExpiresAt = new Date(Date.now() + 2 * 60 * 1000); // 2 minutes (< 5 min threshold)

      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
        }),
      });

      const { prisma } = await import('../db/index.js');
      (prisma.user.update as any).mockResolvedValueOnce({});

      const result = await refreshTokenIfNeeded(mockUser);

      expect(result).toBe('new-access-token');
      expect(fetch).toHaveBeenCalledWith(
        'https://www.deviantart.com/oauth2/token',
        expect.objectContaining({
          method: 'POST',
        })
      );
      expect(prisma.user.update).toHaveBeenCalled();
    });

    it('should handle token refresh failure with 401', async () => {
      mockUser.tokenExpiresAt = new Date(Date.now() + 2 * 60 * 1000);

      (fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Invalid refresh token',
      });

      await expect(refreshTokenIfNeeded(mockUser)).rejects.toThrow('REFRESH_TOKEN_EXPIRED');
    });

    it('should handle generic token refresh failure', async () => {
      mockUser.tokenExpiresAt = new Date(Date.now() + 2 * 60 * 1000);

      (fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Server error',
      });

      await expect(refreshTokenIfNeeded(mockUser)).rejects.toThrow(
        'Failed to refresh DeviantArt token'
      );
    });

    it('should update both access and refresh tokens', async () => {
      mockUser.tokenExpiresAt = new Date(Date.now() + 2 * 60 * 1000);

      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-access',
          refresh_token: 'new-refresh',
          expires_in: 7200,
        }),
      });

      const { prisma } = await import('../db/index.js');
      (prisma.user.update as any).mockResolvedValueOnce({});

      await refreshTokenIfNeeded(mockUser);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          accessToken: 'new-access',
          refreshToken: 'new-refresh',
        }),
      });
    });

    it('should detect expired refresh token when error contains "invalid"', async () => {
      mockUser.tokenExpiresAt = new Date(Date.now() + 2 * 60 * 1000);

      (fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'invalid_grant: refresh token is invalid',
      });

      const error = await refreshTokenIfNeeded(mockUser).catch((e) => e);
      expect(error.message).toContain('REFRESH_TOKEN_EXPIRED');
      expect(error.code).toBe('REFRESH_TOKEN_EXPIRED');
    });

    it('should detect expired refresh token when error contains "expired"', async () => {
      mockUser.tokenExpiresAt = new Date(Date.now() + 2 * 60 * 1000);

      (fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Token has expired',
      });

      const error = await refreshTokenIfNeeded(mockUser).catch((e) => e);
      expect(error.message).toContain('REFRESH_TOKEN_EXPIRED');
      expect(error.code).toBe('REFRESH_TOKEN_EXPIRED');
    });

    it('should include userId and username in expired token error', async () => {
      mockUser.refreshTokenExpiresAt = new Date(Date.now() - 1000);

      const error = await refreshTokenIfNeeded(mockUser).catch((e) => e);
      expect(error.userId).toBe('user-1');
      expect(error.username).toBe('testuser');
    });

    it('should calculate correct token expiry time', async () => {
      mockUser.tokenExpiresAt = new Date(Date.now() + 2 * 60 * 1000);

      const expiresIn = 7200; // 2 hours
      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-token',
          refresh_token: 'new-refresh',
          expires_in: expiresIn,
        }),
      });

      const { prisma } = await import('../db/index.js');
      (prisma.user.update as any).mockResolvedValueOnce({});

      await refreshTokenIfNeeded(mockUser);

      const updateCall = (prisma.user.update as any).mock.calls[0][0];
      const tokenExpiresAt = updateCall.data.tokenExpiresAt as Date;
      const expectedExpiry = new Date(Date.now() + expiresIn * 1000);

      // Allow 1 second tolerance for test execution time
      expect(Math.abs(tokenExpiresAt.getTime() - expectedExpiry.getTime())).toBeLessThan(1000);
    });

    it('should set refresh token expiry to 90 days after successful refresh', async () => {
      mockUser.tokenExpiresAt = new Date(Date.now() + 2 * 60 * 1000);

      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-token',
          refresh_token: 'new-refresh',
          expires_in: 3600,
        }),
      });

      const { prisma } = await import('../db/index.js');
      (prisma.user.update as any).mockResolvedValueOnce({});

      await refreshTokenIfNeeded(mockUser);

      const updateCall = (prisma.user.update as any).mock.calls[0][0];
      const refreshTokenExpiresAt = updateCall.data.refreshTokenExpiresAt as Date;
      const expectedExpiry = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

      // Allow 1 second tolerance
      expect(Math.abs(refreshTokenExpiresAt.getTime() - expectedExpiry.getTime())).toBeLessThan(
        1000
      );
    });

    it('should update lastRefreshTokenRefresh timestamp', async () => {
      mockUser.tokenExpiresAt = new Date(Date.now() + 2 * 60 * 1000);

      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-token',
          refresh_token: 'new-refresh',
          expires_in: 3600,
        }),
      });

      const { prisma } = await import('../db/index.js');
      (prisma.user.update as any).mockResolvedValueOnce({});

      await refreshTokenIfNeeded(mockUser);

      const updateCall = (prisma.user.update as any).mock.calls[0][0];
      expect(updateCall.data.lastRefreshTokenRefresh).toBeInstanceOf(Date);
    });
  });

  describe('publishToDeviantArt', () => {
    const mockFile: DeviationFile = {
      id: 'file-1',
      deviationId: 'dev-1',
      storageKey: 'uploads/user-1/test-image.jpg',
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
      stashOnly: false,
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

    describe('basic functionality', () => {
      it('should throw error if no files provided', async () => {
        const deviationNoFiles = {
          ...mockDeviation,
          files: [],
        };

        await expect(publishToDeviantArt(deviationNoFiles, mockUser, 'single')).rejects.toThrow(
          'No files to upload'
        );
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

        // Should upload the file with sortOrder 0 first
        expect(mockFetch).toHaveBeenCalled();
      });

      it('should upload file to DeviantArt stash', async () => {
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

        const result = await publishToDeviantArt(mockDeviation, mockUser, 'single');

        expect(mockFetch).toHaveBeenCalledWith(
          'https://www.deviantart.com/api/v1/oauth2/stash/submit',
          expect.objectContaining({
            method: 'POST',
            headers: {
              Authorization: 'Bearer access-token',
            },
          })
        );

        expect(result).toEqual({
          deviationId: 'da-dev-123',
          url: 'https://deviantart.com/art/test-123',
        });
      });
    });

    describe('stash item handling', () => {
      it('should reuse existing stashItemId if present', async () => {
        const deviationWithStash = {
          ...mockDeviation,
          stashItemId: 'existing-12345',
        };

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
            json: async () => ({ stackid: '88888' }),
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

      it('should skip publish and return stashItemId when stashOnly mode enabled', async () => {
        const stashOnlyDeviation = {
          ...mockDeviation,
          stashOnly: true,
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ itemid: '12345' }),
        } as Response);

        mockPrisma.deviation.update.mockResolvedValue(stashOnlyDeviation as any);

        const result = await publishToDeviantArt(stashOnlyDeviation, mockUser, 'single');

        // Should only have upload call, no publish call
        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(result).toEqual({
          deviationId: '12345',
          url: '',
        });
      });
    });

    describe('metadata and tags', () => {
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

        // Tags should be sanitized
        expect(body).toContain('tags[]=digital_art');
        expect(body).toContain('tags[]=fantasy');
        expect(body).toContain('tags[]=testtag');

        // Gallery IDs
        expect(body).toContain('galleryids[]=gallery-1');
        expect(body).toContain('galleryids[]=gallery-2');

        // Should mark as dirty
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

        expect(body).toContain('tags[]=tagwithdash');
        expect(body).toContain('tags[]=tagspecial');
        expect(body).toContain('tags[]=valid_tag');
        expect(body).toContain('tags[]=123numbers');
      });

      it('should filter out empty tags after sanitization', async () => {
        const deviationWithEmptyTags = {
          ...mockDeviation,
          tags: ['valid', '!!!', '   ', '@#$'],
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

        mockPrisma.deviation.update.mockResolvedValue(deviationWithEmptyTags as any);

        await publishToDeviantArt(deviationWithEmptyTags, mockUser, 'single');

        const publishCall = mockFetch.mock.calls[1];
        const body = publishCall[1]?.body as string;

        // Only valid tag should appear
        expect(body).toContain('tags[]=valid');
        // Empty tags should not create tags[] entries (hard to test negative, but is_dirty should still be true)
        expect(body).toContain('is_dirty=true');
      });

      it('should set is_dirty=false when no tags or galleries', async () => {
        const deviationNoMeta = {
          ...mockDeviation,
          tags: [],
          galleryIds: [],
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

        mockPrisma.deviation.update.mockResolvedValue(deviationNoMeta as any);

        await publishToDeviantArt(deviationNoMeta, mockUser, 'single');

        const publishCall = mockFetch.mock.calls[1];
        const body = publishCall[1]?.body as string;

        expect(body).toContain('is_dirty=false');
      });
    });

    describe('mature content', () => {
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

      it('should handle mature content with strict level', async () => {
        const matureDeviation = {
          ...mockDeviation,
          isMature: true,
          matureLevel: 'strict',
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

        expect(body).toContain('mature_level=strict');
      });

      it('should not include mature_level when isMature is false', async () => {
        const nonMatureDeviation = {
          ...mockDeviation,
          isMature: false,
          matureLevel: null,
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

        mockPrisma.deviation.update.mockResolvedValue(nonMatureDeviation as any);

        await publishToDeviantArt(nonMatureDeviation, mockUser, 'single');

        const publishCall = mockFetch.mock.calls[1];
        const body = publishCall[1]?.body as string;

        expect(body).toContain('is_mature=false');
        expect(body).not.toContain('mature_level');
      });
    });

    describe('display settings', () => {
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

      it('should not include display_resolution when 0', async () => {
        const deviation = {
          ...mockDeviation,
          displayResolution: 0,
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

        expect(body).not.toContain('display_resolution');
      });

      it('should handle allowComments setting', async () => {
        const deviation = {
          ...mockDeviation,
          allowComments: false,
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

        expect(body).toContain('allow_comments=false');
      });

      it('should handle allowFreeDownload setting', async () => {
        const deviation = {
          ...mockDeviation,
          allowFreeDownload: true,
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

        expect(body).toContain('allow_free_download=true');
      });
    });

    describe('error handling', () => {
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
    });

    describe('storage file fetching', () => {
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

        expect(mockSend).toHaveBeenCalled();
        expect(GetObjectCommand).toHaveBeenCalledWith({
          Bucket: 'test-bucket',
          Key: 'uploads/user-1/test-image.jpg',
        });
      });

      it('should handle storage fetch error', async () => {
        mockSend.mockRejectedValueOnce(new Error('S3 connection failed'));

        await expect(publishToDeviantArt(mockDeviation, mockUser, 'single')).rejects.toThrow(
          'S3 connection failed'
        );
      });

      it('should handle storage response with no Body', async () => {
        mockSend.mockResolvedValueOnce({ Body: null });

        await expect(publishToDeviantArt(mockDeviation, mockUser, 'single')).rejects.toThrow(
          'Failed to fetch file from storage'
        );
      });

      it('should convert storage stream to buffer', async () => {
        const testData = Buffer.from('test-image-data');
        mockSend.mockResolvedValueOnce({
          Body: {
            async *[Symbol.asyncIterator]() {
              yield testData;
            },
          },
        });

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

        // Successfully processed the stream
        expect(mockSend).toHaveBeenCalled();
      });
    });

    describe('multiple upload mode', () => {
      it('should upload each file as separate deviation', async () => {
        const files: DeviationFile[] = [
          { ...mockFile, id: 'file-1', sortOrder: 0 },
          { ...mockFile, id: 'file-2', sortOrder: 1 },
          { ...mockFile, id: 'file-3', sortOrder: 2 },
        ];

        const deviation = {
          ...mockDeviation,
          files,
        };

        // Mock for each file: stash upload + publish
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

        const results = await publishToDeviantArt(deviation, mockUser, 'multiple');

        expect(Array.isArray(results)).toBe(true);
        expect(results).toHaveLength(3);
        expect(results[0]).toEqual({
          deviationId: 'da-dev-0',
          url: 'https://deviantart.com/art/test-0',
        });
      }, 15000);

      it('should refresh token before each file upload in multiple mode', async () => {
        const files: DeviationFile[] = [
          { ...mockFile, id: 'file-1', sortOrder: 0 },
          { ...mockFile, id: 'file-2', sortOrder: 1 },
        ];

        const deviation = {
          ...mockDeviation,
          files,
        };

        // Each file needs stash + publish
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

        await publishToDeviantArt(deviation, mockUser, 'multiple');

        // Should have uploaded 2 files
        expect(mockFetch).toHaveBeenCalledTimes(4); // 2 files × (stash + publish)
      }, 15000);
    });

    describe('single upload mode with multiple files', () => {
      it('should only upload first file when multiple files present', async () => {
        const files: DeviationFile[] = [
          { ...mockFile, id: 'file-1', sortOrder: 0 },
          { ...mockFile, id: 'file-2', sortOrder: 1 },
          { ...mockFile, id: 'file-3', sortOrder: 2 },
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
  });
});
