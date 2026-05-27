Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$files = @()
$files += Get-ChildItem -Path (Join-Path $repoRoot "deploy\aws-cli") -Filter "*.ps1" -File -ErrorAction SilentlyContinue
$files += Get-ChildItem -Path $PSScriptRoot -Filter "*.ps1" -File -ErrorAction SilentlyContinue

$errors = New-Object System.Collections.Generic.List[string]
foreach ($file in $files) {
    $tokens = $null
    $parseErrors = $null
    [System.Management.Automation.Language.Parser]::ParseFile($file.FullName, [ref]$tokens, [ref]$parseErrors) | Out-Null
    foreach ($errorItem in $parseErrors) {
        $errors.Add(("{0}:{1}:{2}" -f $errorItem.Extent.File, $errorItem.Extent.StartLineNumber, $errorItem.Message))
    }
}

if ($errors.Count -gt 0) {
    $errors | ForEach-Object { Write-Host $_ -ForegroundColor Red }
    exit 1
}

Write-Host "PowerShell syntax OK" -ForegroundColor Green
