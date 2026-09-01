import { beforeEach, describe, expect, it, vi } from 'vitest';

const { add, getJob, remove, getState } = vi.hoisted(() => ({
  add: vi.fn(),
  getJob: vi.fn(),
  remove: vi.fn(),
  getState: vi.fn(),
}));

vi.mock('bullmq', () => ({
  Queue: class MockQueue {
    add = add;
    getJob = getJob;
  },
}));
vi.mock('ioredis', () => ({
  Redis: class MockRedis {},
}));

import { enqueueThumbnail } from './thumbnail-queue.js';

describe('thumbnail queue', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses a deterministic v1 job id', async () => {
    getJob.mockResolvedValue(null);
    await enqueueThumbnail('file-123');
    expect(add).toHaveBeenCalledWith(
      'generate-v1',
      { deviationFileId: 'file-123', targetVersion: 1 },
      { jobId: 'thumbnail-file-123-v1' }
    );
  });

  it('removes an exhausted retained failure before re-enqueueing', async () => {
    getState.mockResolvedValue('failed');
    getJob.mockResolvedValue({ getState, remove });
    await enqueueThumbnail('file-123');
    expect(remove).toHaveBeenCalledOnce();
    expect(add).toHaveBeenCalledOnce();
  });
});
