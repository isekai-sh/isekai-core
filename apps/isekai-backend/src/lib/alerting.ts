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

/**
 * Alerting Infrastructure
 *
 * Sends critical alerts to configured webhook endpoints (Slack, Discord, email, etc.)
 */

export enum AlertSeverity {
  CRITICAL = 'critical',
  WARNING = 'warning',
  INFO = 'info',
}

export interface Alert {
  severity: AlertSeverity;
  title: string;
  message: string;
  context?: Record<string, any>;
  timestamp: Date;
}

/**
 * Alert Manager
 * Sends alerts to configured webhook endpoints
 */
export class AlertManager {
  private static webhookUrl = process.env.ALERT_WEBHOOK_URL;
  private static enabled = process.env.ENABLE_ALERTS === 'true';

  /**
   * Send a critical alert
   */
  static async critical(
    title: string,
    message: string,
    context?: Record<string, any>
  ): Promise<void> {
    await this.send({
      severity: AlertSeverity.CRITICAL,
      title,
      message,
      context,
      timestamp: new Date(),
    });
  }

  /**
   * Send a warning alert
   */
  static async warning(
    title: string,
    message: string,
    context?: Record<string, any>
  ): Promise<void> {
    await this.send({
      severity: AlertSeverity.WARNING,
      title,
      message,
      context,
      timestamp: new Date(),
    });
  }

  /**
   * Send an info alert
   */
  static async info(title: string, message: string, context?: Record<string, any>): Promise<void> {
    await this.send({
      severity: AlertSeverity.INFO,
      title,
      message,
      context,
      timestamp: new Date(),
    });
  }

  /**
   * Send alert to configured webhook
   */
  private static async send(alert: Alert): Promise<void> {
    if (!this.enabled) {
      console.log(`[Alert] ${alert.severity.toUpperCase()}: ${alert.title} - ${alert.message}`);
      return;
    }

    if (!this.webhookUrl) {
      console.error('[Alert] Alert webhook URL not configured, skipping alert');
      return;
    }

    try {
      const payload = this.formatPayload(alert);

      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        console.error(`[Alert] Failed to send alert: ${response.statusText}`);
      }
    } catch (error) {
      console.error('[Alert] Error sending alert:', error);
    }
  }

  /**
   * Format alert payload for webhook
   * Compatible with Slack, Discord, and generic webhooks
   */
  private static formatPayload(alert: Alert): any {
    const emoji = this.getSeverityEmoji(alert.severity);
    const color = this.getSeverityColor(alert.severity);

    // Generic webhook payload (works with Slack, Discord, etc.)
    return {
      username: 'Isekai Alerts',
      embeds: [
        {
          title: `${emoji} ${alert.title}`,
          description: alert.message,
          color,
          fields: alert.context
            ? Object.entries(alert.context).map(([key, value]) => ({
                name: key,
                value: String(value),
                inline: true,
              }))
            : [],
          timestamp: alert.timestamp.toISOString(),
        },
      ],
    };
  }

  private static getSeverityEmoji(severity: AlertSeverity): string {
    switch (severity) {
      case AlertSeverity.CRITICAL:
        return '🚨';
      case AlertSeverity.WARNING:
        return '⚠️';
      case AlertSeverity.INFO:
        return 'ℹ️';
      default:
        return '📢';
    }
  }

  private static getSeverityColor(severity: AlertSeverity): number {
    switch (severity) {
      case AlertSeverity.CRITICAL:
        return 0xff0000; // Red
      case AlertSeverity.WARNING:
        return 0xffa500; // Orange
      case AlertSeverity.INFO:
        return 0x0099ff; // Blue
      default:
        return 0x808080; // Gray
    }
  }
}

/**
 * Pre-configured alert helpers for common scenarios
 */
export class PublisherAlerts {
  /**
   * Alert when deviation is stuck in publishing for > 15 minutes
   */
  static async stuckJob(
    deviationId: string,
    username: string,
    title: string,
    duration: number
  ): Promise<void> {
    await AlertManager.critical(
      'Deviation Stuck in Publishing',
      `A deviation has been stuck in publishing state for ${Math.round(duration / 60000)} minutes`,
      {
        deviationId,
        username,
        title,
        durationMinutes: Math.round(duration / 60000),
      }
    );
  }

  /**
   * Alert when cleanup failure rate exceeds threshold
   */
  static async highCleanupFailureRate(
    failureRate: number,
    total: number,
    failed: number
  ): Promise<void> {
    await AlertManager.critical(
      'High R2 Cleanup Failure Rate',
      `Cleanup failure rate is ${Math.round(failureRate * 100)}% (${failed}/${total} failed)`,
      {
        failureRate: `${Math.round(failureRate * 100)}%`,
        totalJobs: total,
        failedJobs: failed,
      }
    );
  }

  /**
   * Alert when circuit breaker is open for > 10 minutes
   */
  static async circuitBreakerOpen(
    userId: string,
    username: string,
    duration: number
  ): Promise<void> {
    await AlertManager.warning(
      'Circuit Breaker Open',
      `Circuit breaker has been open for ${Math.round(duration / 60000)} minutes`,
      {
        userId,
        username,
        durationMinutes: Math.round(duration / 60000),
      }
    );
  }

  /**
   * Alert when token refresh failure rate exceeds threshold
   */
  static async highTokenRefreshFailureRate(failureRate: number): Promise<void> {
    await AlertManager.warning(
      'High Token Refresh Failure Rate',
      `Token refresh failure rate is ${Math.round(failureRate * 100)}%`,
      {
        failureRate: `${Math.round(failureRate * 100)}%`,
      }
    );
  }

  /**
   * Alert when queue depth exceeds threshold
   */
  static async highQueueDepth(queueName: string, depth: number): Promise<void> {
    await AlertManager.info('High Queue Depth', `Queue '${queueName}' has ${depth} pending jobs`, {
      queueName,
      depth,
    });
  }

  /**
   * Alert when stuck job recovery rate is high
   */
  static async highStuckJobRecoveryRate(
    recoveryRate: number,
    total: number,
    recovered: number
  ): Promise<void> {
    await AlertManager.warning(
      'High Stuck Job Recovery Rate',
      `${Math.round(recoveryRate * 100)}% of jobs required recovery (${recovered}/${total})`,
      {
        recoveryRate: `${Math.round(recoveryRate * 100)}%`,
        totalJobs: total,
        recoveredJobs: recovered,
      }
    );
  }
}
