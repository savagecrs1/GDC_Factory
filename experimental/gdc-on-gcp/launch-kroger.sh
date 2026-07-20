#!/bin/bash
# launch-kroger.sh
# Launches the customized Kroger "GDC Virtual Factory" web portal locally.

set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )/ui-kroger"

echo "🛒 Starting Kroger GDC Virtual Factory portal..."
cd "$DIR"

export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin:~/.nvm/versions/node/$(ls ~/.nvm/versions/node 2>/dev/null | tail -n 1)/bin"

# Launch Next.js dev server on port 3001 to avoid conflicts with standard UI on 3000
npm run dev -- -p 3001 &

