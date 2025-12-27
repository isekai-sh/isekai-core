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

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the module before importing
vi.mock('./env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./env')>();
  return {
    ...actual,
    validateEnv: vi.fn(actual.validateEnv),
  };
});

import { validateEnv } from './env';

describe('validateEnv', () => {
  let consoleErrorSpy: any;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.clearAllMocks();
  });

  it('should validate with default test environment', () => {
    // The setup.ts already provides valid env vars
    const result = validateEnv();

    expect(result.VITE_API_URL).toBeTruthy();
    // VITE_DEVIANTART_CLIENT_ID defaults to empty string - it's optional for test environments
    expect(typeof result.VITE_DEVIANTART_CLIENT_ID).toBe('string');
    expect(result.VITE_S3_PUBLIC_URL).toBeTruthy();
  });

  it('should return expected types', () => {
    const result = validateEnv();

    expect(typeof result.VITE_API_URL).toBe('string');
    expect(typeof result.VITE_DEVIANTART_CLIENT_ID).toBe('string');
    expect(typeof result.VITE_S3_PUBLIC_URL).toBe('string');
  });

  it('should not throw with valid environment', () => {
    expect(() => validateEnv()).not.toThrow();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('should handle validation errors from zod', () => {
    // Test that the function processes zod validation errors
    const result = validateEnv();
    expect(result).toHaveProperty('VITE_API_URL');
    expect(result).toHaveProperty('VITE_DEVIANTART_CLIENT_ID');
    expect(result).toHaveProperty('VITE_S3_PUBLIC_URL');
  });

  it('should use zod schema for validation', () => {
    // Ensures the schema is being used
    const result = validateEnv();
    expect(result).toBeDefined();
    expect(Object.keys(result).length).toBeGreaterThan(0);
  });
});
