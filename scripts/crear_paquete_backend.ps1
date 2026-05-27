param(
    [string]$Output = "dist\mypredicts-backend.zip"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$backendRoot = Join-Path $repoRoot "backend"
$distRoot = Join-Path $repoRoot "dist"
$stageRoot = Join-Path $distRoot "backend-package"
$outputPath = Join-Path $repoRoot $Output

powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "comprobar_secretos.ps1")

if (Test-Path -LiteralPath $stageRoot) {
    Remove-Item -LiteralPath $stageRoot -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $stageRoot | Out-Null

$excludedDirs = @(
    ".git",
    ".venv",
    "venv",
    "env",
    "__pycache__",
    ".pytest_cache",
    "tests",
    "logs",
    "instance"
)

$excludedFiles = @(
    ".env",
    ".flaskenv",
    ".env.example",
    ".env.production.example",
    "docker-compose.yml",
    "Dockerfile",
    ".dockerignore",
    "*.pyc",
    "*.pyo",
    "*.log",
    "*.db",
    "*.sqlite",
    "*.sqlite3",
    "*.pem",
    "*.key",
    "*.p12",
    "*.pfx"
)

function Test-ExcludedFileName {
    param([string]$FileName)
    foreach ($pattern in $excludedFiles) {
        if ($FileName -like $pattern) {
            return $true
        }
    }
    return $false
}

Get-ChildItem -Path $backendRoot -Force | ForEach-Object {
    $name = $_.Name
    $skip = (
        ($_.PSIsContainer -and $excludedDirs -contains $name) -or
        (-not $_.PSIsContainer -and (Test-ExcludedFileName -FileName $name))
    )
    if (-not $skip) {
        Copy-Item -LiteralPath $_.FullName -Destination $stageRoot -Recurse -Force
    }
}

Get-ChildItem -Path $stageRoot -Recurse -Force |
    Where-Object {
        ($_.PSIsContainer -and $excludedDirs -contains $_.Name) -or
        (-not $_.PSIsContainer -and (Test-ExcludedFileName -FileName $_.Name))
    } |
    Remove-Item -Recurse -Force

if (Test-Path -LiteralPath $outputPath) {
    Remove-Item -LiteralPath $outputPath -Force
}
Compress-Archive -Path (Join-Path $stageRoot "*") -DestinationPath $outputPath -Force

Write-Host "Paquete backend creado: $outputPath" -ForegroundColor Green

