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

import { vi } from 'vitest';
import type { S3Client } from '@aws-sdk/client-s3';

/**
 * Create a mock S3 client for testing
 */
export function createS3Mock(): Partial<S3Client> {
  return {
    send: vi.fn().mockResolvedValue({}),
    destroy: vi.fn(),
  };
}

/**
 * Create mock response for GetObjectCommand
 */
export function createGetObjectResponse(body: string | Buffer) {
  const bodyBytes = typeof body === 'string' ? Buffer.from(body) : body;

  return {
    Body: {
      transformToByteArray: async () => bodyBytes,
      transformToString: async () => bodyBytes.toString('utf-8'),
      transformToWebStream: () => new ReadableStream(),
    },
    ContentType: 'image/png',
    ContentLength: bodyBytes.length,
  };
}

/**
 * Create mock response for DeleteObjectCommand
 */
export function createDeleteObjectResponse() {
  return {
    DeleteMarker: false,
    VersionId: undefined,
  };
}
