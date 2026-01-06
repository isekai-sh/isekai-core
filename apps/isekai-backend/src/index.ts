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

import "@isekai/shared"; // Load config from root .env (single source of truth)
import "./lib/env.js"; // Validate environment variables before anything else
import "express-async-errors"; // Must be imported before Express
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import session from "express-session";

import { authRouter } from "./routes/auth.js";
import { deviationsRouter } from "./routes/deviations.js";
import { uploadsRouter } from "./routes/uploads.js";
import { deviantartRouter } from "./routes/deviantart.js";
import { browseRouter } from "./routes/browse.js";
import { galleriesRouter } from "./routes/galleries.js";
import { templatesRouter } from "./routes/templates.js";
import { healthRouter } from "./routes/health.js";
import { cacheRouter } from "./routes/cache.js";
import { apiKeysRouter } from "./routes/api-keys.js";
import { comfyuiRouter } from "./routes/comfyui.js";
import { reviewRouter } from "./routes/review.js";
import { pricePresetsRouter } from "./routes/price-presets.js";
import { saleQueueRouter } from "./routes/sale-queue.js";
import { automationsRouter } from "./routes/automations.js";
import { automationScheduleRulesRouter } from "./routes/automation-schedule-rules.js";
import { automationDefaultValuesRouter } from "./routes/automation-default-values.js";
import { adminRouter } from "./routes/admin.js";
import { configRouter } from "./routes/config.js";
import { errorHandler } from "./middleware/error.js";
import { authMiddleware } from "./middleware/auth.js";
import { hybridAuthMiddleware } from "./middleware/hybrid-auth.js";
import { createSessionStore, closeSessionStore } from "./lib/session-store.js";
import { RedisClientManager } from "./lib/redis-client.js";
import { startHealthReporter } from "./lib/health-reporter.js";
import { env } from "./lib/env.js";

const PORT = env.PORT;

/**
 * Initialize and start the Express server
 */
async function startServer() {
  // Initialize Redis client for caching (auto-detection)
  await RedisClientManager.getClient();

  // Create session store with auto-detection
  const sessionStore = await createSessionStore();

  const app = express();

  // Trust proxy - required when running behind a reverse proxy/load balancer
  // This allows Express to correctly read client IP from X-Forwarded-* headers
  app.set("trust proxy", 1);

  // CORS configuration
  const allowedOrigins = [
    env.FRONTEND_URL,
    "http://localhost:3000", // Always allow local development
    "http://localhost:3001", // Alternative port
    "http://localhost:5173", // Vite default port
    "http://localhost:5174", // Vite alternative port
  ].filter(Boolean);

  // Normalize origins - remove trailing slashes and deduplicate
  const uniqueOrigins = [
    ...new Set(allowedOrigins.map((origin) => origin.replace(/\/$/, ""))),
  ];

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, Postman, etc.)
        if (!origin) return callback(null, true);

        if (uniqueOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error("Not allowed by CORS"));
        }
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
      exposedHeaders: ["Set-Cookie"],
      maxAge: 86400, // 24 hours
    })
  );
  app.use(cookieParser());

  app.use(express.json());

  app.use((err: any, req: any, res: any, next: any) => {
    if (err instanceof SyntaxError && "body" in err) {
      return res.status(400).json({ error: "Invalid JSON" });
    }
    next(err);
  });

  // Session with persistent store
  app.use(
    session({
      store: sessionStore,
      secret: env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: env.NODE_ENV === "production" && !env.FRONTEND_URL.startsWith("http://localhost"),
        httpOnly: true,
        sameSite: "lax",
        domain: env.COOKIE_DOMAIN, // Set to ".yourdomain.com" to share cookies across subdomains
        maxAge: 1000 * 60 * 60 * 24 * env.SESSION_MAX_AGE_DAYS,
      },
    })
  );

  // Public routes
  app.use("/api/health", healthRouter); // Health check with cache stats
  app.use("/api/auth", authRouter);
  app.use("/api/config", configRouter); // Whitelabel and instance config (public)

  // Protected routes
  app.use("/api/deviations", authMiddleware, deviationsRouter);
  app.use("/api/uploads", authMiddleware, uploadsRouter);
  app.use("/api/deviantart", authMiddleware, deviantartRouter);
  app.use("/api/browse", authMiddleware, browseRouter);
  app.use("/api/galleries", authMiddleware, galleriesRouter);
  app.use("/api/templates", authMiddleware, templatesRouter);
  app.use("/api/cache", authMiddleware, cacheRouter); // Cache management
  app.use("/api/api-keys", authMiddleware, apiKeysRouter); // API key management
  app.use("/api/review", authMiddleware, reviewRouter); // Review management
  app.use("/api/price-presets", authMiddleware, pricePresetsRouter); // Price preset management
  app.use("/api/sale-queue", hybridAuthMiddleware, saleQueueRouter); // Sale queue management (supports session + API key)
  app.use("/api/automations", authMiddleware, automationsRouter); // Automation management
  app.use(
    "/api/automation-schedule-rules",
    authMiddleware,
    automationScheduleRulesRouter
  ); // Automation schedule rules
  app.use(
    "/api/automation-default-values",
    authMiddleware,
    automationDefaultValuesRouter
  ); // Automation default values
  app.use("/api/comfyui", comfyuiRouter); // ComfyUI integration (uses apiKeyAuthMiddleware internally)
  app.use("/api/admin", adminRouter); // Admin routes (auth + admin role required internally)

  // Error handling
  app.use(errorHandler);

  // Note: Stuck job recovery runs in isekai-publisher service (not here)
  // The publisher service is responsible for recovering its own stuck jobs

  // Start server
  const server = app.listen(PORT, () => {
    console.log(`Backend ready on :${PORT} (${env.NODE_ENV})`);

    // Start health reporter for control plane integration
    startHealthReporter();
  });

  // Graceful shutdown
  process.on("SIGTERM", async () => {
    server.close();
    await closeSessionStore(sessionStore);
    await RedisClientManager.close();
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    server.close();
    await closeSessionStore(sessionStore);
    await RedisClientManager.close();
    process.exit(0);
  });
}

// Start the server
startServer().catch((error) => {
  console.error("Startup failed:", error);
  process.exit(1);
});

export default startServer;
