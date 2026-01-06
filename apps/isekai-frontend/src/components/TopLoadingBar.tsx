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

import { useRef, useEffect } from "react";
import LoadingBar, { LoadingBarRef } from "react-top-loading-bar";
import { useIsFetching, useIsMutating } from "@tanstack/react-query";

export function TopLoadingBar() {
  const ref = useRef<LoadingBarRef>(null);
  // Only count initial fetches, not background refetches
  const isFetching = useIsFetching({
    predicate: (query) => query.state.status === "pending",
  });
  const isMutating = useIsMutating();

  const isLoading = isFetching > 0 || isMutating > 0;

  useEffect(() => {
    if (isLoading) {
      ref.current?.continuousStart();
    } else {
      ref.current?.complete();
    }
  }, [isLoading]);

  return (
    <LoadingBar
      ref={ref}
      color="hsl(var(--primary))"
      height={2}
      shadow={false}
      transitionTime={200}
      waitingTime={400}
    />
  );
}
