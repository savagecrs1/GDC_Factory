#!/bin/bash
# launch-kroger.sh
# Launches the customized Kroger "GDC Virtual Factory" web portal locally.

set -e

BASE_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
if [ -d "$BASE_DIR/ui-kroger" ]; then
  DIR="$BASE_DIR/ui-kroger"
elif [ -d "$BASE_DIR/ui" ]; then
  DIR="$BASE_DIR/ui"
else
  echo "❌ Error: Could not find UI directory (ui or ui-kroger)."
  exit 1
fi

echo "🛒 Starting Kroger GDC Virtual Factory portal..."
cd "$DIR"

if [ ! -d "node_modules" ]; then
  echo "📦 Installing UI dependencies..."
  npm install
fi

# Launch Next.js dev server on port 3001
./node_modules/.bin/next dev -p 3001 &

