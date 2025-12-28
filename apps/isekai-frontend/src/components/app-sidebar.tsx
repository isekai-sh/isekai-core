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

import { Link, useLocation } from "react-router-dom";
import {
  Clock,
  Compass,
  FileImage,
  FileText,
  FolderOpen,
  History,
  ClipboardCheck,
  Sparkles,
  Zap,
  Key,
} from "lucide-react";

import { NavMain } from "@/components/nav-main";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { useReviewCount } from "@/hooks/useReviewCount";
import { useWhitelabelStore } from "@/stores/whitelabel";

const navGroup1 = [
  {
    title: "Browse",
    url: "/browse",
    icon: Compass,
  },
  {
    title: "Automation Workflows",
    url: "/automation",
    icon: Zap,
  },
  {
    title: "Exclusives Queue",
    url: "/exclusives-queue",
    icon: Sparkles,
  },
  {
    title: "API Keys",
    url: "/api-keys",
    icon: Key,
  },
];

const navGroup2 = [
  {
    title: "Review",
    url: "/review",
    icon: ClipboardCheck,
  },
  {
    title: "Draft",
    url: "/draft",
    icon: FileImage,
  },
  {
    title: "Scheduled",
    url: "/scheduled",
    icon: Clock,
  },
  {
    title: "Published",
    url: "/published",
    icon: History,
  },
];

const navGroup3 = [
  {
    title: "Galleries",
    url: "/galleries",
    icon: FolderOpen,
  },
  {
    title: "Templates",
    url: "/templates",
    icon: FileText,
  },
];

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const location = useLocation();
  const { count: reviewCount } = useReviewCount();
  const { config: whitelabelConfig } = useWhitelabelStore();

  const productName = whitelabelConfig?.productName || "Isekai";
  const logoUrl = whitelabelConfig?.logoUrl || "/isekai-logo.svg";
  const footerText = whitelabelConfig?.footerText || `© ${new Date().getFullYear()} isekai.sh`;

  const addActiveState = (items: typeof navGroup1) =>
    items.map((item) => ({
      ...item,
      isActive:
        location.pathname === item.url ||
        location.pathname.startsWith(item.url + "/"),
      badge: item.title === "Review" ? reviewCount : undefined,
    }));

  const navGroup1WithActive = addActiveState(navGroup1);
  const navGroup2WithActive = addActiveState(navGroup2);
  const navGroup3WithActive = addActiveState(navGroup3);

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader className="border-b px-4 py-3 lg:hidden">
        <Link to="/browse" className="flex items-center">
          <img src={logoUrl} alt={productName} className="h-6 w-auto" />
        </Link>
      </SidebarHeader>
      <SidebarContent className="pt-2">
        <NavMain items={navGroup1WithActive} />
        <SidebarSeparator />
        <NavMain items={navGroup2WithActive} />
        <SidebarSeparator />
        <NavMain items={navGroup3WithActive} />
      </SidebarContent>
      <SidebarFooter className="px-4 py-3">
        <div className="text-xs text-muted-foreground/60">
          {footerText}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
