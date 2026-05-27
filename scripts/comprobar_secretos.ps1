param(
    [switch]$IncludeLocal
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$excludedDirs = @(
    "\.git\",
    "\.venv\",
    "\venv\",
    "\env\",
    "\node_modules\",
    "\dist\",
    "\build\",
    "\__pycache__\",
    "\.idea\",
    "\deploy\aws-cli\.outputs\",
    "\outputs\"
)

$excludedFilePatterns = @(
    "^\.env$",
    "^\.env\.",
    "\\\.env$",
    "\\\.env\.",
    "^ecs-task.*\.json$",
    "\\ecs-task.*\.json$",
    "^s3-policy\.json$",
    "\\s3-policy\.json$",
    "\.pem$",
    "\.key$",
    "\.p12$",
    "\.pfx$",
    "\.zip$",
    "\.tar$",
    "\.tgz$",
    "\.gz$",
    "\.sql$",
    "\.dump$",
    "\.backup$"
)

function Test-IsExcludedPath {
    param([string]$Path)
    $normalized = "\" + ($Path -replace "/", "\")
    foreach ($dir in $excludedDirs) {
        if ($normalized.Contains($dir)) {
            return $true
        }
    }
    foreach ($pattern in $excludedFilePatterns) {
        if ($normalized -match $pattern) {
            $isExample = $normalized -match "\.env.*\.example$"
            if (-not $isExample) { return $true }
        }
    }
    return $false
}

function Get-FilesToScan {
    if ($IncludeLocal) {
        return Get-ChildItem -Path $repoRoot -Recurse -File -Force |
            Where-Object {
                -not (Test-IsExcludedPath -Path $_.FullName.Substring($repoRoot.Length)) -and
                $_.Length -lt 2MB
            } |
            ForEach-Object { $_.FullName }
    }

    return git ls-files | ForEach-Object { Join-Path $repoRoot $_ }
}

function Test-IsPlaceholder {
    param([string]$Value)
    $value = ($Value.Trim().Trim('"').Trim("'"))
    if ([string]::IsNullOrWhiteSpace($value)) { return $true }

    $lowered = $value.ToLowerInvariant()
    $markers = @(
        "xxx",
        "pendiente",
        "placeholder",
        "example",
        "...",
        "cambiar",
        "generar_",
        "change-me",
        "change_me",
        "tu_",
        "tudominio.com",
        "rds-endpoint",
        "rds_endpoint",
        "long_random_secret",
        "redis-endpoint",
        "endpoint-redis",
        "<",
        ">",
        "localhost",
        "postgres:postgres",
        "redis://localhost",
        "redis://redis",
        "dev-local-change-me",
        "jwt-local-change-me",
        "os.environ",
        "postgresql://postgres:postgres@db",
        "your-",
        "tu_",
        "cambia_",
        "otro_secreto",
        "`$"
    )

    foreach ($marker in $markers) {
        if ($lowered.Contains($marker)) { return $true }
    }
    return $false
}

$highConfidencePatterns = @(
    @{ Name = "AWS_ACCESS_KEY_ID"; Pattern = "(A3T[A-Z0-9]|AKIA|ASIA)[A-Z0-9]{16}" },
    @{ Name = "AWS_SECRET_ACCESS_KEY"; Pattern = "(?i)aws(.{0,20})?(secret|private).{0,20}[A-Za-z0-9/+=]{40}" },
    @{ Name = "STRIPE_SECRET_KEY"; Pattern = "sk_(live|test)_[A-Za-z0-9]{10,}" },
    @{ Name = "STRIPE_WEBHOOK_SECRET"; Pattern = "whsec_[A-Za-z0-9]{10,}" },
    @{ Name = "PRIVATE_KEY"; Pattern = "-----BEGIN (RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----" }
)

$sensitiveAssignments = @(
    "SECRET_KEY",
    "JWT_SECRET_KEY",
    "MAIL_PASSWORD",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "DATABASE_URL",
    "REDIS_URL",
    "CELERY_BROKER_URL",
    "CELERY_RESULT_BACKEND",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "FINNHUB_API_KEY"
)

$findings = New-Object System.Collections.Generic.List[string]

foreach ($file in Get-FilesToScan) {
    if (-not (Test-Path -LiteralPath $file)) { continue }
    $relativePath = Resolve-Path -LiteralPath $file -Relative
    $lineNumber = 0

    foreach ($line in Get-Content -LiteralPath $file -ErrorAction SilentlyContinue) {
        $lineNumber++

        foreach ($item in $highConfidencePatterns) {
            if ($line -match $item.Pattern) {
                $findings.Add("$relativePath`:$lineNumber $($item.Name)")
            }
        }

        foreach ($key in $sensitiveAssignments) {
            $assignmentPattern = "^\s*$key\s*[=:]\s*(.+)\s*$"
            if ($line -cmatch $assignmentPattern) {
                $value = $matches[1]
                if (-not (Test-IsPlaceholder -Value $value)) {
                    $findings.Add("$relativePath`:$lineNumber $key")
                }
            }
        }
    }
}

if ($findings.Count -gt 0) {
    Write-Host "Posibles secretos detectados (no se muestran valores):" -ForegroundColor Red
    $findings | Sort-Object -Unique | ForEach-Object { Write-Host " - $_" -ForegroundColor Red }
    exit 1
}

Write-Host "No se han detectado secretos de alta confianza." -ForegroundColor Green
