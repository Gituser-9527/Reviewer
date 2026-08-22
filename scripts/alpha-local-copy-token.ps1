. "$PSScriptRoot\alpha-local-lib.ps1"
Import-AlphaLocalConfig | Out-Null
Set-Clipboard -Value $env:DEV_EXTENSION_AUTH_TOKEN
Write-Output 'The local-only development token was copied to this user clipboard. Paste it once into the unpacked Extension configuration, then clear the clipboard. It was not printed.'
