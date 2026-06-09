$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Supabase = Join-Path $ProjectRoot "tools\supabase\supabase.exe"
$ProjectRef = "tdbssdethpdpxdhhgjtq"

Set-Location $ProjectRoot

Write-Host "Use a long random token. The Android listener app must send this as x-bot-token."
$Token = Read-Host "Paste KAKAO_BOT_INGEST_TOKEN"

if ([string]::IsNullOrWhiteSpace($Token)) {
  throw "KAKAO_BOT_INGEST_TOKEN is empty."
}

if ($Token.Length -lt 24) {
  Write-Warning "This token is short. Use at least 24 random characters for real use."
}

& $Supabase secrets set "KAKAO_BOT_INGEST_TOKEN=$Token" --project-ref $ProjectRef

Write-Host "Kakao bot ingest token was saved to Supabase."
Write-Host "Redeploying kakao-ops so the new secret is active."

& $Supabase functions deploy kakao-ops --project-ref $ProjectRef

Write-Host "Done."
