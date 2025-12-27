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

// Types
export type { S3Config, StorageService } from "./types.js";

// Service
export {
  S3StorageService,
  createStorageService,
  getS3Client,
  getStorageConfig,
} from "./service.js";

// Configuration
export {
  getS3ConfigFromEnv,
  hasS3Config,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
  validateFileType,
  validateFileSize,
  checkStorageLimit,
} from "./config.js";

// Key generation
export { generateStorageKey } from "./keys.js";
