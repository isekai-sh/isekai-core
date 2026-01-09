/**
 * Isekai Publisher Worker - Dedicated microservice for processing DeviantArt publishing jobs
 *
 * This service runs independently from the API server, providing:
 * - Fault isolation (crashes don't affect API)
 * - Independent scaling (scale based on queue depth)
 * - Zero-downtime deployments
 * - Simplified monitoring and debugging
 *
 * Architecture:
 * - Connects to shared Redis (BullMQ job queue)
 * - Connects to shared PostgreSQL (deviation state)
 * - No direct HTTP communication with API
 * - Health check endpoint for monitoring
 */

import '@isekai/shared'; // Load config from root .env (single source of truth)
import './lib/env.js'; // Validate environment variables before anything else
import express from 'express';
import { deviationPublisherWorker } from './queues/deviation-publisher.js';
import { tokenMaintenanceWorker, scheduleTokenMaintenance } from './queues/token-maintenance.js';
import { RedisClientManager } from './lib/redis-client.js';
import { startStuckJobRecovery } from './jobs/stuck-job-recovery.js';
import { startPastDueRecovery } from './jobs/past-due-recovery.js';
import { startLockCleanup } from './jobs/lock-cleanup.js';
import { startAutoScheduler } from './jobs/auto-scheduler.js';
import { env } from './lib/env.js';

const HEALTH_CHECK_PORT = env.HEALTH_CHECK_PORT;
const HEALTH_CHECK_ENABLED = env.HEALTH_CHECK_ENABLED;

/**
 * Health Check Server
 * Provides liveness and readiness probes for orchestration platforms (K8s, Docker, etc.)
 */
let healthCheckServer: any;

async function startHealthCheckServer() {
  if (!HEALTH_CHECK_ENABLED) {
    return;
  }

  const app = express();

  // Liveness probe - is the process running?
  app.get('/health', (req, res) => {
    res.status(200).json({
      status: 'healthy',
      service: 'isekai-publisher',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  // Readiness probe - can the worker process jobs?
  app.get('/ready', async (req, res) => {
    try {
      // Check Redis connection
      const redis = await RedisClientManager.getClient();
      if (!redis) {
        throw new Error('Redis not connected');
      }

      // Check if worker is running
      const isRunning = deviationPublisherWorker.isRunning();
      if (!isRunning) {
        throw new Error('Worker not running');
      }

      // Active jobs count not available via Worker API
      const activeJobsCount = 0;

      res.status(200).json({
        status: 'ready',
        service: 'isekai-publisher',
        worker: {
          running: isRunning,
          activeJobs: activeJobsCount,
        },
        redis: {
          connected: true,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(503).json({
        status: 'not_ready',
        service: 'isekai-publisher',
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Metrics endpoint (Prometheus-compatible)
  app.get('/metrics', async (req, res) => {
    try {
      // Active jobs count not available via Worker API
      const activeJobsCount = 0;

      res.set('Content-Type', 'text/plain');
      res.send(
        `
# HELP publisher_active_jobs Number of jobs currently being processed
# TYPE publisher_active_jobs gauge
publisher_active_jobs ${activeJobsCount}

# HELP publisher_uptime_seconds Uptime of the publisher service in seconds
# TYPE publisher_uptime_seconds counter
publisher_uptime_seconds ${Math.floor(process.uptime())}
`.trim()
      );
    } catch (error: any) {
      res.status(500).send('Error collecting metrics');
    }
  });

  healthCheckServer = app.listen(HEALTH_CHECK_PORT);
}

/**
 * Graceful Shutdown Handler
 * Ensures all active jobs complete before shutting down
 */
async function gracefulShutdown(signal: string) {
  console.log(`[Publisher] Received ${signal}, starting graceful shutdown...`);

  try {
    // Pause workers to stop accepting new jobs
    console.log('[Publisher] Pausing workers...');
    await deviationPublisherWorker.pause();
    await tokenMaintenanceWorker.pause();

    // Wait for active jobs to complete (with timeout)
    console.log('[Publisher] Waiting for active jobs to complete (max 30s)...');
    await new Promise((resolve) => setTimeout(resolve, 30000));

    // Close workers
    console.log('[Publisher] Closing workers...');
    await deviationPublisherWorker.close();
    await tokenMaintenanceWorker.close();

    // Close Redis connection
    console.log('[Publisher] Closing Redis connection...');
    await RedisClientManager.close();

    // Close health check server
    if (healthCheckServer) {
      console.log('[Publisher] Closing health check server...');
      await new Promise<void>((resolve) => {
        healthCheckServer.close(() => resolve());
      });
    }

    console.log('[Publisher] Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('[Publisher] Shutdown error:', error);
    process.exit(1);
  }
}

/**
 * Error Handlers
 * Catch unhandled errors to prevent silent failures
 */
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  setTimeout(() => process.exit(1), 5000);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection:', reason);
});

/**
 * Shutdown Signal Handlers
 */
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

/**
 * Main Startup Function
 */
async function startPublisher() {
  try {
    const redis = await RedisClientManager.getClient();
    if (!redis) {
      throw new Error('Failed to connect to Redis');
    }

    await startHealthCheckServer();
    await scheduleTokenMaintenance();
    startStuckJobRecovery();
    startPastDueRecovery();
    startLockCleanup();
    startAutoScheduler();

    console.log(`Publisher ready (${env.NODE_ENV})`);
  } catch (error) {
    console.error('Publisher startup failed:', error);
    process.exit(1);
  }
}

// Start the publisher
startPublisher().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
