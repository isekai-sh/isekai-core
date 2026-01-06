/// <reference types="vite/client" />

// Build-time constants injected by Vite
declare const __APP_VERSION__: string;

// Runtime configuration interface (loaded from /config.js)
// This enables "Build Once, Run Anywhere" by injecting config at container startup
interface IsekaiConfig {
  API_URL: string;
  DEVIANTART_CLIENT_ID: string;
  S3_PUBLIC_URL: string;
}

interface Window {
  ISEKAI_CONFIG?: IsekaiConfig;
}
