param(
  [Parameter(Mandatory = $true)]
  [Alias('extension-id')]
  [string]$ExtensionId
)
. "$PSScriptRoot\alpha-local-lib.ps1"

if ($ExtensionId -notmatch '^[a-p]{32}$') {
  throw 'Extension ID must be exactly 32 lowercase characters in the Chrome extension alphabet (a-p).'
}
$configPath = Import-AlphaLocalConfig
$origin = "chrome-extension://$ExtensionId"
$lines = Get-Content -LiteralPath $configPath
$updated = $lines | ForEach-Object {
  if ($_ -match '^\$env:DEV_EXTENSION_ORIGINS = ') { return "`$env:DEV_EXTENSION_ORIGINS = '$origin'" }
  return $_
}
$updated | Set-Content -LiteralPath $configPath -Encoding UTF8

& "$PSScriptRoot\alpha-local-doctor.ps1"
if ($LASTEXITCODE -ne 0) { throw 'Local Alpha doctor failed after Extension Origin configuration.' }
Write-Output 'Exact Extension Origin configured. Next: npm run alpha:local:api'
