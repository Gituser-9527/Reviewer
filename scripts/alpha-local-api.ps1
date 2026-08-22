. "$PSScriptRoot\alpha-local-lib.ps1"
Import-AlphaLocalConfig | Out-Null
if ([string]::IsNullOrWhiteSpace($env:DEV_EXTENSION_ORIGINS)) {
  throw 'Configure the exact unpacked Extension ID first: npm run alpha:local:configure-extension -- --extension-id <extension-id>'
}
Write-Output "Starting local-only Alpha API at $env:INTERNAL_ALPHA_API_BASE_URL. Press Ctrl+C to stop it before alpha:local:down."
node apps/api/dist/server.js
exit $LASTEXITCODE
