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

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  hasS3Config,
  getS3ConfigFromEnv,
  validateFileType,
  validateFileSize,
  checkStorageLimit,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
} from "./config.js";

describe("config", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear relevant env vars
    delete process.env.S3_ENDPOINT;
    delete process.env.S3_REGION;
    delete process.env.S3_ACCESS_KEY_ID;
    delete process.env.S3_SECRET_ACCESS_KEY;
    delete process.env.S3_BUCKET_NAME;
    delete process.env.S3_PUBLIC_URL;
    delete process.env.S3_FORCE_PATH_STYLE;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("hasS3Config", () => {
    it("should return true when all required S3 variables are set", () => {
      process.env.S3_ACCESS_KEY_ID = "key";
      process.env.S3_SECRET_ACCESS_KEY = "secret";
      process.env.S3_BUCKET_NAME = "bucket";
      expect(hasS3Config()).toBe(true);
    });

    it("should return false when some S3 variables are missing", () => {
      process.env.S3_ACCESS_KEY_ID = "key";
      expect(hasS3Config()).toBe(false);
    });

    it("should return false when no S3 variables are set", () => {
      expect(hasS3Config()).toBe(false);
    });
  });

  describe("getS3ConfigFromEnv", () => {
    it("should return config from S3 environment variables", () => {
      process.env.S3_ENDPOINT = "https://s3.example.com";
      process.env.S3_REGION = "us-east-1";
      process.env.S3_ACCESS_KEY_ID = "key";
      process.env.S3_SECRET_ACCESS_KEY = "secret";
      process.env.S3_BUCKET_NAME = "bucket";
      process.env.S3_PUBLIC_URL = "https://cdn.example.com";
      process.env.S3_FORCE_PATH_STYLE = "true";

      const config = getS3ConfigFromEnv();

      expect(config).toEqual({
        endpoint: "https://s3.example.com",
        region: "us-east-1",
        accessKeyId: "key",
        secretAccessKey: "secret",
        bucket: "bucket",
        publicUrl: "https://cdn.example.com",
        forcePathStyle: true,
      });
    });

    it("should use default region if not specified", () => {
      process.env.S3_ACCESS_KEY_ID = "key";
      process.env.S3_SECRET_ACCESS_KEY = "secret";
      process.env.S3_BUCKET_NAME = "bucket";

      const config = getS3ConfigFromEnv();

      expect(config.region).toBe("auto");
    });

    it("should throw error if required variables are missing", () => {
      expect(() => getS3ConfigFromEnv()).toThrow(
        "Missing required S3 configuration"
      );
    });

    it("should handle forcePathStyle as false by default", () => {
      process.env.S3_ACCESS_KEY_ID = "key";
      process.env.S3_SECRET_ACCESS_KEY = "secret";
      process.env.S3_BUCKET_NAME = "bucket";

      const config = getS3ConfigFromEnv();

      expect(config.forcePathStyle).toBe(false);
    });
  });

  describe("validateFileType", () => {
    it("should accept allowed image types", () => {
      expect(validateFileType("image/jpeg")).toBe(true);
      expect(validateFileType("image/png")).toBe(true);
      expect(validateFileType("image/gif")).toBe(true);
      expect(validateFileType("image/webp")).toBe(true);
    });

    it("should accept allowed video types", () => {
      expect(validateFileType("video/mp4")).toBe(true);
      expect(validateFileType("video/webm")).toBe(true);
      expect(validateFileType("video/quicktime")).toBe(true);
    });

    it("should reject disallowed types", () => {
      expect(validateFileType("application/pdf")).toBe(false);
      expect(validateFileType("text/plain")).toBe(false);
    });
  });

  describe("validateFileSize", () => {
    it("should accept valid file sizes", () => {
      expect(validateFileSize(1)).toBe(true);
      expect(validateFileSize(MAX_FILE_SIZE)).toBe(true);
    });

    it("should reject invalid file sizes", () => {
      expect(validateFileSize(0)).toBe(false);
      expect(validateFileSize(-1)).toBe(false);
      expect(validateFileSize(MAX_FILE_SIZE + 1)).toBe(false);
    });
  });

  describe("checkStorageLimit", () => {
    it("should return true when within limit", () => {
      expect(checkStorageLimit(1000, 500, 2000)).toBe(true);
    });

    it("should return false when exceeding limit", () => {
      expect(checkStorageLimit(1500, 600, 2000)).toBe(false);
    });
  });

  describe("constants", () => {
    it("should have correct ALLOWED_MIME_TYPES", () => {
      expect(ALLOWED_MIME_TYPES).toHaveLength(7);
      expect(ALLOWED_MIME_TYPES).toContain("image/jpeg");
      expect(ALLOWED_MIME_TYPES).toContain("video/mp4");
    });

    it("should have correct MAX_FILE_SIZE", () => {
      expect(MAX_FILE_SIZE).toBe(50 * 1024 * 1024);
    });
  });
});
