Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\config.ps1"

$vpcId = aws ec2 describe-vpcs --region $Global:AWS_REGION --filters Name=isDefault,Values=true --query "Vpcs[0].VpcId" --output text
if (-not $vpcId -or $vpcId -eq "None") { throw "No se encontro VPC default." }

$myIp = (Invoke-RestMethod -Uri "https://checkip.amazonaws.com").Trim()
$ec2SgName = "$Global:APP-ec2-sg"
$rdsSgName = "$Global:APP-rds-sg"

function Get-OrCreateSg($Name, $Description) {
    $existing = aws ec2 describe-security-groups --region $Global:AWS_REGION --filters Name=vpc-id,Values=$vpcId Name=group-name,Values=$Name --query "SecurityGroups[0].GroupId" --output text
    if ($existing -and $existing -ne "None") { return $existing }
    return aws ec2 create-security-group --region $Global:AWS_REGION --group-name $Name --description $Description --vpc-id $vpcId --query GroupId --output text
}

$ec2SgId = Get-OrCreateSg $ec2SgName "MyPredicts EC2 API"
aws ec2 authorize-security-group-ingress --region $Global:AWS_REGION --group-id $ec2SgId --ip-permissions "IpProtocol=tcp,FromPort=22,ToPort=22,IpRanges=[{CidrIp=$myIp/32,Description='SSH desde mi IP'}]" 2>$null
aws ec2 authorize-security-group-ingress --region $Global:AWS_REGION --group-id $ec2SgId --ip-permissions "IpProtocol=tcp,FromPort=80,ToPort=80,IpRanges=[{CidrIp=0.0.0.0/0,Description='HTTP'}]" 2>$null
aws ec2 authorize-security-group-ingress --region $Global:AWS_REGION --group-id $ec2SgId --ip-permissions "IpProtocol=tcp,FromPort=443,ToPort=443,IpRanges=[{CidrIp=0.0.0.0/0,Description='HTTPS'}]" 2>$null

$rdsSgId = ""
if ($Global:USE_RDS) {
    $rdsSgId = Get-OrCreateSg $rdsSgName "MyPredicts RDS PostgreSQL"
    aws ec2 authorize-security-group-ingress --region $Global:AWS_REGION --group-id $rdsSgId --ip-permissions "IpProtocol=tcp,FromPort=5432,ToPort=5432,UserIdGroupPairs=[{GroupId=$ec2SgId,Description='PostgreSQL desde EC2 MyPredicts'}]" 2>$null
}

@{
    VpcId = $vpcId
    Ec2SecurityGroupId = $ec2SgId
    RdsSecurityGroupId = $rdsSgId
    MyIp = $myIp
} | ConvertTo-Json | Out-File -Encoding utf8 (Join-Path $Global:OUTPUT_DIR "security-groups.json")

Write-Host "SG EC2: $ec2SgId"
if ($rdsSgId) { Write-Host "SG RDS: $rdsSgId" }
