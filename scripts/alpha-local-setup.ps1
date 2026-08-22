. "$PSScriptRoot\alpha-local-lib.ps1"

Assert-AlphaLocalPrerequisites
$configPath = Get-AlphaLocalConfigPath
$configDirectory = Split-Path -Parent $configPath
New-Item -ItemType Directory -Force -Path $configDirectory | Out-Null

if (-not (Test-Path -LiteralPath $configPath)) {
  $apiPort = Get-FreeLoopbackPort
  $postgresPort = Get-FreeLoopbackPort
  while ($postgresPort -eq $apiPort) { $postgresPort = Get-FreeLoopbackPort }
  $databasePassword = (New-AlphaLocalRandomBase64 -ByteLength 24).TrimEnd('=')
  $developmentToken = New-AlphaLocalRandomBase64 -ByteLength 32
  $encryptionKey = New-AlphaLocalRandomBase64 -ByteLength 32
  $escapedPassword = [Uri]::EscapeDataString($databasePassword)
  @"
# Generated for this Windows user by alpha:local:setup. Gitignored; do not commit or share.
`$env:NODE_ENV = 'development'
`$env:HOST = '127.0.0.1'
`$env:PORT = '$apiPort'
`$env:INTERNAL_ALPHA_API_BASE_URL = 'http://127.0.0.1:$apiPort'
`$env:INTERNAL_ALPHA_POSTGRES_PORT = '$postgresPort'
`$env:INTERNAL_ALPHA_COMPOSE_PROJECT = 'job-compliance-alpha-local-$apiPort'
`$env:INTERNAL_ALPHA_POSTGRES_PASSWORD = '$databasePassword'
`$env:DATABASE_URL = 'postgresql://alpha_local:$escapedPassword@127.0.0.1:$postgresPort/job_compliance_alpha'
`$env:LLM_SECRET_ENCRYPTION_KEY = '$encryptionKey'
`$env:LLM_SECRET_ENCRYPTION_KEY_VERSION = 'local-alpha-v1'
`$env:DEV_EXTENSION_AUTH_ENABLED = 'true'
`$env:DEV_EXTENSION_AUTH_TOKEN = '$developmentToken'
`$env:DEV_EXTENSION_TENANT_ID = 'local-internal-alpha'
`$env:DEV_EXTENSION_ORIGINS = ''
"@ | Set-Content -LiteralPath $configPath -Encoding UTF8
}

Import-AlphaLocalConfig | Out-Null
if ([string]::IsNullOrWhiteSpace($env:INTERNAL_ALPHA_COMPOSE_PROJECT)) {
  "`$env:INTERNAL_ALPHA_COMPOSE_PROJECT = 'job-compliance-alpha-local-$($env:PORT)'" | Add-Content -LiteralPath $configPath -Encoding UTF8
  Import-AlphaLocalConfig | Out-Null
}
Invoke-AlphaLocalCompose -Arguments @('up', '--detach', 'postgres-alpha-local')
Wait-AlphaLocalPostgres

npm run db:migrate
if ($LASTEXITCODE -ne 0) { throw 'Local Alpha migration failed.' }

$tenantSql = @"
INSERT INTO tenant_members (id, tenant_id, user_id, role, payload)
VALUES ('local-alpha-dev-member', 'local-internal-alpha', 'local-extension-dev', 'AUDIT_OPERATOR', '{"source":"local-alpha-bootstrap"}'::jsonb)
ON CONFLICT (tenant_id, user_id) DO UPDATE
SET role = EXCLUDED.role, payload = EXCLUDED.payload;
"@
$tenantSql | & docker compose --project-name $env:INTERNAL_ALPHA_COMPOSE_PROJECT -f docker-compose.alpha-local.yml exec -T postgres-alpha-local psql -U alpha_local -d job_compliance_alpha -v ON_ERROR_STOP=1 *> $null
if ($LASTEXITCODE -ne 0) { throw 'Local Alpha tenant initialization failed.' }

npm run build:packages
if ($LASTEXITCODE -ne 0) { throw 'Package build failed.' }
npm run build --workspace @job-compliance/api
if ($LASTEXITCODE -ne 0) { throw 'API build failed.' }
npm run build:extension
if ($LASTEXITCODE -ne 0) { throw 'Extension build failed.' }
npm run doctor:internal-alpha-readiness
if ($LASTEXITCODE -ne 0) { throw 'Readiness doctor failed.' }

Write-Output 'Local Alpha database, fixed local tenant, and local-only credentials are ready.'
Write-Output 'Next: load apps/extension as an unpacked Chrome extension, copy its 32-character ID, then run:'
Write-Output '  npm run alpha:local:configure-extension -- --extension-id <extension-id>'
Write-Output 'No token, database URL, or extension ID was printed.'
