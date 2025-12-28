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

import { prisma } from "../db/index.js";
import { logger } from "./logger.js";
import { env } from "./env.js";

interface HealthReport {
  instanceId: string;
  timestamp: string;
  status: "healthy" | "degraded" | "unhealthy";
  metrics: {
    accountCount: number;
    deviationCount: number;
    storageUsedBytes: number;
  };
}

/**
 * Collect health metrics from the instance
 */
async function collectHealthMetrics(): Promise<HealthReport["metrics"]> {
  const [accountCount, deviationCount, storageStats] = await Promise.all([
    prisma.user.count(),
    prisma.deviation.count(),
    prisma.deviationFile.aggregate({ _sum: { fileSize: true } }),
  ]);

  return {
    accountCount,
    deviationCount,
    storageUsedBytes: storageStats._sum.fileSize || 0,
  };
}

/**
 * Report instance health to the control plane.
 * This is called periodically via cron job.
 *
 * If CONTROL_PLANE_URL, CONTROL_PLANE_API_KEY, or INSTANCE_ID are not set,
 * this function does nothing (self-hosted mode).
 */
export async function reportHealth(): Promise<void> {
  // Skip if not configured for control plane reporting
  if (!env.CONTROL_PLANE_URL || !env.CONTROL_PLANE_API_KEY || !env.INSTANCE_ID) {
    return;
  }

  try {
    const metrics = await collectHealthMetrics();

    const report: HealthReport = {
      instanceId: env.INSTANCE_ID,
      timestamp: new Date().toISOString(),
      status: "healthy",
      metrics,
    };

    const response = await fetch(
      `${env.CONTROL_PLANE_URL}/api/instances/${env.INSTANCE_ID}/health`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.CONTROL_PLANE_API_KEY}`,
        },
        body: JSON.stringify(report),
      }
    );

    if (!response.ok) {
      logger.warn("Health report rejected by control plane", {
        status: response.status,
        instanceId: env.INSTANCE_ID,
      });
      return;
    }

    logger.debug("Health report sent", {
      instanceId: env.INSTANCE_ID,
      metrics,
    });
  } catch (error) {
    // Log but don't throw - health reporting should not crash the app
    logger.error("Failed to report health to control plane", {
      error: error instanceof Error ? error.message : String(error),
      instanceId: env.INSTANCE_ID,
    });
  }
}

/**
 * Start the health reporter with periodic reporting.
 * Reports every 5 minutes, with an initial report after 30 seconds.
 */
export function startHealthReporter(): void {
  // Skip if not configured
  if (!env.CONTROL_PLANE_URL || !env.CONTROL_PLANE_API_KEY || !env.INSTANCE_ID) {
    logger.debug("Health reporter disabled - control plane not configured");
    return;
  }

  logger.info("Health reporter started", {
    instanceId: env.INSTANCE_ID,
    controlPlane: env.CONTROL_PLANE_URL,
  });

  // Initial report after 30 seconds (allow app to stabilize)
  setTimeout(() => {
    reportHealth();
  }, 30000);

  // Report every 5 minutes
  setInterval(() => {
    reportHealth();
  }, 5 * 60 * 1000);
}
