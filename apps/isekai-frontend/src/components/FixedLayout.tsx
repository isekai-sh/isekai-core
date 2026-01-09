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

import { useState } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import {
  LayoutDashboard,
  ClipboardCheck,
  FileImage,
  Clock,
  History,
  Zap,
  Sparkles,
  Compass,
  FolderOpen,
  MoreHorizontal,
  ChevronDown,
  Send,
  Copy,
  Key,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { NavUserDropdown } from '@/components/nav-user-dropdown';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useWhitelabelStore } from '@/stores/whitelabel';
import { useReviewCount } from '@/hooks/useReviewCount';
import { TopLoadingBar } from '@/components/TopLoadingBar';

interface NavItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

// Deviation workflow items (grouped in dropdown)
const deviationItems: NavItem[] = [
  { path: '/review', label: 'Review', icon: ClipboardCheck },
  { path: '/draft', label: 'Draft', icon: FileImage },
  { path: '/scheduled', label: 'Scheduled', icon: Clock },
  { path: '/published', label: 'Published', icon: History },
];

// Gallery item (shown after separator in Deviation dropdown)
const galleryItem: NavItem = { path: '/galleries', label: 'Gallery', icon: FolderOpen };

// Automation items (grouped in dropdown)
const automationItems: NavItem[] = [
  { path: '/automation', label: 'Automations', icon: Zap },
  { path: '/exclusives-queue', label: 'Exclusive Queue', icon: Sparkles },
  { path: '/templates', label: 'Templates', icon: Copy },
];

// All nav items for mobile
const allNavItems: NavItem[] = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  ...deviationItems,
  ...automationItems,
  { path: '/inspiration', label: 'Inspiration', icon: Compass },
];

const mobileNavItems = allNavItems.slice(0, 4);
const moreItems = [...allNavItems.slice(4), galleryItem];

/**
 * FixedLayout - For pages that manage their own internal scrolling
 * Use this for: Review, Draft, Scheduled, Published, ExclusivesQueue
 * These pages have fixed height containers with internal scroll areas.
 */
export function FixedLayout() {
  const location = useLocation();
  const { config: whitelabelConfig } = useWhitelabelStore();
  const { count: reviewCount } = useReviewCount();

  const productName = whitelabelConfig?.productName || 'Isekai';
  const logoUrl = whitelabelConfig?.logoUrl || '/isekai-logo.svg';

  const deviationItemsWithBadge = deviationItems.map((item) => ({
    ...item,
    badge: item.path === '/review' ? reviewCount : undefined,
  }));

  const isDeviationActive =
    deviationItems.some(
      (item) => location.pathname === item.path || location.pathname.startsWith(item.path + '/')
    ) ||
    location.pathname === '/galleries' ||
    location.pathname.startsWith('/galleries/');

  const isAutomationActive = automationItems.some(
    (item) => location.pathname === item.path || location.pathname.startsWith(item.path + '/')
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <TopLoadingBar />

      {/* Header */}
      <nav className="sticky top-0 left-0 right-0 z-50 border-b border-primary/10 backdrop-blur-md">
        <div className="absolute inset-0 -z-10">
          <div
            className="absolute inset-0 opacity-30"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%2300e59b' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/90 to-background" />
        </div>

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 justify-between">
            <div className="flex items-center gap-8">
              <Link to="/dashboard" className="flex items-center gap-2 group shrink-0">
                <img
                  src={logoUrl}
                  alt={productName}
                  className="h-7 w-auto transition-transform group-hover:scale-105"
                />
              </Link>

              <div className="hidden items-center gap-1 md:flex">
                <NavLink
                  item={{ path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }}
                  location={location}
                />
                <NavDropdown
                  label="Deviation"
                  icon={Send}
                  items={deviationItemsWithBadge}
                  isActive={isDeviationActive}
                  location={location}
                  totalBadge={reviewCount}
                  extraItem={galleryItem}
                  separatorAfterFirst
                />
                <NavDropdown
                  label="Automation"
                  icon={Zap}
                  items={automationItems}
                  isActive={isAutomationActive}
                  location={location}
                />
                <NavLink
                  item={{ path: '/api-keys', label: 'API Keys', icon: Key }}
                  location={location}
                />
                <NavLink
                  item={{ path: '/inspiration', label: 'Inspiration', icon: Compass }}
                  location={location}
                />
              </div>
            </div>

            <div className="flex items-center">
              <NavUserDropdown />
            </div>
          </div>
        </div>
      </nav>

      {/* Main content - FIXED HEIGHT with internal scrolling */}
      <main className="flex-1 min-h-0 pb-16 md:pb-0">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 h-full">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom tab bar */}
      <BottomTabBar
        items={mobileNavItems.map((item) => ({
          ...item,
          badge: item.path === '/review' ? reviewCount : undefined,
        }))}
        moreItems={moreItems}
      />
    </div>
  );
}

