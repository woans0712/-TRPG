$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Supabase = Join-Path $ProjectRoot "tools\supabase\supabase.exe"
$ProjectRef = "tdbssdethpdpxdhhgjtq"

Set-Location $ProjectRoot

Write-Host "Linking Supabase project: $ProjectRef"
& $Supabase link --project-ref $ProjectRef

Write-Host "Applying Supabase migrations"
& $Supabase db push --linked

Write-Host "Done. Database migrations were applied."
