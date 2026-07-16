param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Command)
if (-not $env:TEST_DATABASE_URL -and (Test-Path '.env.test')) {
  Get-Content '.env.test' | ForEach-Object {
    if ($_ -match '^\s*TEST_DATABASE_URL\s*=\s*(.+)\s*$') { $env:TEST_DATABASE_URL = $Matches[1].Trim('"').Trim("'") }
  }
}
if (-not $env:TEST_DATABASE_URL) { Write-Error 'TEST_DATABASE_URL is required. Set it temporarily or copy .env.test.example to .env.test.'; exit 1 }
$env:DATABASE_URL = $env:TEST_DATABASE_URL
& $Command[0] $Command[1..($Command.Count - 1)]
exit $LASTEXITCODE
