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

import { beforeAll } from 'vitest';

beforeAll(() => {
  // Increase max listeners to avoid warnings from multiple test files
  // registering event handlers (especially for SIGTERM in cron jobs)
  process.setMaxListeners(50);

  // Filter process warnings
  const originalEmit = process.emit;
  // @ts-ignore - process.emit type doesn't match perfectly
  process.emit = function (event: any, ...args: any[]) {
    if (
      event === 'warning' &&
      args[0]?.name === 'MaxListenersExceededWarning'
    ) {
      return false;
    }
    return originalEmit.apply(process, [event, ...args]);
  };
});
