/// <reference types="vite/client" />

// Runtime configuration interface (loaded from /config.js)
// This enables "Build Once, Run Anywhere" by injecting config at container startup
interface IsekaiConfig {
  API_URL: string;
  DEVIANTART_CLIENT_ID: string;
  R2_PUBLIC_URL: string;
}

interface Window {
  ISEKAI_CONFIG?: IsekaiConfig;
}
