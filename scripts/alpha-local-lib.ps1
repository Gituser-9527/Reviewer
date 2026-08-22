Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $repoRoot

function Get-AlphaLocalConfigPath {
  return Join-Path $PSScriptRoot '..\.local\internal-alpha\env.ps1'
}

function Import-AlphaLocalConfig {
  $configPath = Get-AlphaLocalConfigPath
  if (-not (Test-Path -LiteralPath $configPath)) {
    throw 'Local Alpha is not configured. Run npm run alpha:local:setup first.'
  }
  . $configPath
  return $configPath
}

function Get-FreeLoopbackPort {
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
  try {
    $listener.Start()
    return ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
  } finally {
    $listener.Stop()
  }
}

function New-AlphaLocalRandomBase64 {
  param([Parameter(Mandatory = $true)][int]$ByteLength)
  $bytes = [byte[]]::new($ByteLength)
  $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $generator.GetBytes($bytes)
    return [Convert]::ToBase64String($bytes)
  } finally {
    $generator.Dispose()
  }
}

function Invoke-AlphaLocalCompose {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
  if ([string]::IsNullOrWhiteSpace($env:INTERNAL_ALPHA_COMPOSE_PROJECT)) {
    throw 'Local Alpha Compose project is missing. Run npm run alpha:local:setup first.'
  }
  & docker compose --project-name $env:INTERNAL_ALPHA_COMPOSE_PROJECT -f docker-compose.alpha-local.yml @Arguments
  if ($LASTEXITCODE -ne 0) { throw 'Local Alpha PostgreSQL command failed.' }
}

function Assert-AlphaLocalPrerequisites {
  foreach ($command in @('node', 'npm', 'docker')) {
    if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
      throw "$command is required. Install it and retry."
    }
  }
  & docker info *> $null
  if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop is required and must be running.' }
  if (-not (Test-Path -LiteralPath 'node_modules')) { throw 'Dependencies are missing. Run npm ci first.' }
}

function Wait-AlphaLocalPostgres {
  for ($i = 0; $i -lt 30; $i++) {
    & docker compose --project-name $env:INTERNAL_ALPHA_COMPOSE_PROJECT -f docker-compose.alpha-local.yml exec -T postgres-alpha-local pg_isready -U alpha_local -d job_compliance_alpha *> $null
    if ($LASTEXITCODE -eq 0) { return }
    Start-Sleep -Seconds 1
  }
  throw 'Local Alpha PostgreSQL did not become ready.'
}
