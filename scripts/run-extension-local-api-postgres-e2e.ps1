param()

$ErrorActionPreference = 'Stop'

if (-not $env:TEST_DATABASE_URL -and (Test-Path '.env.test')) {
  Get-Content '.env.test' | ForEach-Object {
    if ($_ -match '^\s*TEST_DATABASE_URL\s*=\s*(.+)\s*$') {
      $env:TEST_DATABASE_URL = $Matches[1].Trim('"').Trim("'")
    }
  }
}

if (-not $env:TEST_DATABASE_URL) {
  throw 'TEST_DATABASE_URL is required for the local API PostgreSQL extension E2E.'
}

$env:DATABASE_URL = $env:TEST_DATABASE_URL
$databaseStarted = $false

try {
  & npm run test:db:up
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  $databaseStarted = $true

  & npm run test:db:wait
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  & npm run test:db:migrate
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  & npm run build:packages
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  & npm run build --workspace @job-compliance/api
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  & npm run build:extension
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  & node apps/extension/e2e/local-api-postgres.e2e.mjs
  exit $LASTEXITCODE
}
finally {
  if ($databaseStarted) {
    & npm run test:db:down
  }
}
