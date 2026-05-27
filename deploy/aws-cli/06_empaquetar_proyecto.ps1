Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$appName = if ($env:MYPREDICTS_APP) { $env:MYPREDICTS_APP } else { "mypredicts" }
$outputDir = Join-Path $PSScriptRoot ".outputs"
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

$stage = Join-Path $outputDir "package-stage"
$archive = Join-Path $outputDir "$appName-package.tar.gz"

if (Test-Path $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
New-Item -ItemType Directory -Force -Path $stage | Out-Null

$excludePathFragments = @(
    "\.git\",
    "\.idea\",
    "\.venv\",
    "\venv\",
    "\env\",
    "\node_modules\",
    "\frontend\node_modules\",
    "\frontend\dist\",
    "\dist\",
    "\build\",
    "\.pytest_cache\",
    "\__pycache__\",
    "\deploy\aws-cli\.outputs\",
    "\outputs\"
)
$excludeNames = @(".flaskenv", "config.ps1", "config.local.ps1")
$excludePatterns = @(
    "*.pem",
    "*.key",
    "*.p12",
    "*.pfx",
    "*.pyc",
    "*.log",
    "*.sqlite",
    "*.sqlite3",
    "*.db",
    "*.zip",
    "*.7z",
    "*.tar",
    "*.tgz",
    "*.gz",
    "vite.config.js.timestamp-*.mjs",
    "ecs-task*.json",
    "s3-policy.json"
)

Get-ChildItem -LiteralPath $repoRoot -Recurse -Force -File | ForEach-Object {
    $relative = $_.FullName.Substring($repoRoot.Path.Length)
    $skip = $false
    foreach ($fragment in $excludePathFragments) { if ($relative.Contains($fragment)) { $skip = $true } }
    if ($excludeNames -contains $_.Name) { $skip = $true }
    foreach ($pattern in $excludePatterns) { if ($_.Name -like $pattern) { $skip = $true } }
    if ($_.Name -like ".env*" -and $_.Name -notlike "*.example") { $skip = $true }
    if (-not $skip) {
        $target = Join-Path $stage $relative.TrimStart("\")
        New-Item -ItemType Directory -Force -Path (Split-Path $target -Parent) | Out-Null
        Copy-Item -LiteralPath $_.FullName -Destination $target -Force
    }
}

if (Test-Path $archive) { Remove-Item -LiteralPath $archive -Force }
tar.exe -czf $archive -C $stage .

Write-Host "Paquete creado: $archive"
