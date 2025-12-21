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
import type { Queue, Worker, Job } from 'bullmq';

/**
 * Create a mock BullMQ Queue
 */
export function createQueueMock<T = any>(): Partial<Queue<T>> {
  return {
    add: vi.fn().mockResolvedValue({ id: 'mock-job-id' } as Job<T>),
    addBulk: vi.fn().mockResolvedValue([{ id: 'mock-job-id' } as Job<T>]),
    getJobs: vi.fn().mockResolvedValue([]),
    getJob: vi.fn().mockResolvedValue(null),
    getWaiting: vi.fn().mockResolvedValue([]),
    getActive: vi.fn().mockResolvedValue([]),
    getCompleted: vi.fn().mockResolvedValue([]),
    getFailed: vi.fn().mockResolvedValue([]),
    getDelayed: vi.fn().mockResolvedValue([]),
    clean: vi.fn().mockResolvedValue([]),
    obliterate: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn().mockResolvedValue(undefined),
    resume: vi.fn().mockResolvedValue(undefined),
    isPaused: vi.fn().mockResolvedValue(false),
    close: vi.fn().mockResolvedValue(undefined),
    name: 'mock-queue',
  };
}

/**
 * Create a mock BullMQ Worker
 */
export function createWorkerMock<T = any>(): Partial<Worker<T>> {
  return {
    on: vi.fn().mockReturnThis(),
    off: vi.fn().mockReturnThis(),
    run: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn().mockResolvedValue(undefined),
    resume: vi.fn().mockResolvedValue(undefined),
    isPaused: vi.fn().mockReturnValue(false),
    isRunning: vi.fn().mockReturnValue(true),
    name: 'mock-worker',
  };
}

/**
 * Create a mock BullMQ Job
 */
export function createJobMock<T = any>(data: T, opts?: { id?: string; attemptsMade?: number }): Partial<Job<T>> {
  return {
    id: opts?.id || 'mock-job-id',
    data,
    attemptsMade: opts?.attemptsMade || 0,
    updateProgress: vi.fn().mockResolvedValue(undefined),
    log: vi.fn().mockResolvedValue(undefined),
    moveToCompleted: vi.fn().mockResolvedValue(undefined),
    moveToFailed: vi.fn().mockResolvedValue(undefined),
    retry: vi.fn().mockResolvedValue(undefined),
    discard: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    extendLock: vi.fn().mockResolvedValue(undefined),
  };
}
