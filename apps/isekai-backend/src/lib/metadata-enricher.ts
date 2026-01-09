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

import { logger } from './logger.js';

const DEVIANTART_API_URL = 'https://www.deviantart.com/api/v1/oauth2';

export interface BrowseDeviation {
  deviationId: string;
  title: string;
  url: string;
  thumbUrl: string | null;
  previewUrl: string | null;
  author: {
    username: string;
    avatarUrl: string;
    userId: string;
  };
  stats: {
    favourites: number;
    comments: number;
  };
  publishedTime: string;
  isDownloadable: boolean;
  isMature: boolean;
  category: string | null;
  tierAccess: 'locked' | 'unlocked' | 'locked-subscribed' | null;
  isExclusive: boolean;
  isPremium: boolean;
  printId: string | null;
}

export interface EnrichmentOptions {
  includeStats?: boolean;
  includeAuthorAvatars?: boolean;
  includeTierInfo?: boolean;
  maxBatchSize?: number;
}

/**
 * Enrich deviations with metadata from DeviantArt OAuth API
 */
export async function enrichDeviations(
  deviations: BrowseDeviation[],
  accessToken: string,
  options: EnrichmentOptions = {}
): Promise<BrowseDeviation[]> {
  const {
    includeStats = true,
    includeAuthorAvatars = true,
    includeTierInfo = false,
    maxBatchSize = 50,
  } = options;

  // Skip enrichment if nothing requested
  if (!includeStats && !includeAuthorAvatars && !includeTierInfo) {
    return deviations;
  }

  // Batch process deviations
  const batches: BrowseDeviation[][] = [];
  for (let i = 0; i < deviations.length; i += maxBatchSize) {
    batches.push(deviations.slice(i, i + maxBatchSize));
  }

  const enriched = await Promise.all(
    batches.map((batch) => enrichBatch(batch, accessToken, options))
  );

  return enriched.flat();
}

/**
 * Enrich a batch of deviations
 */
async function enrichBatch(
  batch: BrowseDeviation[],
  accessToken: string,
  options: EnrichmentOptions
): Promise<BrowseDeviation[]> {
  try {
    const deviationIds = batch.map((d) => d.deviationId);

    // Build query params
    const params = new URLSearchParams();
    deviationIds.forEach((id) => params.append('deviationids[]', id));
    params.set('ext_stats', 'true');
    params.set('ext_submission', 'true');

    const response = await fetch(`${DEVIANTART_API_URL}/deviation/metadata?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      logger.warn('DeviantArt metadata enrichment API failed', {
        status: response.status,
        batchSize: batch.length,
      });
      return batch; // Return unenriched on error
    }

    const data = await response.json();
    const metadataMap = new Map<string, any>();

    (data.metadata || []).forEach((meta: any) => {
      metadataMap.set(meta.deviationid, meta);
    });

    // Enrich each deviation with metadata
    return batch.map((deviation) => {
      const meta = metadataMap.get(deviation.deviationId);
      if (!meta) return deviation;

      return {
        ...deviation,
        stats: options.includeStats
          ? {
              favourites: meta.stats?.favourites || deviation.stats.favourites,
              comments: meta.stats?.comments || deviation.stats.comments,
            }
          : deviation.stats,
        author: options.includeAuthorAvatars
          ? {
              ...deviation.author,
              avatarUrl: meta.author?.usericon || deviation.author.avatarUrl,
              userId: meta.author?.userid || deviation.author.userId,
            }
          : deviation.author,
        category: meta.submission?.category_path || deviation.category,
        tierAccess: options.includeTierInfo
          ? meta.tier_access || deviation.tierAccess
          : deviation.tierAccess,
      };
    });
  } catch (error) {
    logger.error('Error enriching deviation batch', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      batchSize: batch.length,
    });
    return batch; // Return unenriched on error
  }
}
