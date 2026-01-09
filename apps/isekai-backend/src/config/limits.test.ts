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
import { ADMIN_LIMITS, validateCreditAmount, validateGiftDuration } from './limits.js';

describe('ADMIN_LIMITS', () => {
  it('should define credit limits', () => {
    expect(ADMIN_LIMITS.MAX_CREDIT_ADD).toBe(1_000_000);
    expect(ADMIN_LIMITS.MAX_CREDIT_DEDUCT).toBe(1_000_000);
  });

  it('should define gift duration limits', () => {
    expect(ADMIN_LIMITS.MAX_GIFT_DURATION_MONTHS).toBe(24);
    expect(ADMIN_LIMITS.MIN_GIFT_DURATION_MONTHS).toBe(1);
  });

  it('should define bulk operation limits', () => {
    expect(ADMIN_LIMITS.MAX_BULK_USERS).toBe(100);
  });

  it('should define rate limiting configuration', () => {
    expect(ADMIN_LIMITS.ADMIN_ACTION_WINDOW_MS).toBe(60_000);
    expect(ADMIN_LIMITS.ADMIN_MAX_ACTIONS_PER_WINDOW).toBe(50);
  });
});

describe('validateCreditAmount', () => {
  describe('add operation', () => {
    it('should accept valid amounts', () => {
      expect(() => validateCreditAmount(1, 'add')).not.toThrow();
      expect(() => validateCreditAmount(100, 'add')).not.toThrow();
      expect(() => validateCreditAmount(50_000, 'add')).not.toThrow();
      expect(() => validateCreditAmount(1_000_000, 'add')).not.toThrow();
    });

    it('should accept amount equal to MAX_CREDIT_ADD', () => {
      expect(() => validateCreditAmount(ADMIN_LIMITS.MAX_CREDIT_ADD, 'add')).not.toThrow();
    });

    it('should reject amount exceeding MAX_CREDIT_ADD', () => {
      expect(() => validateCreditAmount(1_000_001, 'add')).toThrow(
        'Amount exceeds maximum allowed for add operation: 1000000 cents ($10000)'
      );
    });

    it('should reject zero amount', () => {
      expect(() => validateCreditAmount(0, 'add')).toThrow('Amount must be a positive number');
    });

    it('should reject negative amounts', () => {
      expect(() => validateCreditAmount(-100, 'add')).toThrow('Amount must be a positive number');
      expect(() => validateCreditAmount(-1, 'add')).toThrow('Amount must be a positive number');
    });
  });

  describe('deduct operation', () => {
    it('should accept valid amounts', () => {
      expect(() => validateCreditAmount(1, 'deduct')).not.toThrow();
      expect(() => validateCreditAmount(100, 'deduct')).not.toThrow();
      expect(() => validateCreditAmount(50_000, 'deduct')).not.toThrow();
      expect(() => validateCreditAmount(1_000_000, 'deduct')).not.toThrow();
    });

    it('should accept amount equal to MAX_CREDIT_DEDUCT', () => {
      expect(() => validateCreditAmount(ADMIN_LIMITS.MAX_CREDIT_DEDUCT, 'deduct')).not.toThrow();
    });

    it('should reject amount exceeding MAX_CREDIT_DEDUCT', () => {
      expect(() => validateCreditAmount(1_000_001, 'deduct')).toThrow(
        'Amount exceeds maximum allowed for deduct operation: 1000000 cents ($10000)'
      );
    });

    it('should reject zero amount', () => {
      expect(() => validateCreditAmount(0, 'deduct')).toThrow('Amount must be a positive number');
    });

    it('should reject negative amounts', () => {
      expect(() => validateCreditAmount(-100, 'deduct')).toThrow(
        'Amount must be a positive number'
      );
    });
  });

  describe('edge cases', () => {
    it('should handle very small positive amounts', () => {
      expect(() => validateCreditAmount(0.01, 'add')).not.toThrow();
      expect(() => validateCreditAmount(0.99, 'deduct')).not.toThrow();
    });

    it('should handle amounts just below the limit', () => {
      expect(() => validateCreditAmount(999_999, 'add')).not.toThrow();
      expect(() => validateCreditAmount(999_999, 'deduct')).not.toThrow();
    });

    it('should handle amounts just above the limit', () => {
      expect(() => validateCreditAmount(1_000_001, 'add')).toThrow();
      expect(() => validateCreditAmount(1_000_002, 'deduct')).toThrow();
    });

    it('should include formatted dollar amount in error message', () => {
      try {
        validateCreditAmount(2_000_000, 'add');
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).toContain('$10000');
      }
    });
  });
});

describe('validateGiftDuration', () => {
  describe('valid durations', () => {
    it('should accept minimum duration', () => {
      expect(() => validateGiftDuration(ADMIN_LIMITS.MIN_GIFT_DURATION_MONTHS)).not.toThrow();
    });

    it('should accept maximum duration', () => {
      expect(() => validateGiftDuration(ADMIN_LIMITS.MAX_GIFT_DURATION_MONTHS)).not.toThrow();
    });

    it('should accept durations within range', () => {
      expect(() => validateGiftDuration(1)).not.toThrow();
      expect(() => validateGiftDuration(6)).not.toThrow();
      expect(() => validateGiftDuration(12)).not.toThrow();
      expect(() => validateGiftDuration(18)).not.toThrow();
      expect(() => validateGiftDuration(24)).not.toThrow();
    });
  });

  describe('invalid durations', () => {
    it('should reject duration below minimum', () => {
      expect(() => validateGiftDuration(0)).toThrow('Gift duration must be at least 1 month(s)');
    });

    it('should reject negative durations', () => {
      expect(() => validateGiftDuration(-1)).toThrow('Gift duration must be at least 1 month(s)');
      expect(() => validateGiftDuration(-10)).toThrow('Gift duration must be at least 1 month(s)');
    });

    it('should reject duration above maximum', () => {
      expect(() => validateGiftDuration(25)).toThrow('Gift duration cannot exceed 24 months');
      expect(() => validateGiftDuration(100)).toThrow('Gift duration cannot exceed 24 months');
    });
  });

  describe('edge cases', () => {
    it('should reject duration just below minimum', () => {
      expect(() => validateGiftDuration(ADMIN_LIMITS.MIN_GIFT_DURATION_MONTHS - 1)).toThrow();
    });

    it('should reject duration just above maximum', () => {
      expect(() => validateGiftDuration(ADMIN_LIMITS.MAX_GIFT_DURATION_MONTHS + 1)).toThrow();
    });

    it('should accept duration at exact boundaries', () => {
      expect(() => validateGiftDuration(1)).not.toThrow();
      expect(() => validateGiftDuration(24)).not.toThrow();
    });

    it('should include limit values in error messages', () => {
      try {
        validateGiftDuration(0);
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).toContain('1 month');
      }

      try {
        validateGiftDuration(100);
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).toContain('24 months');
      }
    });
  });
});
