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

import { useState, useEffect } from 'react';
import { review } from '@/lib/api';

const REFRESH_INTERVAL = 60000; // 60 seconds

export function useReviewCount() {
  const [count, setCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchCount = async () => {
    try {
      const response = await review.list({ page: 1, limit: 1 });
      setCount(response.total);
      setIsLoading(false);
    } catch (error) {
      console.error('Failed to fetch review count:', error);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Fetch immediately on mount
    fetchCount();

    // Set up interval to refresh every minute
    const interval = setInterval(fetchCount, REFRESH_INTERVAL);

    // Cleanup interval on unmount
    return () => clearInterval(interval);
  }, []);

  return { count, isLoading };
}
