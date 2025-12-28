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

import { create } from "zustand";
import { config, type WhitelabelConfig } from "@/lib/api";

interface WhitelabelState {
  config: WhitelabelConfig | null;
  isLoading: boolean;
  error: string | null;
  fetchConfig: () => Promise<void>;
  applyBranding: () => void;
}

const DEFAULT_PRODUCT_NAME = "Isekai";

export const useWhitelabelStore = create<WhitelabelState>((set, get) => ({
  config: null,
  isLoading: true,
  error: null,

  fetchConfig: async () => {
    try {
      set({ isLoading: true, error: null });
      const whitelabelConfig = await config.getWhitelabel();
      set({ config: whitelabelConfig, isLoading: false });
      get().applyBranding();
    } catch {
      // If whitelabel config fails to load, use defaults
      set({
        config: {
          enabled: false,
          productName: DEFAULT_PRODUCT_NAME,
          logoUrl: null,
          faviconUrl: null,
          footerText: null,
          supportEmail: null,
        },
        isLoading: false,
      });
    }
  },

  applyBranding: () => {
    const { config: whitelabelConfig } = get();
    if (!whitelabelConfig) return;

    // Update document title
    const productName = whitelabelConfig.productName || DEFAULT_PRODUCT_NAME;
    document.title = `${productName} - DeviantArt Scheduler`;

    // Update favicon if custom one is provided
    if (whitelabelConfig.faviconUrl) {
      const existingFavicon = document.querySelector(
        'link[rel="icon"]'
      ) as HTMLLinkElement;
      if (existingFavicon) {
        existingFavicon.href = whitelabelConfig.faviconUrl;
      } else {
        const favicon = document.createElement("link");
        favicon.rel = "icon";
        favicon.href = whitelabelConfig.faviconUrl;
        document.head.appendChild(favicon);
      }
    }

    // Update meta description
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute(
        "content",
        `${productName} - Schedule and manage your DeviantArt posts`
      );
    }
  },
}));

// Initialize whitelabel on app load
useWhitelabelStore.getState().fetchConfig();
