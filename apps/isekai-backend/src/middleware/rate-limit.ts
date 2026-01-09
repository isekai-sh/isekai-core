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

import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { RedisClientManager } from '../lib/redis-client.js';

// ComfyUI upload rate limit - 100 requests per 15 minutes
export const comfyUIUploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many upload requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// API key creation rate limit - 10 keys per hour
export const apiKeyCreationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: 'Too many API key creation attempts',
  standardHeaders: true,
  legacyHeaders: false,
});

// Schedule/publish rate limit - 50 operations per minute
export const scheduleRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use user ID if authenticated, otherwise don't set a custom key (will use default IP handling)
    return req.user?.id;
  },
  store: new RedisStore({
    sendCommand: async (...args: [string, ...(string | Buffer | number)[]]) => {
      const redis = await RedisClientManager.getClient();
      return redis.call(...args) as any;
    },
    prefix: 'rl:schedule:',
  }),
  message: 'Too many scheduling requests. Please try again later.',
  skip: () => process.env.DISABLE_RATE_LIMIT === 'true',
});

// Batch operations rate limit - 30 operations per 5 minutes
export const batchRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use user ID if authenticated, otherwise don't set a custom key (will use default IP handling)
    return req.user?.id;
  },
  store: new RedisStore({
    sendCommand: async (...args: [string, ...(string | Buffer | number)[]]) => {
      const redis = await RedisClientManager.getClient();
      return redis.call(...args) as any;
    },
    prefix: 'rl:batch:',
  }),
  message: 'Too many batch requests. Please try again in a few minutes.',
  skip: () => process.env.DISABLE_RATE_LIMIT === 'true',
});
