#!/bin/bash
# AutoInvoice startup script
# Waits for Docker infrastructure, then starts the requested service

PROJECT_DIR="/home/magiccat/AutoInvoice"
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
export PATH="$HOME/.nvm/versions/node/v23.3.0/bin:$PATH"

SERVICE="$1"

wait_for_port() {
  local port=$1 max_wait=$2 elapsed=0
  while ! ss -tlnp | grep -q ":${port} " && [ $elapsed -lt $max_wait ]; do
    sleep 2
    elapsed=$((elapsed + 2))
  done
  [ $elapsed -lt $max_wait ]
}

cd "$PROJECT_DIR" || exit 1

# Wait for PostgreSQL and Redis (max 60s each)
echo "Waiting for PostgreSQL on :5432..."
wait_for_port 5432 60 || { echo "PostgreSQL not ready after 60s"; exit 1; }

echo "Waiting for Redis on :6379..."
wait_for_port 6379 60 || { echo "Redis not ready after 60s"; exit 1; }

echo "Infrastructure ready. Starting $SERVICE..."

case "$SERVICE" in
  backend)
    cd apps/backend
    exec npx tsx src/index.ts
    ;;
  web)
    # Wait a few seconds for backend to be available
    sleep 5
    cd apps/web
    exec npx next dev
    ;;
  *)
    echo "Usage: $0 {backend|web}"
    exit 1
    ;;
esac
