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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';

// Mock the S3 client before importing the module
const mockSend = vi.fn();
vi.mock('@aws-sdk/client-s3', async () => {
  const actual = await vi.importActual('@aws-sdk/client-s3');
  return {
    ...actual,
    S3Client: class {
      send = mockSend;
    },
  };
});

describe('upload-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.R2_ACCOUNT_ID = 'test-account';
    process.env.R2_ACCESS_KEY_ID = 'test-key';
    process.env.R2_SECRET_ACCESS_KEY = 'test-secret';
    process.env.R2_BUCKET_NAME = 'test-bucket';
  });

  describe('deleteFromR2', () => {
    it('should delete file from R2 bucket', async () => {
      mockSend.mockResolvedValueOnce({});

      // Import after mocks are set up
      const { deleteFromR2 } = await import('./upload-service.js');

      await deleteFromR2('path/to/file.png');

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            Bucket: 'test-bucket',
            Key: 'path/to/file.png',
          }),
        })
      );
    });

    it('should handle deletion of files with special characters', async () => {
      mockSend.mockResolvedValueOnce({});

      const { deleteFromR2 } = await import('./upload-service.js');

      await deleteFromR2('path/with spaces/file (1).png');

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            Key: 'path/with spaces/file (1).png',
          }),
        })
      );
    });

    it('should propagate errors from S3', async () => {
      const error = new Error('S3 error');
      mockSend.mockRejectedValueOnce(error);

      const { deleteFromR2 } = await import('./upload-service.js');

      await expect(deleteFromR2('test.png')).rejects.toThrow('S3 error');
    });
  });
});
