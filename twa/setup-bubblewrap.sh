#!/usr/bin/env bash
set -euo pipefail

HOST_NAME="${1:-got-em.vercel.app}"
PACKAGE_ID="${2:-com.designmainline.gotemstreetdice}"
MANIFEST_URL="https://${HOST_NAME}/manifest.webmanifest"

npm install -g @bubblewrap/cli

echo "Starting TWA setup from ${MANIFEST_URL}"
echo "Use package ID: ${PACKAGE_ID}"
echo "Use app name: Got Em - Street Dice"
echo "Use launcher name: Got Em"

bubblewrap init --manifest="${MANIFEST_URL}"
bubblewrap build

echo
echo "Get the SHA-256 signing fingerprint with:"
echo "  bubblewrap fingerprint"
echo
echo "Add it to public/.well-known/assetlinks.json, redeploy, then rebuild."
