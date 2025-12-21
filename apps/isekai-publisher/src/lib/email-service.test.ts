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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Resend before imports
const mockSend = vi.fn();

vi.mock('resend', () => ({
  Resend: class {
    emails = {
      send: mockSend,
    };
  },
}));

// Mock env
vi.mock('./env.js', () => ({
  env: {
    RESEND_API_KEY: 're_test_key_123',
    EMAIL_FROM: 'noreply@isekai.sh',
    FRONTEND_URL: 'https://isekai.sh',
  },
}));

// Import after mocks are set up
import {
  sendRefreshTokenWarningEmail,
  sendRefreshTokenExpiredEmail,
  sendRefreshTokenExpiredJobNotification,
} from './email-service.js';

describe('email-service', () => {
  let consoleSpy: {
    log: any;
    error: any;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createUser = (overrides = {}) => ({
    id: 'user-123',
    username: 'testuser',
    email: 'test@example.com',
    ...overrides,
  });

  describe('sendRefreshTokenWarningEmail', () => {
    it('should send warning email successfully', async () => {
      mockSend.mockResolvedValueOnce({ id: 'email-123' });

      const user = createUser();

      await sendRefreshTokenWarningEmail(user, 7, 5);

      expect(mockSend).toHaveBeenCalledWith({
        from: 'noreply@isekai.sh',
        to: 'test@example.com',
        subject: 'Action Required: Your DeviantArt connection expires in 7 days',
        html: expect.stringContaining('Your DeviantArt Connection is Expiring Soon'),
      });
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Sent warning email to testuser')
      );
    });

    it('should include correct days and post count in email', async () => {
      mockSend.mockResolvedValueOnce({ id: 'email-123' });

      const user = createUser();

      await sendRefreshTokenWarningEmail(user, 3, 12);

      const call = mockSend.mock.calls[0][0];
      expect(call.subject).toContain('3 days');
      expect(call.html).toContain('3 days');
      expect(call.html).toContain('12 scheduled posts');
    });

    it('should use singular "post" for 1 scheduled post', async () => {
      mockSend.mockResolvedValueOnce({ id: 'email-123' });

      const user = createUser();

      await sendRefreshTokenWarningEmail(user, 7, 1);

      const call = mockSend.mock.calls[0][0];
      expect(call.html).toContain('1 scheduled post');
      expect(call.html).not.toContain('1 scheduled posts');
    });

    it('should skip email when user has no email address', async () => {
      const { sendRefreshTokenWarningEmail } = await import('./email-service.js');
      const user = createUser({ email: null });

      await sendRefreshTokenWarningEmail(user, 7, 5);

      expect(mockSend).not.toHaveBeenCalled();
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Skipping warning email for testuser - no email address')
      );
    });

    it('should handle send errors gracefully', async () => {
      const error = new Error('Resend API error');
      mockSend.mockRejectedValueOnce(error);

      const user = createUser();

      await sendRefreshTokenWarningEmail(user, 7, 5);

      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send warning email to testuser'),
        error
      );
    });

    it('should include frontend URL in email', async () => {
      mockSend.mockResolvedValueOnce({ id: 'email-123' });

      const user = createUser();

      await sendRefreshTokenWarningEmail(user, 7, 5);

      const call = mockSend.mock.calls[0][0];
      expect(call.html).toContain('https://isekai.sh/settings');
    });
  });

  describe('sendRefreshTokenExpiredEmail', () => {
    it('should send expired email successfully', async () => {
      mockSend.mockResolvedValueOnce({ id: 'email-456' });

      const user = createUser();

      await sendRefreshTokenExpiredEmail(user, 8);

      expect(mockSend).toHaveBeenCalledWith({
        from: 'noreply@isekai.sh',
        to: 'test@example.com',
        subject: 'Urgent: Your DeviantArt connection has expired',
        html: expect.stringContaining('Your DeviantArt Connection Has Expired'),
      });
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Sent expired email to testuser')
      );
    });

    it('should include correct post count in email', async () => {
      mockSend.mockResolvedValueOnce({ id: 'email-456' });

      const user = createUser();

      await sendRefreshTokenExpiredEmail(user, 15);

      const call = mockSend.mock.calls[0][0];
      expect(call.html).toContain('15 scheduled posts');
    });

    it('should use singular "post" for 1 scheduled post', async () => {
      mockSend.mockResolvedValueOnce({ id: 'email-456' });

      const user = createUser();

      await sendRefreshTokenExpiredEmail(user, 1);

      const call = mockSend.mock.calls[0][0];
      expect(call.html).toContain('1 scheduled post');
      expect(call.html).not.toContain('1 scheduled posts');
    });

    it('should skip email when user has no email address', async () => {
      const { sendRefreshTokenExpiredEmail } = await import('./email-service.js');
      const user = createUser({ email: null });

      await sendRefreshTokenExpiredEmail(user, 8);

      expect(mockSend).not.toHaveBeenCalled();
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Skipping expired email for testuser - no email address')
      );
    });

    it('should handle send errors gracefully', async () => {
      const error = new Error('Network timeout');
      mockSend.mockRejectedValueOnce(error);

      const user = createUser();

      await sendRefreshTokenExpiredEmail(user, 8);

      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send expired email to testuser'),
        error
      );
    });

    it('should include frontend URL in email', async () => {
      mockSend.mockResolvedValueOnce({ id: 'email-456' });

      const user = createUser();

      await sendRefreshTokenExpiredEmail(user, 8);

      const call = mockSend.mock.calls[0][0];
      expect(call.html).toContain('https://isekai.sh/settings');
    });
  });

  describe('sendRefreshTokenExpiredJobNotification', () => {
    it('should send job failure email successfully', async () => {
      mockSend.mockResolvedValueOnce({ id: 'email-789' });

      const user = createUser();

      await sendRefreshTokenExpiredJobNotification(user, 'My Awesome Artwork');

      expect(mockSend).toHaveBeenCalledWith({
        from: 'noreply@isekai.sh',
        to: 'test@example.com',
        subject: 'Publishing Failed: "My Awesome Artwork" - Authentication Required',
        html: expect.stringContaining('Publishing Failed - Authentication Expired'),
      });
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Sent job failure email to testuser')
      );
    });

    it('should include deviation title in email', async () => {
      mockSend.mockResolvedValueOnce({ id: 'email-789' });

      const user = createUser();

      await sendRefreshTokenExpiredJobNotification(user, 'Special Character Art');

      const call = mockSend.mock.calls[0][0];
      expect(call.subject).toContain('Special Character Art');
      expect(call.html).toContain('Special Character Art');
    });

    it('should skip email when user has no email address', async () => {
      const user = createUser({ email: null });

      await sendRefreshTokenExpiredJobNotification(user, 'My Artwork');

      expect(mockSend).not.toHaveBeenCalled();
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Skipping job failure email for testuser - no email address')
      );
    });

    it('should handle send errors gracefully', async () => {
      const error = new Error('Service unavailable');
      mockSend.mockRejectedValueOnce(error);

      const user = createUser();

      await sendRefreshTokenExpiredJobNotification(user, 'My Artwork');

      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send job failure email to testuser'),
        error
      );
    });

    it('should link to drafts page instead of settings', async () => {
      mockSend.mockResolvedValueOnce({ id: 'email-789' });

      const user = createUser();

      await sendRefreshTokenExpiredJobNotification(user, 'My Artwork');

      const call = mockSend.mock.calls[0][0];
      expect(call.html).toContain('https://isekai.sh/drafts');
    });
  });

});
