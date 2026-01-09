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

import { randomUUID } from 'crypto';

/**
 * Generate a storage key for a deviation file.
 *
 * Format: {pathPrefix}deviations/{userId}/{sanitized-filename}---{shortUuid}.{ext}
 *
 * @param userId - User ID who owns the file
 * @param filename - Original filename
 * @param pathPrefix - Optional path prefix for multi-tenant storage (default: "")
 * @returns Storage key path
 */
export function generateStorageKey(
  userId: string,
  filename: string,
  pathPrefix: string = ''
): string {
  // Extract filename without extension
  const filenameWithoutExt = filename.replace(/\.[^/.]+$/, '');

  // Sanitize: replace special characters with hyphens, limit length
  const sanitized = filenameWithoutExt.replace(/[^a-zA-Z0-9-_]/g, '-').slice(0, 50);

  // Get short UUID for uniqueness (first 8 chars)
  const shortUuid = randomUUID().split('-')[0];

  // Get extension (default to jpg if none)
  const ext = filename.split('.').pop() || 'jpg';

  return `${pathPrefix}deviations/${userId}/${sanitized}---${shortUuid}.${ext}`;
}
