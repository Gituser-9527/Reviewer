. "$PSScriptRoot\alpha-local-lib.ps1"
Import-AlphaLocalConfig | Out-Null
node scripts/internal-alpha-doctor.mjs
exit $LASTEXITCODE
