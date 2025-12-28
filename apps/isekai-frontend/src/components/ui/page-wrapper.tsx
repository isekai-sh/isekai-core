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

import { cn } from "@/lib/utils";

interface PageWrapperProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Page root wrapper - constrains height and enables flex column layout.
 * All pages should use this as their root element.
 */
export function PageWrapper({ children, className }: PageWrapperProps) {
  return (
    <div className={cn("h-full flex flex-col overflow-hidden", className)}>
      {children}
    </div>
  );
}

/**
 * Fixed header area that doesn't scroll.
 * Use for page titles, action buttons, filters.
 */
export function PageHeader({ children, className }: PageWrapperProps) {
  return (
    <div className={cn("flex-shrink-0", className)}>
      {children}
    </div>
  );
}

/**
 * Scrollable content area.
 * All main page content should go here.
 */
export function PageContent({ children, className }: PageWrapperProps) {
  return (
    <div className={cn("flex-1 overflow-auto min-h-0", className)}>
      {children}
    </div>
  );
}
