param(
    [ValidateSet("actualizar", "primera-instalacion")]
    [string]$Modo = "actualizar",

    [switch]$CrearRds,
    [switch]$UsarCloudFront,
    [switch]$SoloBackend,
    [switch]$SoloFrontend,
    [switch]$OmitirRevisionCostes
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$configPath = Join-Path $PSScriptRoot "config.ps1"

if (-not (Test-Path $configPath)) {
    throw "Falta deploy/aws-cli/config.ps1. Copia 00_configuracion_ejemplo.ps1 como config.ps1 y rellena los valores necesarios."
}

. $configPath

function Invoke-Step {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Path,
        [string[]]$Arguments = @()
    )

    if (-not (Test-Path $Path)) {
        throw "No existe el script requerido: $Path"
    }

    Write-Host ""
    Write-Host "==> $Name" -ForegroundColor Cyan
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Path @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Fallo el paso: $Name"
    }
}

function Confirm-AwsSession {
    Write-Host "Comprobando credenciales AWS..." -ForegroundColor Cyan
    $identityRaw = aws sts get-caller-identity
    if ($LASTEXITCODE -ne 0) {
        throw "AWS CLI no tiene una sesion valida. Configura access key, secret key, session token y region."
    }

    $identity = $identityRaw | ConvertFrom-Json
    $region = aws configure get region
    if ([string]::IsNullOrWhiteSpace($region)) {
        $region = $env:AWS_DEFAULT_REGION
    }
    if ([string]::IsNullOrWhiteSpace($region)) {
        $region = $Global:AWS_REGION
    }

    Write-Host ("Cuenta AWS: {0}" -f $identity.Account) -ForegroundColor Green
    Write-Host ("Region: {0}" -f $region) -ForegroundColor Green
}

if ($SoloBackend -and $SoloFrontend) {
    throw "Usa SoloBackend o SoloFrontend, no ambos a la vez."
}

Confirm-AwsSession

$secretScan = Join-Path $repoRoot "scripts\comprobar_secretos.ps1"
$psSyntax = Join-Path $repoRoot "scripts\validar_sintaxis_ps1.ps1"

Invoke-Step "Escaneo de secretos antes de empaquetar" $secretScan @("-IncludeLocal")
Invoke-Step "Validacion de sintaxis PowerShell" $psSyntax

if (-not $OmitirRevisionCostes) {
    Invoke-Step "Revision de recursos vivos y coste" (Join-Path $PSScriptRoot "01_revisar_costes_existentes.ps1")
}

if ($Modo -eq "primera-instalacion") {
    Invoke-Step "Crear grupos de seguridad" (Join-Path $PSScriptRoot "02_crear_grupos_seguridad.ps1")

    if ($CrearRds) {
        Invoke-Step "Crear RDS PostgreSQL opcional" (Join-Path $PSScriptRoot "03_crear_rds_opcional.ps1")
    } else {
        Write-Host "RDS omitido. Se usara la configuracion indicada en config.ps1/api.env." -ForegroundColor Yellow
    }

    Invoke-Step "Crear EC2" (Join-Path $PSScriptRoot "04_crear_ec2.ps1")
    Invoke-Step "Preparar EC2" (Join-Path $PSScriptRoot "05_preparar_ec2.ps1")

    if ($UsarCloudFront) {
        Invoke-Step "Crear S3 privado y CloudFront" (Join-Path $PSScriptRoot "08_crear_s3_cloudfront.ps1")
    } else {
        Write-Host "CloudFront omitido. El frontend se servira con el fallback disponible si no hay distribucion creada." -ForegroundColor Yellow
    }
}

if (-not $SoloFrontend) {
    Invoke-Step "Empaquetar proyecto sin secretos" (Join-Path $PSScriptRoot "06_empaquetar_proyecto.ps1")
    Invoke-Step "Subir backend y reiniciar servicios" (Join-Path $PSScriptRoot "07_subir_backend.ps1")
}

if (-not $SoloBackend) {
    Invoke-Step "Compilar y desplegar frontend" (Join-Path $PSScriptRoot "09_desplegar_frontend.ps1")
}

Invoke-Step "Comprobar despliegue" (Join-Path $PSScriptRoot "11_comprobar_despliegue.ps1")

Write-Host ""
Write-Host "Despliegue terminado." -ForegroundColor Green
Write-Host ("Frontend: https://www.{0}" -f $Global:DOMAIN)
Write-Host ("API health: https://{0}/api/health" -f $Global:API_DOMAIN)
