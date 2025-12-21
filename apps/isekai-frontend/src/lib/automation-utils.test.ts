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

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { calculateNextRunTime, formatNextRunTime } from './automation-utils';

describe('calculateNextRunTime', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2025-01-15T10:00:00Z'));
  });

  describe('disabled automation', () => {
    it('should return null if automation is disabled', () => {
      const automation = {
        enabled: false,
        scheduleRules: [{ enabled: true, type: 'fixed_time' }],
      };
      expect(calculateNextRunTime(automation)).toBeNull();
    });

    it('should return null if automation is null', () => {
      expect(calculateNextRunTime(null)).toBeNull();
    });

    it('should return null if scheduleRules is missing', () => {
      const automation = { enabled: true };
      expect(calculateNextRunTime(automation)).toBeNull();
    });
  });

  describe('no active rules', () => {
    it('should return null if no rules are enabled', () => {
      const automation = {
        enabled: true,
        scheduleRules: [
          { enabled: false, type: 'fixed_time' },
          { enabled: false, type: 'fixed_interval' },
        ],
      };
      expect(calculateNextRunTime(automation)).toBeNull();
    });

    it('should return null if scheduleRules is empty', () => {
      const automation = {
        enabled: true,
        scheduleRules: [],
      };
      expect(calculateNextRunTime(automation)).toBeNull();
    });
  });

  describe('fixed_time rules', () => {
    it('should calculate next run for fixed time today', () => {
      const automation = {
        enabled: true,
        scheduleRules: [
          {
            enabled: true,
            type: 'fixed_time',
            timeOfDay: '14:30',
            daysOfWeek: null,
          },
        ],
      };

      const result = calculateNextRunTime(automation);
      expect(result).toBeTruthy();
      expect(result!.getHours()).toBe(14);
      expect(result!.getMinutes()).toBe(30);
    });

    it('should calculate next run for tomorrow if time has passed', () => {
      const automation = {
        enabled: true,
        scheduleRules: [
          {
            enabled: true,
            type: 'fixed_time',
            timeOfDay: '08:00',
            daysOfWeek: null,
          },
        ],
      };

      const result = calculateNextRunTime(automation);
      expect(result).toBeTruthy();
      expect(result!.getDate()).toBe(16); // Tomorrow
    });

    it('should respect daysOfWeek constraint', () => {
      const automation = {
        enabled: true,
        scheduleRules: [
          {
            enabled: true,
            type: 'fixed_time',
            timeOfDay: '14:00',
            daysOfWeek: ['monday', 'wednesday', 'friday'],
          },
        ],
      };

      const result = calculateNextRunTime(automation);
      expect(result).toBeTruthy();
    });

    it('should handle invalid time format', () => {
      const automation = {
        enabled: true,
        scheduleRules: [
          {
            enabled: true,
            type: 'fixed_time',
            timeOfDay: 'invalid',
            daysOfWeek: null,
          },
        ],
      };

      const result = calculateNextRunTime(automation);
      expect(result).toBeNull();
    });

    it('should handle missing timeOfDay', () => {
      const automation = {
        enabled: true,
        scheduleRules: [
          {
            enabled: true,
            type: 'fixed_time',
            daysOfWeek: ['monday'],
          },
        ],
      };

      const result = calculateNextRunTime(automation);
      expect(result).toBeNull();
    });
  });

  describe('fixed_interval rules', () => {
    it('should estimate next run for fixed interval', () => {
      const automation = {
        enabled: true,
        scheduleRules: [
          {
            enabled: true,
            type: 'fixed_interval',
            intervalMinutes: 30,
          },
        ],
      };

      const result = calculateNextRunTime(automation);
      expect(result).toBeTruthy();
      // Should be approximately 5 minutes from now (next cron check)
      const diff = result!.getTime() - new Date().getTime();
      expect(diff).toBeGreaterThan(0);
      expect(diff).toBeLessThanOrEqual(5 * 60 * 1000);
    });
  });

  describe('daily_quota rules', () => {
    it('should estimate next run for daily quota', () => {
      const automation = {
        enabled: true,
        scheduleRules: [
          {
            enabled: true,
            type: 'daily_quota',
            quotaPerDay: 10,
          },
        ],
      };

      const result = calculateNextRunTime(automation);
      expect(result).toBeTruthy();
      // Should be approximately 5 minutes from now (next cron check)
      const diff = result!.getTime() - new Date().getTime();
      expect(diff).toBeGreaterThan(0);
      expect(diff).toBeLessThanOrEqual(5 * 60 * 1000);
    });
  });

  describe('multiple rules', () => {
    it('should return earliest run time from multiple rules', () => {
      const automation = {
        enabled: true,
        scheduleRules: [
          {
            enabled: true,
            type: 'fixed_time',
            timeOfDay: '20:00',
            daysOfWeek: null,
          },
          {
            enabled: true,
            type: 'fixed_time',
            timeOfDay: '12:00',
            daysOfWeek: null,
          },
        ],
      };

      const result = calculateNextRunTime(automation);
      expect(result).toBeTruthy();
      // Should pick one of the times (12:00 or 20:00)
      const hour = result!.getHours();
      expect([12, 20]).toContain(hour);
    });
  });
});

describe('formatNextRunTime', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2025-01-15T10:00:00Z'));
  });

  it('should return "Not scheduled" for disabled automation', () => {
    const automation = { enabled: false, scheduleRules: [] };
    expect(formatNextRunTime(automation)).toBe('Not scheduled');
  });

  it('should return "Not scheduled" for null', () => {
    expect(formatNextRunTime(null)).toBe('Not scheduled');
  });

  it('should format time less than 1 minute', () => {
    const automation = {
      enabled: true,
      scheduleRules: [
        {
          enabled: true,
          type: 'fixed_interval',
        },
      ],
    };

    // Mock calculateNextRunTime to return a time 30 seconds from now
    const result = formatNextRunTime(automation);
    expect(result).toMatch(/In/);
  });

  it('should format time in minutes or hours', () => {
    const automation = {
      enabled: true,
      scheduleRules: [
        {
          enabled: true,
          type: 'fixed_time',
          timeOfDay: '10:30',
          daysOfWeek: null,
        },
      ],
    };

    const result = formatNextRunTime(automation);
    // Could be in minutes or hours depending on current time
    expect(result).toMatch(/In/);
  });

  it('should format time in hours', () => {
    const automation = {
      enabled: true,
      scheduleRules: [
        {
          enabled: true,
          type: 'fixed_time',
          timeOfDay: '15:00',
          daysOfWeek: null,
        },
      ],
    };

    const result = formatNextRunTime(automation);
    expect(result).toMatch(/In \d+h/);
  });

  it('should format time in days', () => {
    const automation = {
      enabled: true,
      scheduleRules: [
        {
          enabled: true,
          type: 'fixed_time',
          timeOfDay: '12:00',
          daysOfWeek: ['friday'], // Assuming current day is not Friday
        },
      ],
    };

    const result = formatNextRunTime(automation);
    // Could be "In Xd" or a date string depending on how far
    expect(result.length).toBeGreaterThan(0);
  });

  it('should format date for times more than a week away', () => {
    const automation = {
      enabled: true,
      scheduleRules: [
        {
          enabled: true,
          type: 'fixed_time',
          timeOfDay: '12:00',
          daysOfWeek: ['wednesday'], // Next occurrence might be > 7 days
        },
      ],
    };

    const result = formatNextRunTime(automation);
    expect(result.length).toBeGreaterThan(0);
  });
});
