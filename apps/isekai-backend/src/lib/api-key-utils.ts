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

import { randomBytes, createHash } from 'crypto';

const API_KEY_PREFIX = 'isk_';
const KEY_LENGTH = 32; // Random bytes (64 hex chars after prefix)

/**
 * Generate a new API key
 * Returns the raw key (shown once), its SHA-256 hash (for storage), and prefix (for display)
 */
export function generateApiKey(): {
  key: string;
  hash: string;
  prefix: string;
} {
  const randomPart = randomBytes(KEY_LENGTH).toString('hex');
  const key = `${API_KEY_PREFIX}${randomPart}`;
  const hash = hashApiKey(key);
  const prefix = key.substring(0, 12); // isk_abc12345

  return { key, hash, prefix };
}

/**
 * Hash an API key using SHA-256 for secure storage
 */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Validate API key format
 */
export function isValidApiKeyFormat(key: string): boolean {
  return (
    key.startsWith(API_KEY_PREFIX) &&
    key.length === API_KEY_PREFIX.length + KEY_LENGTH * 2 &&
    /^isk_[a-f0-9]{64}$/.test(key)
  );
}
