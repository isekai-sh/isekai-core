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
 * Calculate the next run time for an automation based on its schedule rules
 */
export function calculateNextRunTime(automation: any): Date | null {
  if (!automation?.enabled || !automation?.scheduleRules) {
    return null;
  }

  const activeRules = automation.scheduleRules.filter((rule: any) => rule.enabled);
  if (activeRules.length === 0) {
    return null;
  }

  const now = new Date();
  let earliestRunTime: Date | null = null;

  for (const rule of activeRules) {
    let nextRunTime: Date | null = null;

    if (rule.type === 'fixed_time') {
      // Calculate next occurrence of this time
      nextRunTime = calculateNextFixedTime(rule.timeOfDay, rule.daysOfWeek, now);
    } else if (rule.type === 'fixed_interval') {
      // Intervals run every X minutes, estimate next run (assuming it runs every 5 min check)
      // This is approximate since we don't know exact last execution
      nextRunTime = new Date(now.getTime() + 5 * 60 * 1000); // Next cron check (5 min)
    } else if (rule.type === 'daily_quota') {
      // Daily quota runs throughout the day, estimate next run
      nextRunTime = new Date(now.getTime() + 5 * 60 * 1000); // Next cron check (5 min)
    }

    if (nextRunTime) {
      if (!earliestRunTime || nextRunTime < earliestRunTime) {
        earliestRunTime = nextRunTime;
      }
    }
  }

  return earliestRunTime;
}

/**
 * Calculate next occurrence of a fixed time
 */
function calculateNextFixedTime(
  timeOfDay: string,
  daysOfWeek: string[] | null,
  now: Date
): Date | null {
  if (!timeOfDay) return null;

  const [hours, minutes] = timeOfDay.split(':').map(Number);
  if (isNaN(hours) || isNaN(minutes)) return null;

  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  // If no days specified, check today and tomorrow
  if (!daysOfWeek || daysOfWeek.length === 0) {
    const today = new Date(now);
    today.setHours(hours, minutes, 0, 0);

    if (today > now) {
      return today; // Today at this time
    } else {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow; // Tomorrow at this time
    }
  }

  // Find next occurrence on allowed days
  for (let i = 0; i < 7; i++) {
    const candidate = new Date(now);
    candidate.setDate(candidate.getDate() + i);
    candidate.setHours(hours, minutes, 0, 0);

    const dayName = dayNames[candidate.getDay()];

    if (daysOfWeek.includes(dayName) && candidate > now) {
      return candidate;
    }
  }

  return null;
}

/**
 * Format next run time for display
 */
export function formatNextRunTime(automation: any): string {
  const nextRun = calculateNextRunTime(automation);

  if (!nextRun) {
    return 'Not scheduled';
  }

  const now = new Date();
  const diffMs = nextRun.getTime() - now.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) {
    return 'In < 1 min';
  } else if (diffMinutes < 60) {
    return `In ${diffMinutes} min`;
  } else if (diffHours < 24) {
    return `In ${diffHours}h`;
  } else if (diffDays < 7) {
    return `In ${diffDays}d`;
  } else {
    // Show actual date if more than a week away
    return nextRun.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
