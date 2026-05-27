Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\config.ps1"

function Protect-PrivateKeyFile {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return }
    $acl = Get-Acl -LiteralPath $Path
    $owner = $acl.Owner
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($rule in @($acl.Access)) {
        [void]$acl.RemoveAccessRuleAll($rule)
    }
    $accessRule = New-Object System.Security.AccessControl.FileSystemAccessRule($owner, "Read", "Allow")
    $acl.AddAccessRule($accessRule)
    Set-Acl -LiteralPath $Path -AclObject $acl
}

$sg = Get-Content (Join-Path $Global:OUTPUT_DIR "security-groups.json") | ConvertFrom-Json
$keyPath = Join-Path $Global:OUTPUT_DIR "$($Global:KEY_NAME).pem"

$oldErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$existingKey = aws ec2 describe-key-pairs --region $Global:AWS_REGION --key-names $Global:KEY_NAME --query "KeyPairs[0].KeyName" --output text 2>$null
$keyLookupExitCode = $LASTEXITCODE
$ErrorActionPreference = $oldErrorActionPreference
if ($keyLookupExitCode -ne 0) { $existingKey = $null }
if (-not $existingKey -or $existingKey -eq "None") {
    aws ec2 create-key-pair --region $Global:AWS_REGION --key-name $Global:KEY_NAME --query "KeyMaterial" --output text | Out-File -Encoding ascii $keyPath
    Protect-PrivateKeyFile -Path $keyPath
    Write-Host "Clave creada en $keyPath. No la subas a Git." -ForegroundColor Yellow
} elseif (-not (Test-Path $keyPath)) {
    throw "La key pair ya existe en AWS, pero no encuentro $keyPath. Necesitas la clave privada original para SSH o cambiar KEY_NAME."
} else {
    Protect-PrivateKeyFile -Path $keyPath
}

$ami = aws ssm get-parameters --region $Global:AWS_REGION --names "/aws/service/canonical/ubuntu/server/22.04/stable/current/amd64/hvm/ebs-gp2/ami-id" --query "Parameters[0].Value" --output text
$instanceName = "$Global:APP-api"
$ErrorActionPreference = "Continue"
$existingInstance = aws ec2 describe-instances --region $Global:AWS_REGION --filters Name=tag:Name,Values=$instanceName Name=instance-state-name,Values=pending,running,stopping,stopped --query "Reservations[0].Instances[0].InstanceId" --output text 2>$null
$instanceLookupExitCode = $LASTEXITCODE
$ErrorActionPreference = $oldErrorActionPreference
if ($instanceLookupExitCode -ne 0) { $existingInstance = $null }

if (-not $existingInstance -or $existingInstance -eq "None") {
    $instanceId = aws ec2 run-instances `
        --region $Global:AWS_REGION `
        --image-id $ami `
        --instance-type $Global:INSTANCE_TYPE `
        --key-name $Global:KEY_NAME `
        --security-group-ids $sg.Ec2SecurityGroupId `
        --block-device-mappings "DeviceName=/dev/sda1,Ebs={VolumeSize=20,VolumeType=gp3,DeleteOnTermination=true}" `
        --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$instanceName},{Key=Project,Value=$Global:APP}]" `
        --query "Instances[0].InstanceId" --output text
} else {
    $instanceId = $existingInstance
    $state = aws ec2 describe-instances --region $Global:AWS_REGION --instance-ids $instanceId --query "Reservations[0].Instances[0].State.Name" --output text
    if ($state -eq "stopped") {
        aws ec2 start-instances --region $Global:AWS_REGION --instance-ids $instanceId | Out-Null
    }
}

aws ec2 wait instance-running --region $Global:AWS_REGION --instance-ids $instanceId

$ErrorActionPreference = "Continue"
$address = aws ec2 describe-addresses --region $Global:AWS_REGION --filters Name=tag:Project,Values=$Global:APP --query "Addresses[0].AllocationId" --output text 2>$null
$addressLookupExitCode = $LASTEXITCODE
$ErrorActionPreference = $oldErrorActionPreference
if ($addressLookupExitCode -ne 0) { $address = $null }
if (-not $address -or $address -eq "None") {
    $allocationId = aws ec2 allocate-address --region $Global:AWS_REGION --domain vpc --tag-specifications "ResourceType=elastic-ip,Tags=[{Key=Name,Value=$Global:APP-eip},{Key=Project,Value=$Global:APP}]" --query "AllocationId" --output text
} else {
    $allocationId = $address
}

$assoc = aws ec2 describe-addresses --region $Global:AWS_REGION --allocation-ids $allocationId --query "Addresses[0].AssociationId" --output text
if (-not $assoc -or $assoc -eq "None") {
    aws ec2 associate-address --region $Global:AWS_REGION --allocation-id $allocationId --instance-id $instanceId | Out-Null
}

$publicIp = aws ec2 describe-addresses --region $Global:AWS_REGION --allocation-ids $allocationId --query "Addresses[0].PublicIp" --output text
@{
    InstanceId = $instanceId
    PublicIp = $publicIp
    KeyPath = $keyPath
    SshCommand = "ssh -i `"$keyPath`" ubuntu@$publicIp"
} | ConvertTo-Json | Out-File -Encoding utf8 (Join-Path $Global:OUTPUT_DIR "ec2.json")

Write-Host "EC2 lista: $instanceId / $publicIp"
Write-Host "SSH: ssh -i `"$keyPath`" ubuntu@$publicIp"
