#!/bin/bash
# deploy-to-ws.sh
# Deploys the GDC Hybrid web portal to the dedicated gem-admin-ws instance to run 24/7 via PM2.

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-core-edge-dm1}"
ZONE="${ZONE:-us-central1-a}"
VM_NAME="gem-admin-ws"
REMOTE_DIR="~/gdc-on-gcp"

echo "🚀 Starting deployment of GDC Portal to ${VM_NAME} in ${PROJECT_ID}..."

echo "📦 1. Syncing codebase to remote workstation via gcloud compute scp..."
# Exclude node_modules and .next to keep upload fast and clean
rsync -avz --exclude 'ui/node_modules' --exclude 'ui/.next' --exclude '.git' \
  -e "gcloud compute ssh ${VM_NAME} --project=${PROJECT_ID} --zone=${ZONE} --tunnel-through-iap --" \
  ./ "${VM_NAME}:${REMOTE_DIR}/" || {
  echo "⚠️ rsync via IAP failed, falling back to gcloud compute scp..."
  gcloud compute scp --recurse --project="${PROJECT_ID}" --zone="${ZONE}" \
    ./project-setup.sh ./terraform ./ansible ./policies ./tests ./ui \
    "${VM_NAME}:${REMOTE_DIR}/"
}

echo "🔧 2. Installing Node.js, PM2, and building production bundle on ${VM_NAME}..."
gcloud compute ssh "${VM_NAME}" --project="${PROJECT_ID}" --zone="${ZONE}" --tunnel-through-iap --command="
  set -euo pipefail
  
  # Install Node.js if missing
  if ! command -v node &> /dev/null; then
    echo 'Installing Node.js 20 LTS...'
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
  fi

  # Install PM2 globally if missing
  if ! command -v pm2 &> /dev/null; then
    echo 'Installing PM2 process manager...'
    sudo npm install -g pm2
  fi

  echo 'Building Next.js application...'
  cd ~/gdc-on-gcp/ui
  npm install
  npm run build

  echo 'Starting / Reloading 24/7 background service...'
  # If gdc-portal is already running in pm2, reload it; otherwise start it
  if pm2 describe gdc-portal &> /dev/null; then
    pm2 reload gdc-portal
  else
    pm2 start npm --name 'gdc-portal' -- start -- -p 3000
  fi

  pm2 save
  echo '✅ PM2 service deployed and saved!'
"

echo ""
echo "🎉 Deployment Complete! The portal is now running 24/7 on ${VM_NAME}."
echo ""
echo "🔗 To access the web portal from your local browser, run this IAP tunnel command:"
echo "--------------------------------------------------------------------------------"
echo "gcloud compute start-iap-tunnel ${VM_NAME} 3000 --local-host-port=localhost:3000 --project=${PROJECT_ID} --zone=${ZONE}"
echo "--------------------------------------------------------------------------------"
echo "Then open http://localhost:3000 in your browser!"
