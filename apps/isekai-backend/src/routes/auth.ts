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
import { authMiddleware } from "../middleware/auth.js";
import { logger } from "../lib/logger.js";
import { env } from "../lib/env.js";

const router = Router();

const DEVIANTART_AUTH_URL = "https://www.deviantart.com/oauth2/authorize";
const DEVIANTART_TOKEN_URL = "https://www.deviantart.com/oauth2/token";
const DEVIANTART_API_URL = "https://www.deviantart.com/api/v1/oauth2";

// Redirect to DeviantArt OAuth
router.get("/deviantart", (req, res) => {
  logger.debug("OAuth redirect initiated", {
    clientId: process.env.DEVIANTART_CLIENT_ID,
    redirectUri: process.env.DEVIANTART_REDIRECT_URI,
  });

  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.DEVIANTART_CLIENT_ID!,
    redirect_uri: process.env.DEVIANTART_REDIRECT_URI!,
    scope: "user browse stash publish note message gallery",
  });

  const authUrl = `${DEVIANTART_AUTH_URL}?${params}`;
  logger.debug("Redirecting to DeviantArt OAuth", { authUrl });
  res.redirect(authUrl);
});

// OAuth callback
router.get("/deviantart/callback", async (req, res) => {
  logger.debug("OAuth callback received", { query: req.query });
  const { code, error } = req.query;

  if (error) {
    logger.error("OAuth error received from DeviantArt", { error });
    return res.redirect(`${process.env.FRONTEND_URL}/callback?error=${error}`);
  }

  if (!code || typeof code !== "string") {
    logger.warn("OAuth callback missing authorization code");
    return res.redirect(
      `${process.env.FRONTEND_URL}/callback?error=missing_code`
    );
  }

  try {
    // Exchange code for tokens
    const tokenResponse = await fetch(DEVIANTART_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: process.env.DEVIANTART_CLIENT_ID!,
        client_secret: process.env.DEVIANTART_CLIENT_SECRET!,
        redirect_uri: process.env.DEVIANTART_REDIRECT_URI!,
        code,
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error("Failed to exchange code for token");
    }

    const tokenData = await tokenResponse.json();
    const { access_token, refresh_token, expires_in } = tokenData;

    // Fetch user info
    const userResponse = await fetch(`${DEVIANTART_API_URL}/user/whoami`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (!userResponse.ok) {
      const errorText = await userResponse.text();
      logger.error("DeviantArt user info fetch failed", {
        status: userResponse.status,
        errorText,
      });
      if (
        errorText.includes("api_threshold") ||
        errorText.includes("rate limit") ||
        userResponse.status === 429
      ) {
        throw new Error(
          "DeviantArt API rate limit reached. Please wait a few minutes and try logging in again."
        );
      }
      throw new Error("Failed to fetch user info");
    }

    const userData = await userResponse.json();
    const tokenExpiresAt = new Date(Date.now() + expires_in * 1000);
    const refreshTokenExpiresAt = new Date(
      Date.now() + env.REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000
    );

    // Upsert user
    const existingUser = await prisma.user.findUnique({
      where: { deviantartId: userData.userid },
    });

    let userId: string;

    if (existingUser) {
      await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          username: userData.username,
          avatarUrl: userData.usericon,
          accessToken: access_token,
          refreshToken: refresh_token,
          tokenExpiresAt,
          refreshTokenExpiresAt,
          refreshTokenWarningEmailSent: false,
          refreshTokenExpiredEmailSent: false,
          lastRefreshTokenRefresh: null,
          updatedAt: new Date(),
        },
      });
      userId = existingUser.id;
    } else {
      const newUser = await prisma.user.create({
        data: {
          deviantartId: userData.userid,
          username: userData.username,
          avatarUrl: userData.usericon,
          accessToken: access_token,
          refreshToken: refresh_token,
          tokenExpiresAt,
          refreshTokenExpiresAt,
          // Note: usageResetAt tracking removed - add to schema in v0.2.0 if needed
        },
      });
      userId = newUser.id;
    }

    // Set session
    req.session.userId = userId;

    // Save session before redirecting (critical for preventing race conditions)
    req.session.save((err) => {
      if (err) {
        logger.error("Session save failed during OAuth callback", {
          error: err.message,
          stack: err.stack,
        });
        return res.redirect(
          `${process.env.FRONTEND_URL}/callback?error=session_failed`
        );
      }
      res.redirect(`${process.env.FRONTEND_URL}/callback`);
    });
  } catch (error) {
    logger.error("OAuth callback error", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    res.redirect(`${process.env.FRONTEND_URL}/callback?error=oauth_failed`);
  }
});

// Get current user
router.get("/me", authMiddleware, (req, res) => {
  const user = req.user!;
  const now = new Date();
  const daysUntilTokenExpiry = Math.floor(
    (user.refreshTokenExpiresAt.getTime() - now.getTime()) /
      (1000 * 60 * 60 * 24)
  );

  res.json({
    id: user.id,
    deviantartId: user.deviantartId,
    username: user.username,
    avatarUrl: user.avatarUrl,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
    // Token status
    tokenStatus: {
      isValid: user.refreshTokenExpiresAt > now,
      expiresAt: user.refreshTokenExpiresAt.toISOString(),
      daysUntilExpiry: Math.max(0, daysUntilTokenExpiry),
      needsReauth: user.refreshTokenExpiresAt <= now,
    },
  });
});

// Get token status
router.get("/token-status", authMiddleware, (req, res) => {
  const user = req.user!;
  const now = new Date();
  const daysUntilExpiry = Math.floor(
    (user.refreshTokenExpiresAt.getTime() - now.getTime()) /
      (1000 * 60 * 60 * 24)
  );

  const isValid = user.refreshTokenExpiresAt > now;
  const isExpiringSoon = daysUntilExpiry <= 14;
  const needsReauth = !isValid;

  res.json({
    isValid,
    isExpiringSoon,
    needsReauth,
    expiresAt: user.refreshTokenExpiresAt.toISOString(),
    daysUntilExpiry: Math.max(0, daysUntilExpiry),
  });
});

// Trigger manual re-authentication
router.post("/reauth", authMiddleware, (req, res) => {
  // Return the OAuth URL for re-authentication
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.DEVIANTART_CLIENT_ID!,
    redirect_uri: process.env.DEVIANTART_REDIRECT_URI!,
    scope: "user browse stash publish note message gallery",
  });

  res.json({
    authUrl: `${DEVIANTART_AUTH_URL}?${params}`,
  });
});

// Logout
router.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      logger.error("Session destroy failed during logout", {
        error: err.message,
        stack: err.stack,
      });
    }
    res.clearCookie("connect.sid");
    res.json({ success: true });
  });
});

export { router as authRouter };
