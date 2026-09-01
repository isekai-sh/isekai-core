import 'dotenv/config';
import express from 'express';
import { prisma } from '@isekai/shared/db';
import { thumbnailWorker } from './queues/thumbnails.js';
import { thumbnailQueue, thumbnailRedis } from './lib/thumbnail-queue.js';
import { startThumbnailReconciler, stopThumbnailReconciler } from './jobs/thumbnail-reconciler.js';

const port = parseInt(process.env.MEDIA_HEALTH_PORT || '8001', 10);
const app = express();

app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', service: 'isekai-media-worker', uptime: process.uptime() });
});

app.get('/ready', async (_req, res) => {
  try {
    await thumbnailRedis.ping();
    if (!thumbnailWorker.isRunning()) throw new Error('Thumbnail worker is not running');
    res.json({ status: 'ready', service: 'isekai-media-worker' });
  } catch (error) {
    res.status(503).json({
      status: 'not_ready',
      error: error instanceof Error ? error.message : 'unknown error',
    });
  }
});

app.get('/metrics', async (_req, res) => {
  const counts = await thumbnailQueue.getJobCounts(
    'active',
    'waiting',
    'delayed',
    'completed',
    'failed'
  );
  res.type('text/plain').send(
    Object.entries(counts)
      .map(([state, count]) => `isekai_thumbnail_jobs{state="${state}"} ${count}`)
      .join('\n')
  );
});

const server = app.listen(port, () => {
  console.log(`[Media worker] Health server listening on ${port}`);
});
startThumbnailReconciler();

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[Media worker] ${signal}; shutting down`);
  stopThumbnailReconciler();
  await thumbnailWorker.pause();
  await thumbnailWorker.close();
  await thumbnailQueue.close();
  await thumbnailRedis.quit();
  await prisma.$disconnect();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));
