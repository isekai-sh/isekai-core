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
 * Administrative and system limits configuration
 */

export const ADMIN_LIMITS = {
  // Credit limits (in cents)
  MAX_CREDIT_ADD: 1_000_000, // $10,000 maximum single credit addition
  MAX_CREDIT_DEDUCT: 1_000_000, // $10,000 maximum single credit deduction

  // Gift limits
  MAX_GIFT_DURATION_MONTHS: 24, // 2 years maximum gift duration
  MIN_GIFT_DURATION_MONTHS: 1, // Minimum 1 month

  // Bulk operation limits
  MAX_BULK_USERS: 100,

  // Rate limiting
  ADMIN_ACTION_WINDOW_MS: 60_000, // 1 minute window
  ADMIN_MAX_ACTIONS_PER_WINDOW: 50, // 50 actions per minute
};

/**
 * Validate credit amount for admin operations
 */
export function validateCreditAmount(amount: number, operation: 'add' | 'deduct'): void {
  if (!amount || amount <= 0) {
    throw new Error('Amount must be a positive number');
  }

  const maxLimit =
    operation === 'add' ? ADMIN_LIMITS.MAX_CREDIT_ADD : ADMIN_LIMITS.MAX_CREDIT_DEDUCT;

  if (amount > maxLimit) {
    throw new Error(
      `Amount exceeds maximum allowed for ${operation} operation: ${maxLimit} cents ($${
        maxLimit / 100
      })`
    );
  }
}

/**
 * Validate gift duration
 */
export function validateGiftDuration(months: number): void {
  if (months < ADMIN_LIMITS.MIN_GIFT_DURATION_MONTHS) {
    throw new Error(
      `Gift duration must be at least ${ADMIN_LIMITS.MIN_GIFT_DURATION_MONTHS} month(s)`
    );
  }

  if (months > ADMIN_LIMITS.MAX_GIFT_DURATION_MONTHS) {
    throw new Error(`Gift duration cannot exceed ${ADMIN_LIMITS.MAX_GIFT_DURATION_MONTHS} months`);
  }
}
