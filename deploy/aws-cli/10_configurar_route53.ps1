Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\config.ps1"

Write-Host "Route 53 hosted zone cuesta aprox. 0.50 USD/mes. Continua solo si usaras el dominio." -ForegroundColor Yellow
$ok = Read-Host "Escribe CONFIRMO_ROUTE53 para continuar"
if ($ok -ne "CONFIRMO_ROUTE53") { throw "Route53 cancelado." }

$zoneName = "$($Global:DOMAIN)."
$zoneId = aws route53 list-hosted-zones-by-name --dns-name $zoneName --query "HostedZones[?Name=='$zoneName'].Id | [0]" --output text 2>$null
if (-not $zoneId -or $zoneId -eq "None") {
    $caller = "$Global:APP-$(Get-Date -Format yyyyMMddHHmmss)"
    $zoneId = aws route53 create-hosted-zone --name $Global:DOMAIN --caller-reference $caller --query "HostedZone.Id" --output text
    Write-Host "Hosted zone creada. Actualiza nameservers en tu registrador antes de esperar resolucion DNS." -ForegroundColor Yellow
}
$zoneId = $zoneId.Replace("/hostedzone/", "")

$ec2 = Get-Content (Join-Path $Global:OUTPUT_DIR "ec2.json") | ConvertFrom-Json
$changes = @{
    Changes = @(@{
        Action = "UPSERT"
        ResourceRecordSet = @{
            Name = $Global:API_DOMAIN
            Type = "A"
            TTL = 60
            ResourceRecords = @(@{ Value = $ec2.PublicIp })
        }
    })
} | ConvertTo-Json -Depth 10
$changeFile = Join-Path $Global:OUTPUT_DIR "route53-api-change.json"
$changes | Out-File -Encoding utf8 $changeFile
aws route53 change-resource-record-sets --hosted-zone-id $zoneId --change-batch "file://$changeFile" | Out-Null

if (Test-Path (Join-Path $Global:OUTPUT_DIR "cloudfront.json")) {
    Write-Host "Para mypredicts.es/www con CloudFront: primero anade Alternate Domain Names y certificado ACM en us-east-1." -ForegroundColor Yellow
    Write-Host "Despues crea alias A/AAAA a la distribucion desde consola o ajusta este script con el HostedZoneId de CloudFront." -ForegroundColor Yellow
}

@{ HostedZoneId = $zoneId; ApiRecord = $Global:API_DOMAIN; ApiIp = $ec2.PublicIp } |
    ConvertTo-Json | Out-File -Encoding utf8 (Join-Path $Global:OUTPUT_DIR "route53.json")
Write-Host "Registro API creado: $($Global:API_DOMAIN) -> $($ec2.PublicIp)"
