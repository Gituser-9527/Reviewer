param([ValidateSet('up', 'down', 'reset', 'wait')] [string]$Action = 'up')
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker Desktop is required. Install/start Docker, then run npm run test:db:up.' }
$compose = 'docker compose -f docker-compose.test.yml'
if ($Action -eq 'up') { Invoke-Expression "$compose up -d postgres-test"; exit $LASTEXITCODE }
if ($Action -eq 'down') { Invoke-Expression "$compose down -v"; exit $LASTEXITCODE }
if ($Action -eq 'reset') { Invoke-Expression "$compose down -v"; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; Invoke-Expression "$compose up -d postgres-test"; exit $LASTEXITCODE }
for ($i = 0; $i -lt 30; $i++) { docker compose -f docker-compose.test.yml exec -T postgres-test pg_isready -U test_user -d job_compliance_test; if ($LASTEXITCODE -eq 0) { exit 0 }; Start-Sleep -Seconds 1 }
throw 'Test PostgreSQL did not become ready.'
