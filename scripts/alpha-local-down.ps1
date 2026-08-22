param(
  [Alias('purge-data')]
  [switch]$PurgeData
)
. "$PSScriptRoot\alpha-local-lib.ps1"

$configPath = Get-AlphaLocalConfigPath
if (-not (Test-Path -LiteralPath $configPath)) {
  Write-Output 'No local Alpha configuration exists; nothing to stop.'
  exit 0
}
Import-AlphaLocalConfig | Out-Null
if ($PurgeData) {
  Invoke-AlphaLocalCompose -Arguments @('down', '--volumes')
  Remove-Item -LiteralPath (Split-Path -Parent $configPath) -Recurse -Force
  Write-Output 'Local Alpha containers, network, volume, records, and local credentials were removed.'
} else {
  Invoke-AlphaLocalCompose -Arguments @('down')
  Write-Output 'Local Alpha containers and network were removed. The named Docker volume, records, and gitignored local configuration were retained for a later restart.'
  Write-Output 'Use npm run alpha:local:down -- --purge-data only when you explicitly want to remove local Alpha records and local credentials.'
}
