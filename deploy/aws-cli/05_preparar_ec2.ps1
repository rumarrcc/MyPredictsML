Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\config.ps1"

$ec2 = Get-Content (Join-Path $Global:OUTPUT_DIR "ec2.json") | ConvertFrom-Json
$ssh = "ubuntu@$($ec2.PublicIp)"
$key = $ec2.KeyPath

$postgresPackages = ""
$postgresSetup = ""
if ($Global:USE_LOCAL_POSTGRES_FALLBACK) {
    $postgresPackages = "postgresql postgresql-contrib"
    $postgresSetup = @"
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname = 'mypredicts'" | grep -q 1 || sudo -u postgres psql -c "CREATE USER mypredicts WITH PASSWORD '$($Global:DB_PASSWORD)';"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname = '$($Global:DB_NAME)'" | grep -q 1 || sudo -u postgres createdb -O mypredicts $($Global:DB_NAME)
"@
}

$remote = @"
set -e
sudo apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y python3 python3-venv python3-pip nginx redis-server postgresql-client git unzip snapd rsync $postgresPackages
sudo mkdir -p /opt/mypredicts /etc/mypredicts
sudo chown -R ubuntu:www-data /opt/mypredicts
sudo chmod 750 /opt/mypredicts
sudo systemctl enable nginx
sudo systemctl enable redis-server
sudo systemctl restart redis-server
$postgresSetup
echo "EC2 preparada."
"@

$remote | ssh -i $key -o StrictHostKeyChecking=accept-new $ssh "bash -s"
