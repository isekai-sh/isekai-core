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
 * Get the user's timezone abbreviation (e.g., "PST", "EST", "WIB")
 */
export function getTimezoneAbbreviation(): string {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const date = new Date();

  // Get the short timezone name
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    timeZoneName: 'short',
  });

  const parts = formatter.formatToParts(date);
  const timeZonePart = parts.find((part) => part.type === 'timeZoneName');

  return timeZonePart?.value || 'Local';
}

/**
 * Get the user's full timezone name (e.g., "Asia/Jakarta", "America/New_York")
 */
export function getTimezoneName(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Format a date with timezone indicator
 */
export function formatWithTimezone(
  date: Date | string,
  options?: Intl.DateTimeFormatOptions
): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const formatted = dateObj.toLocaleString(undefined, options);
  const tz = getTimezoneAbbreviation();
  return `${formatted} ${tz}`;
}

/**
 * Get UTC offset string (e.g., "UTC+7", "UTC-5")
 */
export function getUTCOffset(): string {
  const offset = -new Date().getTimezoneOffset() / 60;
  const sign = offset >= 0 ? '+' : '';
  return `UTC${sign}${offset}`;
}

/**
 * Format seconds into a human-readable duration
 * Examples: 30s, 1m 30s, 2m, 5m
 */
export function formatJitterSeconds(seconds: number): string {
  if (seconds === 0) return '0s';

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes === 0) {
    return `${remainingSeconds}s`;
  }

  if (remainingSeconds === 0) {
    return `${minutes}m`;
  }

  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Format date-time in ISO-style with timezone
 * Format: YYYY-MM-DD, HH:MM:SS AM/PM TZ
 * Example: 2025-12-31, 11:00:00 PM WIB
 */
export function formatScheduleDateTime(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;

  // Format date as YYYY-MM-DD
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  const datePart = `${year}-${month}-${day}`;

  // Format time as HH:MM:SS AM/PM
  const timePart = dateObj.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  // Get timezone abbreviation
  const tz = getTimezoneAbbreviation();

  return `${datePart}, ${timePart} ${tz}`;
}

/**
 * Format date-time (short version without seconds)
 * Format: YYYY-MM-DD, HH:MM AM/PM TZ
 * Example: 2025-12-31, 11:00 PM WIB
 */
export function formatScheduleDateTimeShort(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;

  // Format date as YYYY-MM-DD
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  const datePart = `${year}-${month}-${day}`;

  // Format time as HH:MM AM/PM
  const timePart = dateObj.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  // Get timezone abbreviation
  const tz = getTimezoneAbbreviation();

  return `${datePart}, ${timePart} ${tz}`;
}
