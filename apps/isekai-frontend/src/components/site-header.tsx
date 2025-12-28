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

import { useRef, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { NavUserDropdown } from "@/components/nav-user-dropdown";
import {
  TagAutocomplete,
  type TagAutocompleteRef,
} from "@/components/browse/TagAutocomplete";
import { Kbd } from "@/components/ui/kbd";
import { useWhitelabelStore } from "@/stores/whitelabel";

export function SiteHeader() {
  const location = useLocation();
  const navigate = useNavigate();
  const searchRef = useRef<TagAutocompleteRef>(null);
  const [searchValue, setSearchValue] = useState("");
  const [isMac, setIsMac] = useState(false);
  const { config: whitelabelConfig } = useWhitelabelStore();

  const productName = whitelabelConfig?.productName || "Isekai";
  const logoUrl = whitelabelConfig?.logoUrl || "/isekai-logo.svg";

  // Detect OS for keyboard shortcut display
  useEffect(() => {
    setIsMac(navigator.platform.toUpperCase().includes("MAC"));
  }, []);

  // Global keyboard shortcut: Cmd/Ctrl + K to focus search
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSearch = (tag: string) => {
    // If not on browse page, navigate to browse with the tag
    if (!location.pathname.startsWith("/browse")) {
      navigate(`/browse?mode=tags&tag=${encodeURIComponent(tag)}`);
    } else {
      // Already on browse, just update the URL params
      navigate(`/browse?mode=tags&tag=${encodeURIComponent(tag)}`);
    }
    setSearchValue("");
  };

  return (
    <header className="sticky top-0 z-50 w-full flex h-14 shrink-0 items-center gap-2 border-b bg-background">
      <div className="flex w-full items-center gap-3 px-4 lg:gap-4 lg:px-6">
        {/* Left section: Sidebar toggle + Logo */}
        <div className="flex items-center gap-2">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="h-4" />
          <Link to="/browse" className="flex items-center">
            <img src={logoUrl} alt={productName} className="h-5 w-auto" />
          </Link>
        </div>

        {/* Center section: Search */}
        <div className="flex-1 hidden lg:flex justify-center max-w-lg mx-auto">
          <div className="relative w-full">
            <TagAutocomplete
              ref={searchRef}
              value={searchValue}
              onChange={setSearchValue}
              onSearch={handleSearch}
              placeholder="Search deviation or tags..."
              className="w-full"
              inputClassName="h-9 text-sm pr-24"
            />
            {/* Keyboard shortcut hint */}
            <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none flex items-center gap-1">
              <Kbd>{isMac ? "⌘" : "Ctrl"}</Kbd>
              <span className="text-[10px] text-muted-foreground">+</span>
              <Kbd>K</Kbd>
            </div>
          </div>
        </div>

        {/* Spacer for mobile to push user avatar to right */}
        <div className="flex-1 lg:hidden" />

        {/* Right section: User */}
        <div className="flex items-center gap-2">
          <NavUserDropdown />
        </div>
      </div>
    </header>
  );
}
