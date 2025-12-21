// Runtime Configuration
// This file is loaded at runtime and MUST be overridden by your deployment
//
// For Docker deployments: The entrypoint script will overwrite this file
// For static hosting: Manually edit this file before deploying
//
// Using relative "/api" allows the frontend to work with any domain
// by proxying /api requests to your backend
window.ISEKAI_CONFIG = {
  API_URL: "/api",  // Default: relative path (works with reverse proxy)
  DEVIANTART_CLIENT_ID: "",  // Must be set for OAuth to work
  R2_PUBLIC_URL: "https://storage.isekai.sh"  // Cloudflare R2 public URL
};
