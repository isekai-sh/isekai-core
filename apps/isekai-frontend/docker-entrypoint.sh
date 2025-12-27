#!/bin/sh
set -e

# Runtime configuration injection
# This script overwrites /usr/share/nginx/html/config.js with runtime environment variables
CONFIG_FILE="/usr/share/nginx/html/config.js"

echo "Injecting runtime configuration into ${CONFIG_FILE}..."

# Create config.js with runtime environment variables
cat > ${CONFIG_FILE} << EOF
// Runtime Configuration (Injected by Docker entrypoint)
window.ISEKAI_CONFIG = {
  API_URL: "${VITE_API_URL:-/api}",
  DEVIANTART_CLIENT_ID: "${VITE_DEVIANTART_CLIENT_ID:-}",
  S3_PUBLIC_URL: "${VITE_S3_PUBLIC_URL:-http://localhost:9000/isekai-uploads}"
};
EOF

# Fix permissions so nginx user can read the file
chmod 644 ${CONFIG_FILE}
chown nginx:nginx ${CONFIG_FILE}

echo "Configuration injected successfully:"
cat ${CONFIG_FILE}

# Execute the main command (nginx)
exec "$@"
