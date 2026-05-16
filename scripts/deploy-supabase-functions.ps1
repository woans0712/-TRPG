$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Supabase = Join-Path $ProjectRoot "tools\supabase\supabase.exe"
$ProjectRef = "tdbssdethpdpxdhhgjtq"

Set-Location $ProjectRoot

Write-Host "Linking Supabase project: $ProjectRef"
& $Supabase link --project-ref $ProjectRef

Write-Host "Deploying start-event function"
& $Supabase functions deploy start-event

Write-Host "Deploying judge-action function"
& $Supabase functions deploy judge-action

Write-Host "Done. Supabase Edge Functions are deployed."
