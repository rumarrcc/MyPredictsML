Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Copia este archivo como deploy/aws-cli/config.ps1 y cambia los CHANGE_ME.
# No subas config.ps1 a Git.

$env:AWS_REGION = "us-east-1"
$env:AWS_DEFAULT_REGION = "us-east-1"

$Global:AWS_REGION = "us-east-1"
$Global:APP = "mypredicts"
$Global:DOMAIN = "mypredicts.es"
$Global:API_DOMAIN = "api.mypredicts.es"
$Global:LETSENCRYPT_EMAIL = "tu-correo@example.com"

$Global:DB_NAME = "stockpredictor"
$Global:DB_USER = "postgres"
$Global:DB_PASSWORD = 'CHANGE_ME'

$Global:KEY_NAME = "mypredicts-key"
$Global:INSTANCE_TYPE = "t3.small"
$Global:RDS_INSTANCE_CLASS = "db.t3.micro"
$Global:S3_BUCKET = "mypredicts-frontend-CHANGE_ME_ACCOUNT_ID"

$Global:USE_RDS = $true
$Global:USE_LOCAL_POSTGRES_FALLBACK = $false

$Global:AWS_ACCOUNT_ID = aws sts get-caller-identity --query Account --output text
$Global:OUTPUT_DIR = Join-Path $PSScriptRoot ".outputs"
New-Item -ItemType Directory -Force -Path $Global:OUTPUT_DIR | Out-Null
