if (-not $env:TEST_DATABASE_URL) {
  throw 'TEST_DATABASE_URL is required for PostgreSQL production enrichment E2E'
}

$env:DATABASE_URL = $env:TEST_DATABASE_URL
& npx vitest run --config vitest.postgres.config.ts apps/api/src/audit/production-enrichment.postgres.test.ts
exit $LASTEXITCODE
