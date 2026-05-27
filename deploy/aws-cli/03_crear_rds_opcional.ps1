param(
    [switch]$Confirmed
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\config.ps1"

if (-not $Global:USE_RDS) {
    Write-Host "USE_RDS=false. Saltando RDS."
    exit 0
}
if ([string]::IsNullOrWhiteSpace($Global:DB_PASSWORD) -or $Global:DB_PASSWORD -like "CHANGE_ME*") {
    throw "Edita deploy/aws-cli/config.ps1 y define DB_PASSWORD con una clave segura antes de crear RDS."
}

Write-Host "RDS db.t3.micro 15 dias cuesta aprox. 6-8 USD + almacenamiento. Solo crearlo si aceptas ese coste." -ForegroundColor Yellow
$confirmation = if ($Confirmed) { "CONFIRMO_CREAR_RDS" } else { Read-Host "Escribe CONFIRMO_CREAR_RDS para continuar" }
if ($confirmation -ne "CONFIRMO_CREAR_RDS") { throw "Creacion de RDS cancelada." }

$sg = Get-Content (Join-Path $Global:OUTPUT_DIR "security-groups.json") | ConvertFrom-Json
$vpcId = $sg.VpcId
$subnets = aws ec2 describe-subnets --region $Global:AWS_REGION --filters Name=vpc-id,Values=$vpcId --query "Subnets[0:2].SubnetId" --output json | ConvertFrom-Json
if ($subnets.Count -lt 2) { throw "RDS necesita al menos 2 subnets." }

$subnetGroup = "$Global:APP-db-subnet-group"
$dbId = "$Global:APP-db"

$oldErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$existingSubnetGroup = aws rds describe-db-subnet-groups --region $Global:AWS_REGION --db-subnet-group-name $subnetGroup --query "DBSubnetGroups[0].DBSubnetGroupName" --output text 2>$null
$subnetGroupLookupExitCode = $LASTEXITCODE
$ErrorActionPreference = $oldErrorActionPreference
if ($subnetGroupLookupExitCode -ne 0) { $existingSubnetGroup = $null }
if (-not $existingSubnetGroup -or $existingSubnetGroup -eq "None") {
    aws rds create-db-subnet-group --region $Global:AWS_REGION --db-subnet-group-name $subnetGroup --db-subnet-group-description "MyPredicts DB subnet group" --subnet-ids $subnets | Out-Null
}

$ErrorActionPreference = "Continue"
$existing = aws rds describe-db-instances --region $Global:AWS_REGION --db-instance-identifier $dbId --query "DBInstances[0].DBInstanceIdentifier" --output text 2>$null
$dbLookupExitCode = $LASTEXITCODE
$ErrorActionPreference = $oldErrorActionPreference
if ($dbLookupExitCode -ne 0) { $existing = $null }
if (-not $existing -or $existing -eq "None") {
    aws rds create-db-instance `
        --region $Global:AWS_REGION `
        --db-instance-identifier $dbId `
        --db-instance-class $Global:RDS_INSTANCE_CLASS `
        --engine postgres `
        --allocated-storage 20 `
        --storage-type gp3 `
        --storage-encrypted `
        --master-username $Global:DB_USER `
        --master-user-password $Global:DB_PASSWORD `
        --db-name $Global:DB_NAME `
        --vpc-security-group-ids $sg.RdsSecurityGroupId `
        --db-subnet-group-name $subnetGroup `
        --backup-retention-period 7 `
        --no-multi-az `
        --no-publicly-accessible `
        --deletion-protection | Out-Null
}

aws rds wait db-instance-available --region $Global:AWS_REGION --db-instance-identifier $dbId
$endpoint = aws rds describe-db-instances --region $Global:AWS_REGION --db-instance-identifier $dbId --query "DBInstances[0].Endpoint.Address" --output text

@{
    DBInstanceIdentifier = $dbId
    Endpoint = $endpoint
    DatabaseUrl = "postgresql://$($Global:DB_USER):CHANGE_ME_PASSWORD@$endpoint`:5432/$($Global:DB_NAME)"
} | ConvertTo-Json | Out-File -Encoding utf8 (Join-Path $Global:OUTPUT_DIR "rds.json")

Write-Host "RDS listo: $endpoint"
Write-Host "DATABASE_URL=postgresql://$($Global:DB_USER):<password>@$endpoint`:5432/$($Global:DB_NAME)"
