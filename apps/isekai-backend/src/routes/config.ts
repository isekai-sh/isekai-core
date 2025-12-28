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

import { Router } from "express";
import { prisma } from "../db/index.js";
import { env } from "../lib/env.js";

const router = Router();

// GET /api/config/whitelabel - Get whitelabel configuration (public)
router.get("/whitelabel", (req, res) => {
  res.json({
    enabled: env.WHITELABEL_ENABLED,
    productName: env.WHITELABEL_PRODUCT_NAME,
    logoUrl: env.WHITELABEL_LOGO_URL || null,
    faviconUrl: env.WHITELABEL_FAVICON_URL || null,
    footerText: env.WHITELABEL_FOOTER_TEXT || null,
    supportEmail: env.WHITELABEL_SUPPORT_EMAIL || null,
  });
});

// GET /api/config/limits - Get instance limits (public)
router.get("/limits", async (req, res) => {
  try {
    const currentAccounts = await prisma.user.count();

    res.json({
      maxAccounts: env.MAX_DA_ACCOUNTS,
      currentAccounts,
      unlimited: env.MAX_DA_ACCOUNTS === 0,
      teamInvitesEnabled: env.TEAM_INVITES_ENABLED,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to get limits" });
  }
});

// GET /api/config/instance - Get public instance info
router.get("/instance", (req, res) => {
  res.json({
    tier: env.MAX_DA_ACCOUNTS === 0
      ? "self-hosted"
      : env.MAX_DA_ACCOUNTS === 1
        ? "pro"
        : "agency",
    productName: env.WHITELABEL_ENABLED
      ? env.WHITELABEL_PRODUCT_NAME
      : "Isekai",
  });
});

export { router as configRouter };
