$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Supabase = Join-Path $ProjectRoot "tools\supabase\supabase.exe"
$ProjectRef = "tdbssdethpdpxdhhgjtq"

Set-Location $ProjectRoot

Write-Host "Linking Supabase project: $ProjectRef"
& $Supabase link --project-ref $ProjectRef

Write-Host "Setting fast OpenAI model"
& $Supabase secrets set "OPENAI_MODEL=gpt-4.1-nano" --project-ref $ProjectRef

Write-Host "Deploying start-event function"
& $Supabase functions deploy start-event

Write-Host "Deploying judge-action function"
& $Supabase functions deploy judge-action

Write-Host "Deploying clear-messages function"
& $Supabase functions deploy clear-messages

Write-Host "Deploying admin-manage-user function"
& $Supabase functions deploy admin-manage-user

Write-Host "Deploying game2-action function"
& $Supabase functions deploy game2-action

Write-Host "Done. Supabase Edge Functions are deployed."
