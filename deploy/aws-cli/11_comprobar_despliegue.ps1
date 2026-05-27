Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\config.ps1"

# mcajamar - 24/05/2026: dejé comprobados servicios, despliegue y documentación técnica para la defensa.
aws sts get-caller-identity

if (Test-Path (Join-Path $Global:OUTPUT_DIR "ec2.json")) {
    $ec2 = Get-Content (Join-Path $Global:OUTPUT_DIR "ec2.json") | ConvertFrom-Json
    aws ec2 describe-instances --region $Global:AWS_REGION --instance-ids $ec2.InstanceId --query "Reservations[0].Instances[0].{State:State.Name,PublicIp:PublicIpAddress,Type:InstanceType}" --output table
    curl.exe -f "http://$($ec2.PublicIp)/api/health"

    $ssh = "ubuntu@$($ec2.PublicIp)"
    ssh -i $ec2.KeyPath $ssh "systemctl status mypredicts-api --no-pager || true; systemctl status mypredicts-worker --no-pager || true; systemctl status mypredicts-beat --no-pager || true; journalctl -u mypredicts-api -n 80 --no-pager; journalctl -u mypredicts-worker -n 80 --no-pager; journalctl -u mypredicts-beat -n 80 --no-pager"
}

if ($Global:USE_RDS -and (Test-Path (Join-Path $Global:OUTPUT_DIR "rds.json"))) {
    $rds = Get-Content (Join-Path $Global:OUTPUT_DIR "rds.json") | ConvertFrom-Json
    aws rds describe-db-instances --region $Global:AWS_REGION --db-instance-identifier $rds.DBInstanceIdentifier --query "DBInstances[0].{Status:DBInstanceStatus,Endpoint:Endpoint.Address}" --output table
}

if (Test-Path (Join-Path $Global:OUTPUT_DIR "cloudfront.json")) {
    $cf = Get-Content (Join-Path $Global:OUTPUT_DIR "cloudfront.json") | ConvertFrom-Json
    try {
        aws cloudfront get-distribution --id $cf.DistributionId --query "Distribution.{Status:Status,DomainName:DomainName,Enabled:DistributionConfig.Enabled}" --output table
    } catch {
        Write-Host "CloudFront no verificable con estos permisos." -ForegroundColor Yellow
    }
}

try {
    curl.exe -f "https://$($Global:API_DOMAIN)/api/health"
} catch {
    Write-Host "API por dominio aun no responde. Revisa DNS/Certbot." -ForegroundColor Yellow
}
