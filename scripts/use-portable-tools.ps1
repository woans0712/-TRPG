$ProjectRoot = Split-Path -Parent $PSScriptRoot
$GitPath = Join-Path $ProjectRoot "tools\git\cmd"
$SupabasePath = Join-Path $ProjectRoot "tools\supabase"

$env:Path = "$GitPath;$SupabasePath;$env:Path"

Write-Host "Portable Git and Supabase CLI are ready in this PowerShell session."
Write-Host "git:      $GitPath\git.exe"
Write-Host "supabase: $SupabasePath\supabase.exe"
