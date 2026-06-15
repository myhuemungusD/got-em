param(
  [string]$HostName = "got-em.vercel.app",
  [string]$PackageId = "com.designmainline.gotemstreetdice"
)

$ErrorActionPreference = "Stop"

Write-Host "Installing Bubblewrap CLI..."
npm install -g @bubblewrap/cli

$ManifestUrl = "https://$HostName/manifest.webmanifest"
Write-Host "Starting TWA setup from $ManifestUrl"
Write-Host "Use package ID: $PackageId"
Write-Host "Use app name: Got Em - Street Dice"
Write-Host "Use launcher name: Got Em"
Write-Host ""

bubblewrap init --manifest="$ManifestUrl"

Write-Host ""
Write-Host "Building Android App Bundle and APK..."
bubblewrap build

Write-Host ""
Write-Host "Get the signing certificate SHA-256 fingerprint:"
Write-Host "  bubblewrap fingerprint"
Write-Host ""
Write-Host "Put that fingerprint into public/.well-known/assetlinks.json, redeploy the web app, then rebuild."
