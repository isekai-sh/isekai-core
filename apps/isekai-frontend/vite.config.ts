import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  // Load env file from root (not apps/isekai-frontend)
  const env = loadEnv(mode, path.resolve(__dirname, '../../'), '');

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    // Runtime config approach - NO build-time env variable injection
    // Configuration is loaded from /config.js at runtime instead
    // This enables "Build Once, Run Anywhere" for Docker images
    server: {
      port: 3000,
      proxy: {
        '/api': {
          target: env.VITE_API_URL || 'http://localhost:4000',
          changeOrigin: true,
          cookieDomainRewrite: 'localhost',
          cookiePathRewrite: '/',
        },
      },
    },
  };
});
