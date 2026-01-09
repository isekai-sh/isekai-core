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

export type BrowseDataSource = 'api';

export type BrowseMode = 'home' | 'daily' | 'following' | 'tags' | 'topic' | 'user-gallery';

export interface BrowseParams {
  offset?: number;
  limit?: number;
  tag?: string;
  date?: string;
  topic?: string;
  username?: string;
  keywords?: string;
  mature_content?: boolean;
}

export interface BrowseSourceConfig {
  source: BrowseDataSource;
}

/**
 * Determine data source and configuration for browse mode
 * All modes use API with proper caching
 */
export function getBrowseSource(mode: BrowseMode, params: BrowseParams): BrowseSourceConfig {
  // All browse modes now use API with Redis caching
  return { source: 'api' };
}
