Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\config.ps1"

function Save-Json($Name, $Value) {
    $Value | ConvertTo-Json -Depth 20 | Out-File -Encoding utf8 (Join-Path $Global:OUTPUT_DIR $Name)
}

Write-Host "Cuenta AWS: $Global:AWS_ACCOUNT_ID / Region: $Global:AWS_REGION"

$ec2 = aws ec2 describe-instances --region $Global:AWS_REGION --filters Name=instance-state-name,Values=running,pending,stopping,stopped --query "Reservations[].Instances[].{InstanceId:InstanceId,State:State.Name,Type:InstanceType,Name:Tags[?Key=='Name']|[0].Value,PublicIp:PublicIpAddress}" --output json | ConvertFrom-Json
$rds = aws rds describe-db-instances --region $Global:AWS_REGION --query "DBInstances[].{Id:DBInstanceIdentifier,Status:DBInstanceStatus,Class:DBInstanceClass,Engine:Engine,MultiAZ:MultiAZ}" --output json | ConvertFrom-Json
$clusters = aws ecs list-clusters --region $Global:AWS_REGION --query "clusterArns[]" --output json | ConvertFrom-Json
$lbs = aws elbv2 describe-load-balancers --region $Global:AWS_REGION --query "LoadBalancers[].{Name:LoadBalancerName,State:State.Code,Type:Type,DNS:DNSName}" --output json | ConvertFrom-Json
$nats = aws ec2 describe-nat-gateways --region $Global:AWS_REGION --filter Name=state,Values=pending,available --query "NatGateways[].{Id:NatGatewayId,State:State,VpcId:VpcId}" --output json | ConvertFrom-Json
$cache = aws elasticache describe-cache-clusters --region $Global:AWS_REGION --query "CacheClusters[].{Id:CacheClusterId,Status:CacheClusterStatus,Engine:Engine,NodeType:CacheNodeType}" --output json | ConvertFrom-Json
$eips = aws ec2 describe-addresses --region $Global:AWS_REGION --query "Addresses[].{AllocationId:AllocationId,PublicIp:PublicIp,AssociationId:AssociationId,InstanceId:InstanceId}" --output json | ConvertFrom-Json
$ecr = aws ecr describe-repositories --region $Global:AWS_REGION --query "repositories[].repositoryName" --output json | ConvertFrom-Json

$ecsReport = @()
foreach ($cluster in $clusters) {
    $services = aws ecs list-services --region $Global:AWS_REGION --cluster $cluster --query "serviceArns[]" --output json | ConvertFrom-Json
    $tasks = aws ecs list-tasks --region $Global:AWS_REGION --cluster $cluster --desired-status RUNNING --query "taskArns[]" --output json | ConvertFrom-Json
    $ecsReport += [pscustomobject]@{ Cluster = $cluster; Services = $services; RunningTasks = $tasks }
}

try {
    $cloudfront = aws cloudfront list-distributions --query "DistributionList.Items[].{Id:Id,DomainName:DomainName,Enabled:Enabled}" --output json | ConvertFrom-Json
} catch {
    $cloudfront = @("AccessDenied o no permitido por AWS Academy: $($_.Exception.Message)")
}

$report = [pscustomobject]@{
    EC2 = $ec2
    RDS = $rds
    ECS = $ecsReport
    LoadBalancers = $lbs
    NatGateways = $nats
    ElastiCache = $cache
    ElasticIPs = $eips
    ECR = $ecr
    CloudFront = $cloudfront
}
Save-Json "existing-costs.json" $report
$report | ConvertTo-Json -Depth 20

$warnings = @()
if ($ec2 | Where-Object { $_.State -eq "running" -or $_.State -eq "pending" }) { $warnings += "EC2 en running/pending" }
if ($rds | Where-Object { $_.Status -eq "available" -or $_.Status -eq "creating" }) { $warnings += "RDS activo" }
if ($ecsReport | Where-Object { ($_.Services.Count -gt 0) -or ($_.RunningTasks.Count -gt 0) }) { $warnings += "ECS con servicios o tasks" }
if ($lbs | Where-Object { $_.State -eq "active" }) { $warnings += "Load Balancer activo" }
if ($nats | Where-Object { $_.State -eq "available" -or $_.State -eq "pending" }) { $warnings += "NAT Gateway activo" }
if ($cache | Where-Object { $_.Status -eq "available" -or $_.Status -eq "creating" }) { $warnings += "ElastiCache activo" }
if ($eips | Where-Object { -not $_.AssociationId }) { $warnings += "Elastic IP sin asociar" }

if ($warnings.Count -gt 0) {
    Write-Host "ATENCION: recursos con posible coste detectados:" -ForegroundColor Yellow
    $warnings | ForEach-Object { Write-Host " - $_" -ForegroundColor Yellow }
    Write-Host "No se ha parado ni borrado nada." -ForegroundColor Yellow
}
