#!/bin/sh
set -e

echo "Starting Isekai Backend..."

# Run database migrations from shared package
echo "Running database migrations from shared package..."
cd /app/packages/shared
corepack pnpm@9 prisma migrate deploy

# Check if migrations succeeded
if [ $? -eq 0 ]; then
  echo "Migrations completed successfully"
else
  echo "Migrations failed"
  exit 1
fi

# Start the application
echo "Starting application server..."
cd /app/apps/isekai-backend
exec node dist/index.js
