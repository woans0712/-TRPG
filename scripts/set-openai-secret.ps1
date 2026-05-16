$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Supabase = Join-Path $ProjectRoot "tools\supabase\supabase.exe"
$ProjectRef = "tdbssdethpdpxdhhgjtq"

Set-Location $ProjectRoot

Write-Host "OpenAI API key usually starts with sk- or sk-proj-."
$OpenAIKey = Read-Host "Paste OPENAI_API_KEY"

if ([string]::IsNullOrWhiteSpace($OpenAIKey)) {
  throw "OPENAI_API_KEY is empty."
}

if (-not ($OpenAIKey.StartsWith("sk-") -or $OpenAIKey.StartsWith("sk-proj-"))) {
  Write-Warning "This does not look like a normal OpenAI API key. It may fail. Continue only if you are sure."
}

& $Supabase secrets set "OPENAI_API_KEY=$OpenAIKey" --project-ref $ProjectRef
& $Supabase secrets set "OPENAI_MODEL=gpt-4.1-mini" --project-ref $ProjectRef

Write-Host "OpenAI secrets were saved to Supabase."
Write-Host "Redeploying Edge Functions so the new secrets are active."

& $Supabase functions deploy start-event --project-ref $ProjectRef
& $Supabase functions deploy judge-action --project-ref $ProjectRef

Write-Host "Done. Refresh the site and try a new event/action."
