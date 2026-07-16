$result = 'READY'
if (-not $env:TEST_DATABASE_URL -and (Test-Path '.env.test')) {
  Get-Content '.env.test' | ForEach-Object {
    if ($_ -match '^\s*TEST_DATABASE_URL\s*=\s*(.+)\s*$') { $env:TEST_DATABASE_URL = $Matches[1].Trim('"').Trim("'") }
  }
}
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { $result = 'DOCKER_NOT_INSTALLED' }
elseif ((docker info 2>$null) -eq $null -or $LASTEXITCODE -ne 0) { $result = 'DOCKER_DAEMON_NOT_RUNNING' }
elseif (-not $env:TEST_DATABASE_URL) { $result = 'TEST_DATABASE_URL_MISSING' }
elseif (Get-NetTCPConnection -LocalPort 5433 -ErrorAction SilentlyContinue) { $result = 'PORT_ALREADY_IN_USE' }
Write-Output $result
switch ($result) {
  'DOCKER_NOT_INSTALLED' { Write-Output 'Install and start Docker Desktop, then run npm run test:db:up.' }
  'DOCKER_DAEMON_NOT_RUNNING' { Write-Output 'Start Docker Desktop, then run npm run test:db:up.' }
  'TEST_DATABASE_URL_MISSING' { Write-Output 'Set TEST_DATABASE_URL temporarily or copy .env.test.example to .env.test, then run npm run test:db:migrate.' }
  'PORT_ALREADY_IN_USE' { Write-Output 'Port 5433 is occupied; stop the conflicting test container or choose another test port.' }
  default { Write-Output 'Run npm run test:db:wait, npm run test:db:migrate, then npm run test:postgres.' }
}
if ($result -ne 'READY') { exit 1 }
