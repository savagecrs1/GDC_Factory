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

export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin:~/.nvm/versions/node/$(ls ~/.nvm/versions/node 2>/dev/null | tail -n 1)/bin"

# Launch Next.js dev server on port 3001 to avoid conflicts with standard UI on 3000
npm run dev -- -p 3001
