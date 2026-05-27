Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$defaultDest = Join-Path (Split-Path $root -Parent) "MyPredictsPRO_GitHub"
$dest = if ($args.Count -gt 0) { $args[0] } else { $defaultDest }

Write-Host "Origen:  $root"
Write-Host "Destino: $dest"

if (Test-Path -LiteralPath $dest) {
    throw "La carpeta destino ya existe. Borra o renombra '$dest' antes de exportar."
}

New-Item -ItemType Directory -Path $dest | Out-Null

$excludeDirs = @(
    ".git",
    ".idea",
    ".vscode",
    ".venv",
    ".outputs",
    "venv",
    "node_modules",
    "frontend\node_modules",
    "frontend\dist",
    "frontend\.vite",
    "backend\.venv",
    "backend\venv",
    "dist",
    "outputs",
    "__pycache__",
    ".pytest_cache",
    "deploy\aws-cli\.outputs"
)

$excludeFiles = @(
    ".env",
    ".env.*",
    "*.pem",
    "*.key",
    "*.p12",
    "*.pfx",
    "*.log",
    "*.zip",
    "*.7z",
    "*.tar",
    "*.tgz",
    "*.gz",
    "*.rar",
    "*.dump",
    "*.backup",
    "*.sql",
    "*.psql",
    "ecs-task*.json",
    "s3-policy.json",
    "vite.config.js.timestamp-*.mjs",
    "config.ps1"
)

$robocopyArgs = @(
    $root,
    $dest,
    "/E",
    "/XD"
) + $excludeDirs + @(
    "/XF"
) + $excludeFiles + @(
    "/R:1",
    "/W:1",
    "/NFL",
    "/NDL",
    "/NP"
)

robocopy @robocopyArgs | Out-Host
$code = $LASTEXITCODE
if ($code -gt 7) {
    throw "Robocopy fallo con codigo $code"
}

$exampleEnvFiles = Get-ChildItem -LiteralPath $root -Recurse -Force -File |
    Where-Object {
        $_.Name -like ".env*.example" -and
        -not ($_.FullName -like "*\.git\*") -and
        -not ($_.FullName -like "*\node_modules\*") -and
        -not ($_.FullName -like "*\.venv\*") -and
        -not ($_.FullName -like "*\deploy\aws-cli\.outputs\*")
    }

foreach ($file in $exampleEnvFiles) {
    $relative = $file.FullName.Substring($root.Path.Length).TrimStart("\", "/")
    $target = Join-Path $dest $relative
    $targetDir = Split-Path -Parent $target
    if (-not (Test-Path -LiteralPath $targetDir)) {
        New-Item -ItemType Directory -Path $targetDir | Out-Null
    }
    Copy-Item -LiteralPath $file.FullName -Destination $target -Force
}

Push-Location $dest
try {
    git init | Out-Host
    git status --short | Out-Host
    Write-Host ""
    Write-Host "Export limpio creado. Revisa el estado y luego ejecuta:"
    Write-Host "  git add ."
    Write-Host "  git commit -m `"Version limpia para GitHub`""
    Write-Host "  git branch -M main"
    Write-Host "  git remote add origin URL_DE_TU_REPO"
    Write-Host "  git push -u origin main"
} finally {
    Pop-Location
}
