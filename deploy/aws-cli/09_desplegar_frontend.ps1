Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\config.ps1"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$frontend = Join-Path $repoRoot "frontend"
$ec2Path = Join-Path $Global:OUTPUT_DIR "ec2.json"
$cloudfrontPath = Join-Path $Global:OUTPUT_DIR "cloudfront.json"

$apiUrl = "https://$($Global:API_DOMAIN)"
if (Test-Path $ec2Path) {
    $ec2 = Get-Content $ec2Path | ConvertFrom-Json
    if (-not $Global:API_DOMAIN) { $apiUrl = "http://$($ec2.PublicIp)" }
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

if (Test-Path $cloudfrontPath) {
    $cf = Get-Content $cloudfrontPath | ConvertFrom-Json
    aws s3 sync (Join-Path $frontend "dist") "s3://$($cf.Bucket)" --delete | Out-Null
    try {
        aws cloudfront create-invalidation --distribution-id $cf.DistributionId --paths "/*" | Out-Null
    } catch {
        Write-Host "No se pudo invalidar CloudFront automaticamente. Hazlo manual si hace falta." -ForegroundColor Yellow
    }
    Write-Host "Frontend desplegado en CloudFront: https://$($cf.CloudFrontDomain)"
} else {
    if (-not (Test-Path $ec2Path)) { throw "No hay cloudfront.json ni ec2.json. No puedo desplegar frontend." }
    $ec2 = Get-Content $ec2Path | ConvertFrom-Json
    $archive = Join-Path $Global:OUTPUT_DIR "$Global:APP-frontend.tar.gz"
    if (Test-Path $archive) { Remove-Item -LiteralPath $archive -Force }
    tar.exe -czf $archive -C (Join-Path $frontend "dist") .

    $ssh = "ubuntu@$($ec2.PublicIp)"
    scp -i $ec2.KeyPath -o StrictHostKeyChecking=accept-new $archive "$ssh`:/tmp/$Global:APP-frontend.tar.gz"

    $remote = @'
set -e
sudo mkdir -p /var/www/mypredicts
sudo rm -rf /var/www/mypredicts/*
sudo tar -xzf /tmp/mypredicts-frontend.tar.gz -C /var/www/mypredicts
sudo chown -R www-data:www-data /var/www/mypredicts
sudo nginx -t
sudo systemctl reload nginx
'@
    $remote = $remote -replace "`r", ""
    $remoteScript = Join-Path $Global:OUTPUT_DIR "desplegar_frontend_remoto.sh"
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($remoteScript, $remote, $utf8NoBom)
    scp -i $ec2.KeyPath -o StrictHostKeyChecking=accept-new $remoteScript "$ssh`:/tmp/desplegar_frontend_remoto.sh"
    ssh -i $ec2.KeyPath -o StrictHostKeyChecking=accept-new $ssh "bash /tmp/desplegar_frontend_remoto.sh"
    $frontendUrl = if ($Global:DOMAIN) { "https://www.$($Global:DOMAIN)" } else { "http://$($ec2.PublicIp)" }
    Write-Host "Frontend desplegado por Nginx: $frontendUrl"
}