function NavLink({ item, location }: { item: NavItem; location: ReturnType<typeof useLocation> }) {
  const Icon = item.icon;
  const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');

  return (
    <Link
      to={item.path}
      className={cn(
        'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all outline-none focus:outline-none focus-visible:outline-none font-mono',
        isActive
          ? 'text-primary bg-primary/10'
          : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
      )}
    >
      <Icon className="h-4 w-4" />
      <span>{item.label}</span>
      {item.badge !== undefined && item.badge > 0 && (
        <span className="ml-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
          {item.badge > 99 ? '99+' : item.badge}
        </span>
      )}
    </Link>
  );
}

function NavDropdown({
  label,
  icon: Icon,
  items,
  isActive,
  location,
  totalBadge,
  extraItem,
  separatorAfterFirst,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: NavItem[];
  isActive: boolean;
  location: ReturnType<typeof useLocation>;
  totalBadge?: number;
  extraItem?: NavItem;
  separatorAfterFirst?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all outline-none focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 font-mono',
          isActive
            ? 'text-primary bg-primary/10'
            : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
        )}
      >
        <Icon className="h-4 w-4" />
        <span>{label}</span>
        {totalBadge !== undefined && totalBadge > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
            {totalBadge > 99 ? '99+' : totalBadge}
          </span>
        )}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {items.map((item, index) => {
          const ItemIcon = item.icon;
          const itemActive =
            location.pathname === item.path || location.pathname.startsWith(item.path + '/');
          return (
            <div key={item.path}>
              <DropdownMenuItem asChild>
                <Link
                  to={item.path}
                  className={cn(
                    'flex items-center gap-2 cursor-pointer',
                    itemActive && 'text-primary'
                  )}
                >
                  <ItemIcon className="h-4 w-4" />
                  <span className="flex-1">{item.label}</span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  )}
                </Link>
              </DropdownMenuItem>
              {separatorAfterFirst && index === 0 && <DropdownMenuSeparator />}
            </div>
          );
        })}
        {extraItem && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link
                to={extraItem.path}
                className={cn(
                  'flex items-center gap-2 cursor-pointer',
                  (location.pathname === extraItem.path ||
                    location.pathname.startsWith(extraItem.path + '/')) &&
                    'text-primary'
                )}
              >
                <extraItem.icon className="h-4 w-4" />
                <span className="flex-1">{extraItem.label}</span>
              </Link>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BottomTabBar({ items, moreItems }: { items: NavItem[]; moreItems: NavItem[] }) {
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  const isMoreActive = moreItems.some(
    (item) => location.pathname === item.path || location.pathname.startsWith(item.path + '/')
  );

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-primary/10 bg-background/95 backdrop-blur-md md:hidden">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

      <div className="flex h-16 items-center justify-around px-2">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive =
            location.pathname === item.path || location.pathname.startsWith(item.path + '/');
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                'relative flex flex-col items-center gap-0.5 p-2 text-[10px] transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <div className="relative">
                <Icon className="h-5 w-5" />
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 text-[8px] font-bold text-primary-foreground">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </div>
              <span>{item.label}</span>
              {isActive && (
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 h-0.5 w-4 rounded-full bg-primary" />
              )}
            </Link>
          );
        })}

        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger
            className={cn(
              'relative flex flex-col items-center gap-0.5 p-2 text-[10px] transition-colors',
              isMoreActive ? 'text-primary' : 'text-muted-foreground'
            )}
          >
            <MoreHorizontal className="h-5 w-5" />
            <span>More</span>
            {isMoreActive && (
              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 h-0.5 w-4 rounded-full bg-primary" />
            )}
          </SheetTrigger>
          <SheetContent side="bottom" className="h-auto rounded-t-xl">
            <div className="grid grid-cols-4 gap-2 py-4">
              {moreItems.map((item) => {
                const Icon = item.icon;
                const isActive =
                  location.pathname === item.path || location.pathname.startsWith(item.path + '/');
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      'flex flex-col items-center gap-1.5 p-3 rounded-lg transition-colors',
                      isActive
                        ? 'bg-primary/10 text-primary'
                        : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="text-[10px] font-medium">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
