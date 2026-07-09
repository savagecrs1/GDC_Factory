#!/bin/bash
# open-portal.sh
# Connects to the remote 24/7 GDC portal on gem-admin-ws via IAP tunnel and opens your Mac web browser.

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-core-edge-dm1}"
ZONE="${ZONE:-us-central1-a}"
VM_NAME="gem-admin-ws"
PORT="3000"

echo "🔐 Checking Google Cloud IAP tunnel connection to ${VM_NAME} (${PROJECT_ID})..."

# Check if port 3000 is already in use locally
if lsof -i :${PORT} >/dev/null 2>&1; then
  echo "⚡ Port ${PORT} is already active. Opening browser..."
  open "http://localhost:${PORT}"
  echo "✅ Connected! (Press Ctrl+C if you need to stop any existing processes using port ${PORT})"
  exit 0
fi

echo "🚀 Starting encrypted IAP tunnel in background..."
gcloud compute start-iap-tunnel "${VM_NAME}" "${PORT}" \
  --local-host-port="localhost:${PORT}" \
  --project="${PROJECT_ID}" \
  --zone="${ZONE}" &
TUNNEL_PID=$!

# Trap Ctrl+C to clean up tunnel when script exits
cleanup() {
  echo ""
  echo "🛑 Stopping IAP tunnel (PID: ${TUNNEL_PID})..."
  kill -9 "${TUNNEL_PID}" 2>/dev/null || true
  echo "👋 Disconnected securely from GDC Portal."
  exit 0
}
trap cleanup SIGINT SIGTERM

echo "⏳ Waiting for tunnel to initialize..."
sleep 3

if ! ps -p "${TUNNEL_PID}" > /dev/null; then
  echo "❌ Error: IAP tunnel failed to start. Please check your gcloud authentication (gcloud auth login)."
  exit 1
fi

echo "🌐 Opening http://localhost:${PORT} in your default web browser..."
open "http://localhost:${PORT}"

echo ""
echo "✨ GDC Portal is LIVE and connected!"
echo "📌 Keep this terminal window open while using the portal."
echo "🛑 Press [Ctrl+C] to close the tunnel and disconnect."
echo ""

# Wait for tunnel process to terminate
wait "${TUNNEL_PID}" 2>/dev/null || true
