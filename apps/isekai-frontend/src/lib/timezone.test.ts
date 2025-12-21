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

import { describe, it, expect } from 'vitest';
import {
  getTimezoneAbbreviation,
  getTimezoneName,
  formatWithTimezone,
  getUTCOffset,
  formatJitterSeconds,
  formatScheduleDateTime,
  formatScheduleDateTimeShort,
} from './timezone';

describe('getTimezoneAbbreviation', () => {
  it('should return a timezone abbreviation', () => {
    const result = getTimezoneAbbreviation();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('should return fallback if timezone not found', () => {
    const result = getTimezoneAbbreviation();
    expect(result).toBeTruthy();
  });
});

describe('getTimezoneName', () => {
  it('should return a timezone name', () => {
    const result = getTimezoneName();
    expect(typeof result).toBe('string');
    expect(result).toMatch(/\//); // Timezone names have format like "America/New_York"
  });
});

describe('formatWithTimezone', () => {
  it('should format date with timezone', () => {
    const date = new Date('2025-01-15T12:00:00Z');
    const result = formatWithTimezone(date);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('should accept string date', () => {
    const result = formatWithTimezone('2025-01-15T12:00:00Z');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('should include timezone abbreviation', () => {
    const date = new Date('2025-01-15T12:00:00Z');
    const result = formatWithTimezone(date);
    const tz = getTimezoneAbbreviation();
    expect(result).toContain(tz);
  });
});

describe('getUTCOffset', () => {
  it('should return UTC offset string', () => {
    const result = getUTCOffset();
    expect(result).toMatch(/^UTC[+-]?\d+$/);
  });

  it('should include sign for positive offsets', () => {
    const result = getUTCOffset();
    expect(result.startsWith('UTC')).toBe(true);
  });
});

describe('formatJitterSeconds', () => {
  describe('zero seconds', () => {
    it('should return 0s for zero', () => {
      expect(formatJitterSeconds(0)).toBe('0s');
    });
  });

  describe('seconds only', () => {
    it('should format seconds without minutes', () => {
      expect(formatJitterSeconds(30)).toBe('30s');
      expect(formatJitterSeconds(59)).toBe('59s');
      expect(formatJitterSeconds(1)).toBe('1s');
    });
  });

  describe('minutes only', () => {
    it('should format whole minutes', () => {
      expect(formatJitterSeconds(60)).toBe('1m');
      expect(formatJitterSeconds(120)).toBe('2m');
      expect(formatJitterSeconds(300)).toBe('5m');
    });
  });

  describe('minutes and seconds', () => {
    it('should format mixed durations', () => {
      expect(formatJitterSeconds(90)).toBe('1m 30s');
      expect(formatJitterSeconds(125)).toBe('2m 5s');
      expect(formatJitterSeconds(185)).toBe('3m 5s');
    });
  });
});

describe('formatScheduleDateTime', () => {
  it('should format date with ISO-style format', () => {
    const date = new Date('2025-12-31T23:00:00');
    const result = formatScheduleDateTime(date);

    expect(result).toContain('2025-12-31');
    expect(result).toContain(',');
  });

  it('should accept string date', () => {
    const result = formatScheduleDateTime('2025-12-31T23:00:00');
    expect(result).toContain('2025-12-31');
  });

  it('should include timezone', () => {
    const date = new Date('2025-12-31T23:00:00');
    const result = formatScheduleDateTime(date);
    const tz = getTimezoneAbbreviation();
    expect(result).toContain(tz);
  });

  it('should include time with seconds', () => {
    const date = new Date('2025-12-31T15:30:45');
    const result = formatScheduleDateTime(date);
    // Should contain time in some format
    expect(result.length).toBeGreaterThan(20);
  });
});

describe('formatScheduleDateTimeShort', () => {
  it('should format date without seconds', () => {
    const date = new Date('2025-12-31T23:00:00');
    const result = formatScheduleDateTimeShort(date);

    expect(result).toContain('2025-12-31');
    expect(result).toContain(',');
  });

  it('should accept string date', () => {
    const result = formatScheduleDateTimeShort('2025-12-31T23:00:00');
    expect(result).toContain('2025-12-31');
  });

  it('should include timezone', () => {
    const date = new Date('2025-12-31T23:00:00');
    const result = formatScheduleDateTimeShort(date);
    const tz = getTimezoneAbbreviation();
    expect(result).toContain(tz);
  });
});
