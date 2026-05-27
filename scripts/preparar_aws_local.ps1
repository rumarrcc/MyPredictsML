param(
    [switch]$SkipFrontendBuild,
    [switch]$SkipPackage
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$frontendRoot = Join-Path $repoRoot "frontend"
$frontendEnv = Join-Path $frontendRoot ".env.production"
$frontendEnvExample = Join-Path $frontendRoot ".env.production.example"

# mcajamar - 04/05/2026: preparé los scripts de despliegue para EC2, RDS, Nginx, Gunicorn y frontend.
function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "== $Message ==" -ForegroundColor Cyan
}

function Invoke-BackendCompile {
    $pythonCandidates = @(
        (Join-Path $repoRoot "backend\.venv\Scripts\python.exe"),
        (Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"),
        "python",
        "py"
    )

    foreach ($candidate in $pythonCandidates) {
        try {
            if ($candidate -eq "py") {
                & py -3 --version | Out-Null
                & py -3 -m py_compile `
                    (Join-Path $repoRoot "backend\app\__init__.py") `
                    (Join-Path $repoRoot "backend\app\routes\auth.py") `
                    (Join-Path $repoRoot "backend\app\routes\billing.py") `
                    (Join-Path $repoRoot "backend\app\routes\coin_payments.py") `
                    (Join-Path $repoRoot "backend\manage_db.py") `
                    (Join-Path $repoRoot "backend\wsgi.py")
                return
            }

            if (-not (Test-Path -LiteralPath $candidate) -and $candidate -like "*\*") {
                continue
            }

            & $candidate --version | Out-Null
            & $candidate -m py_compile `
                (Join-Path $repoRoot "backend\app\__init__.py") `
                (Join-Path $repoRoot "backend\app\routes\auth.py") `
                (Join-Path $repoRoot "backend\app\routes\billing.py") `
                (Join-Path $repoRoot "backend\app\routes\coin_payments.py") `
                (Join-Path $repoRoot "backend\manage_db.py") `
                (Join-Path $repoRoot "backend\wsgi.py")
            return
        } catch {
            continue
        }
    }

    throw "No se encontro un Python utilizable. Activa backend\.venv o instala Python antes de preparar AWS."
}

Write-Step "Comprobando secretos versionables"
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "comprobar_secretos.ps1")

Write-Step "Validando sintaxis PowerShell"
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "validar_sintaxis_ps1.ps1")

Write-Step "Validando backend Python"
Invoke-BackendCompile

if (-not $SkipFrontendBuild) {
    Write-Step "Preparando frontend production env"
    if (-not (Test-Path -LiteralPath $frontendEnv)) {
        Copy-Item -LiteralPath $frontendEnvExample -Destination $frontendEnv
        Write-Host "Creado frontend\.env.production desde el ejemplo. Revisa VITE_API_URL antes del deploy final." -ForegroundColor Yellow
    }

    Write-Step "Compilando frontend"
    Push-Location $frontendRoot
    try {
        & npm.cmd run build
    } finally {
        Pop-Location
    }
}

if (-not $SkipPackage) {
    Write-Step "Creando paquete local para EC2"
    & powershell -ExecutionPolicy Bypass -File (Join-Path $repoRoot "deploy\aws-cli\06_empaquetar_proyecto.ps1")
}

Write-Host ""
Write-Host "Preparacion local para AWS completada. No se ha subido nada." -ForegroundColor Green

