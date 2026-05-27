param(
    [switch]$StopEc2,
    [switch]$StopRds,
    [switch]$ScaleEcsToZero,
    [switch]$ReleaseEip,
    [switch]$DeleteBucket,
    [switch]$DeleteCloudFront
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\config.ps1"

if ($env:CONFIRM_DESTROY -ne "yes") {
    Write-Host "Bloqueado. Para acciones destructivas define: `$env:CONFIRM_DESTROY='yes'" -ForegroundColor Yellow
    Write-Host "Costes a vigilar: EC2 running, RDS available, NAT Gateway, ALB, ElastiCache, Elastic IP sin asociar, CloudFront/S3 con trafico."
    exit 1
}

if ($ScaleEcsToZero) {
    $clusters = aws ecs list-clusters --region $Global:AWS_REGION --query "clusterArns[]" --output json | ConvertFrom-Json
    foreach ($cluster in $clusters) {
        $services = aws ecs list-services --region $Global:AWS_REGION --cluster $cluster --query "serviceArns[]" --output json | ConvertFrom-Json
        foreach ($service in $services) {
            aws ecs update-service --region $Global:AWS_REGION --cluster $cluster --service $service --desired-count 0 | Out-Null
        }
        $tasks = aws ecs list-tasks --region $Global:AWS_REGION --cluster $cluster --desired-status RUNNING --query "taskArns[]" --output json | ConvertFrom-Json
        foreach ($task in $tasks) {
            aws ecs stop-task --region $Global:AWS_REGION --cluster $cluster --task $task --reason "TFG cost control" | Out-Null
        }
    }
}

if ($StopEc2 -and (Test-Path (Join-Path $Global:OUTPUT_DIR "ec2.json"))) {
    $ec2 = Get-Content (Join-Path $Global:OUTPUT_DIR "ec2.json") | ConvertFrom-Json
    aws ec2 stop-instances --region $Global:AWS_REGION --instance-ids $ec2.InstanceId | Out-Null
    Write-Host "EC2 parada: $($ec2.InstanceId)"
}

if ($StopRds -and (Test-Path (Join-Path $Global:OUTPUT_DIR "rds.json"))) {
    $rds = Get-Content (Join-Path $Global:OUTPUT_DIR "rds.json") | ConvertFrom-Json
    aws rds stop-db-instance --region $Global:AWS_REGION --db-instance-identifier $rds.DBInstanceIdentifier | Out-Null
    Write-Host "RDS parada si la cuenta lo permite: $($rds.DBInstanceIdentifier)"
}

if ($ReleaseEip -and (Test-Path (Join-Path $Global:OUTPUT_DIR "ec2.json"))) {
    $addresses = aws ec2 describe-addresses --region $Global:AWS_REGION --filters Name=tag:Project,Values=$Global:APP --output json | ConvertFrom-Json
    foreach ($addr in $addresses.Addresses) {
        if ($addr.AssociationId) { aws ec2 disassociate-address --region $Global:AWS_REGION --association-id $addr.AssociationId | Out-Null }
        aws ec2 release-address --region $Global:AWS_REGION --allocation-id $addr.AllocationId | Out-Null
    }
}

if ($DeleteBucket -and (Test-Path (Join-Path $Global:OUTPUT_DIR "cloudfront.json"))) {
    $cf = Get-Content (Join-Path $Global:OUTPUT_DIR "cloudfront.json") | ConvertFrom-Json
    aws s3 rm "s3://$($cf.Bucket)" --recursive
    aws s3api delete-bucket --bucket $cf.Bucket
}

if ($DeleteCloudFront) {
    Write-Host "CloudFront requiere disable + esperar deployed + delete con ETag. Hazlo manualmente o pide un script especifico." -ForegroundColor Yellow
}
