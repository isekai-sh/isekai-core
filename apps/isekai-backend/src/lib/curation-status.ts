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
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 */

import type { Prisma } from '../db/index.js';

export type CurationScope = 'uncurated' | 'curated' | 'all';

export function curationScopeFilter(scope: CurationScope): Prisma.DeviationWhereInput {
  if (scope === 'uncurated') {
    return {
      OR: [
        { curationStatus: 'uncurated' },
        {
          curationStatus: null,
          ingestSource: 'direct_to_draft',
          curatedAt: null,
        },
      ],
    };
  }

  if (scope === 'curated') {
    return {
      OR: [
        { curationStatus: 'curated' },
        {
          AND: [
            { curationStatus: null },
            {
              OR: [
                { curatedAt: { not: null } },
                { ingestSource: null },
                { ingestSource: { not: 'direct_to_draft' } },
              ],
            },
          ],
        },
      ],
    };
  }

  return {};
}
