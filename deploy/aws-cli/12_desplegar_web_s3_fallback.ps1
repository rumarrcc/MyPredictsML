Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\config.ps1"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$frontend = Join-Path $repoRoot "frontend"
$ec2Path = Join-Path $Global:OUTPUT_DIR "ec2.json"
if (-not (Test-Path $ec2Path)) { throw "No existe ec2.json. Ejecuta primero 04_crear_ec2.ps1." }

$ec2 = Get-Content $ec2Path | ConvertFrom-Json
$apiUrl = "http://$($ec2.PublicIp)"
$websiteUrl = "http://$($Global:S3_BUCKET).s3-website-$($Global:AWS_REGION).amazonaws.com"

function Write-JsonNoBom {
    param(
        [Parameter(Mandatory=$true)][string]$Path,
        [Parameter(Mandatory=$true)][object]$Value,
        [int]$Depth = 10
    )
    $json = $Value | ConvertTo-Json -Depth $Depth
    $encoding = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $json, $encoding)
}

@"
VITE_API_URL=$apiUrl
VITE_APP_NAME=MyPredicts
VITE_APP_ENV=production
"@ | Out-File -Encoding utf8 (Join-Path $frontend ".env.production")

Push-Location $frontend
npm.cmd ci
npm.cmd run build
Pop-Location

$bucketExists = $true
aws s3api head-bucket --bucket $Global:S3_BUCKET 2>$null
if ($LASTEXITCODE -ne 0) { $bucketExists = $false }
if (-not $bucketExists) {
    if ($Global:AWS_REGION -eq "us-east-1") {
        aws s3api create-bucket --bucket $Global:S3_BUCKET --region $Global:AWS_REGION | Out-Null
    } else {
        aws s3api create-bucket --bucket $Global:S3_BUCKET --region $Global:AWS_REGION --create-bucket-configuration LocationConstraint=$Global:AWS_REGION | Out-Null
    }
}

aws s3api put-public-access-block --bucket $Global:S3_BUCKET --public-access-block-configuration "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false" | Out-Null

$websiteConfigPath = Join-Path $Global:OUTPUT_DIR "s3-website-config.json"
Write-JsonNoBom -Path $websiteConfigPath -Depth 5 -Value @{
    IndexDocument = @{ Suffix = "index.html" }
    ErrorDocument = @{ Key = "index.html" }
}
aws s3api put-bucket-website --bucket $Global:S3_BUCKET --website-configuration "file://$websiteConfigPath" | Out-Null

$policyPath = Join-Path $Global:OUTPUT_DIR "s3-website-policy.json"
Write-JsonNoBom -Path $policyPath -Depth 10 -Value @{
    Version = "2012-10-17"
    Statement = @(@{
        Sid = "PublicReadStaticWebsite"
        Effect = "Allow"
        Principal = "*"
        Action = "s3:GetObject"
        Resource = "arn:aws:s3:::$($Global:S3_BUCKET)/*"
    })
}
aws s3api put-bucket-policy --bucket $Global:S3_BUCKET --policy "file://$policyPath" | Out-Null

aws s3 sync (Join-Path $frontend "dist") "s3://$($Global:S3_BUCKET)" --delete | Out-Null

@{
    Bucket = $Global:S3_BUCKET
    WebsiteUrl = $websiteUrl
    ApiUrl = $apiUrl
} | ConvertTo-Json | Out-File -Encoding utf8 (Join-Path $Global:OUTPUT_DIR "s3-website.json")

Write-Host "Frontend AWS Website: $websiteUrl"
Write-Host "API configurada en build: $apiUrl"

