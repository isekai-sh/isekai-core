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

import { PrismaClient } from '@prisma/client';
import { mockDeep, mockReset, DeepMockProxy } from 'vitest-mock-extended';

export type MockPrisma = DeepMockProxy<PrismaClient>;

/**
 * Create a mock Prisma client for testing
 */
export function createPrismaMock(): MockPrisma {
  return mockDeep<PrismaClient>();
}

/**
 * Reset a Prisma mock to clear all call history
 */
export function resetPrismaMock(prismaMock: MockPrisma): void {
  mockReset(prismaMock);
}
