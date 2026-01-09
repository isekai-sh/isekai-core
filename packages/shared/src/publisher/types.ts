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

import type { Job } from 'bullmq';
import type { PrismaClient, User, Deviation, DeviationFile } from '@prisma/client';
import type { UploadMode } from '../index.js';

/**
 * Dependencies required by the publisher core logic
 * Allows dependency injection for service-specific implementations
 */
export interface PublisherDependencies {
  /** Prisma client for database operations */
  prisma: PrismaClient;

  /** Structured logger instance */
  logger: any; // Will use StructuredLogger type

  /** Rate limiter instance */
  rateLimiter: any; // Will use AdaptiveRateLimiter type

  /** Metrics collector instance */
  metricsCollector: any; // Will use PublisherMetricsCollector type

  /** Circuit breaker instance */
  CircuitBreaker: any; // Will use CircuitBreaker type

  /** Function to wrap operations with circuit breaker */
  withCircuitBreaker: <T>(
    key: string,
    operation: () => Promise<T>,
    fallback: () => Promise<T>
  ) => Promise<T>;

  /** Function to publish to DeviantArt */
  publishToDeviantArt: (
    deviation: Deviation & { files: DeviationFile[]; user: User },
    user: User,
    uploadMode: UploadMode
  ) => Promise<PublishResult | PublishResult[]>;

  /** Function to queue storage cleanup */
  queueStorageCleanup: (deviationId: string, userId: string) => Promise<void>;

  /** Error categorizer instance */
  errorCategorizer: any; // Will use ErrorCategorizer type
}

/**
 * Job data structure for deviation publishing
 */
export interface DeviationPublishJobData {
  deviationId: string;
  userId: string;
  uploadMode: UploadMode;
}

/**
 * Result from a single deviation publish
 */
export interface PublishResult {
  deviationId: string;
  url: string;
}

/**
 * Result from the publish job
 */
export interface PublishJobResult {
  success: boolean;
  alreadyPublished?: boolean;
  alreadyRunning?: boolean; // Lock was already held by another worker
  results?: PublishResult[];
}

/**
 * Deviation with related data needed for publishing
 */
export type DeviationWithRelations = Deviation & {
  files: DeviationFile[];
  user: User;
};
