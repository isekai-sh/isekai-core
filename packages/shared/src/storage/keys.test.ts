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

import { describe, it, expect } from 'vitest';
import { generateStorageKey } from './keys.js';

describe('generateStorageKey', () => {
  it('should generate key without prefix (backward compat)', () => {
    const key = generateStorageKey('user-123', 'artwork.jpg');

    expect(key).toMatch(/^deviations\/user-123\/artwork---[a-f0-9]{8}\.jpg$/);
  });

  it('should generate key with prefix', () => {
    const key = generateStorageKey('user-123', 'artwork.jpg', 'vault-abc/');

    expect(key).toMatch(/^vault-abc\/deviations\/user-123\/artwork---[a-f0-9]{8}\.jpg$/);
  });

  it('should handle nested prefix paths', () => {
    const key = generateStorageKey('user-123', 'test.png', 'prod/tenant-456/');

    expect(key).toMatch(/^prod\/tenant-456\/deviations\/user-123\/test---[a-f0-9]{8}\.png$/);
  });

  it('should generate unique keys for same input', () => {
    const key1 = generateStorageKey('user-123', 'artwork.jpg');
    const key2 = generateStorageKey('user-123', 'artwork.jpg');

    expect(key1).not.toBe(key2);
  });

  it('should sanitize special characters in filename', () => {
    const key = generateStorageKey('user-123', 'my artwork (final).jpg');

    // Special characters should be replaced with hyphens
    expect(key).toMatch(/^deviations\/user-123\/my-artwork--final----[a-f0-9]{8}\.jpg$/);
  });

  it('should preserve file extension', () => {
    const jpgKey = generateStorageKey('user-123', 'image.jpg');
    const pngKey = generateStorageKey('user-123', 'image.png');
    const webpKey = generateStorageKey('user-123', 'image.webp');

    expect(jpgKey).toMatch(/\.jpg$/);
    expect(pngKey).toMatch(/\.png$/);
    expect(webpKey).toMatch(/\.webp$/);
  });

  it('should truncate long filenames', () => {
    const longFilename =
      'this-is-a-very-long-filename-that-exceeds-the-maximum-allowed-length-for-storage-keys.jpg';
    const key = generateStorageKey('user-123', longFilename);

    // The sanitized part should be max 50 chars
    const match = key.match(/^deviations\/user-123\/(.+)---[a-f0-9]{8}\.jpg$/);
    expect(match).not.toBeNull();
    expect(match![1].length).toBeLessThanOrEqual(50);
  });

  it('should use filename as extension when no dot present', () => {
    const key = generateStorageKey('user-123', 'noextension');

    // When there's no dot, split(".").pop() returns the whole filename
    expect(key).toMatch(/\.noextension$/);
  });

  it('should work with empty prefix (same as no prefix)', () => {
    const keyNoPrefix = generateStorageKey('user-123', 'file.png');
    const keyEmptyPrefix = generateStorageKey('user-123', 'file.png', '');

    // Both should start with "deviations/" (no prefix)
    expect(keyNoPrefix).toMatch(/^deviations\//);
    expect(keyEmptyPrefix).toMatch(/^deviations\//);
  });
});
