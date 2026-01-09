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

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AppError, errorHandler } from './error.js';
import {
  createMockRequest,
  createMockResponse,
  createMockNext,
} from '../test-helpers/express-mock.js';

describe('AppError', () => {
  it('should create an AppError with status code and message', () => {
    const error = new AppError(404, 'Not found');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(404);
    expect(error.message).toBe('Not found');
    expect(error.name).toBe('AppError');
  });

  it('should create an AppError with upgradeRequired flag', () => {
    const error = new AppError(402, 'Payment required', true);

    expect(error.statusCode).toBe(402);
    expect(error.message).toBe('Payment required');
    expect(error.upgradeRequired).toBe(true);
  });

  it('should create an AppError without upgradeRequired flag', () => {
    const error = new AppError(400, 'Bad request');

    expect(error.upgradeRequired).toBeUndefined();
  });

  it('should have correct name property', () => {
    const error = new AppError(500, 'Server error');

    expect(error.name).toBe('AppError');
  });

  it('should be throwable', () => {
    expect(() => {
      throw new AppError(403, 'Forbidden');
    }).toThrow(AppError);
  });
});

describe('errorHandler', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    originalNodeEnv = process.env.NODE_ENV;
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  describe('AppError handling', () => {
    it('should handle AppError with correct status code', () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();
      const error = new AppError(404, 'Resource not found');

      errorHandler(error, req as any, res as any, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: 'AppError',
        message: 'Resource not found',
        upgradeRequired: undefined,
      });
    });

    it('should include upgradeRequired in response when set', () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();
      const error = new AppError(402, 'Upgrade required', true);

      errorHandler(error, req as any, res as any, next);

      expect(res.status).toHaveBeenCalledWith(402);
      expect(res.json).toHaveBeenCalledWith({
        error: 'AppError',
        message: 'Upgrade required',
        upgradeRequired: true,
      });
    });

    it('should log the error', () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();
      const error = new AppError(400, 'Bad request');

      errorHandler(error, req as any, res as any, next);

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error:', error);
    });

    it('should handle different status codes', () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      const statusCodes = [400, 401, 403, 404, 422, 500, 503];

      statusCodes.forEach((statusCode) => {
        vi.clearAllMocks();
        const error = new AppError(statusCode, `Error ${statusCode}`);

        errorHandler(error, req as any, res as any, next);

        expect(res.status).toHaveBeenCalledWith(statusCode);
      });
    });
  });

  describe('Generic error handling', () => {
    it('should handle generic Error with 500 status', () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();
      const error = new Error('Unexpected error');

      errorHandler(error, req as any, res as any, next);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('should show error message in development mode', () => {
      process.env.NODE_ENV = 'development';

      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();
      const error = new Error('Database connection failed');

      errorHandler(error, req as any, res as any, next);

      expect(res.json).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        message: 'Database connection failed',
      });
    });

    it('should hide error message in production mode', () => {
      process.env.NODE_ENV = 'production';

      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();
      const error = new Error('Sensitive database error');

      errorHandler(error, req as any, res as any, next);

      expect(res.json).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        message: 'Something went wrong',
      });
    });

    it('should hide error message in test mode', () => {
      process.env.NODE_ENV = 'test';

      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();
      const error = new Error('Test error details');

      errorHandler(error, req as any, res as any, next);

      expect(res.json).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        message: 'Something went wrong',
      });
    });

    it('should log generic errors', () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();
      const error = new Error('Generic error');

      errorHandler(error, req as any, res as any, next);

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error:', error);
    });
  });

  describe('edge cases', () => {
    it('should handle errors with no message', () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();
      const error = new Error();

      errorHandler(error, req as any, res as any, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalled();
    });

    it('should handle AppError with 0 status code', () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();
      const error = new AppError(0, 'Invalid status');

      errorHandler(error, req as any, res as any, next);

      expect(res.status).toHaveBeenCalledWith(0);
    });

    it('should handle AppError with very high status code', () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();
      const error = new AppError(999, 'Custom status');

      errorHandler(error, req as any, res as any, next);

      expect(res.status).toHaveBeenCalledWith(999);
    });

    it('should handle thrown objects that are not Error instances', () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();
      const error = { message: 'Not an Error object' } as any;

      errorHandler(error, req as any, res as any, next);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('response format', () => {
    it('should return JSON response for AppError', () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();
      const error = new AppError(400, 'Validation failed');

      errorHandler(error, req as any, res as any, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(String),
          message: expect.any(String),
        })
      );
    });

    it('should return JSON response for generic Error', () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();
      const error = new Error('Something broke');

      errorHandler(error, req as any, res as any, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Internal Server Error',
          message: expect.any(String),
        })
      );
    });

    it('should chain status and json methods', () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();
      const error = new AppError(404, 'Not found');

      errorHandler(error, req as any, res as any, next);

      // Verify chaining works (status returns res, which has json)
      expect(res.status).toHaveBeenCalledBefore(res.json as any);
    });
  });
});
