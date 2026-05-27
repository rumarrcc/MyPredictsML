Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\config.ps1"

$ec2 = Get-Content (Join-Path $Global:OUTPUT_DIR "ec2.json") | ConvertFrom-Json
$package = Join-Path $Global:OUTPUT_DIR "$Global:APP-package.tar.gz"
if (-not (Test-Path $package)) { throw "No existe $package. Ejecuta 06_empaquetar_proyecto.ps1 primero." }

$ssh = "ubuntu@$($ec2.PublicIp)"
$key = $ec2.KeyPath
$letsencryptEmailVar = Get-Variable -Name LETSENCRYPT_EMAIL -Scope Global -ErrorAction SilentlyContinue
$letsencryptEmail = if ($letsencryptEmailVar) { [string]$letsencryptEmailVar.Value } else { "" }

scp -i $key -o StrictHostKeyChecking=accept-new $package "$ssh`:/tmp/$Global:APP-package.tar.gz"

$remote = @"
set -e
sudo rm -rf /opt/mypredicts.new
sudo mkdir -p /opt/mypredicts.new
sudo tar -xzf /tmp/$Global:APP-package.tar.gz -C /opt/mypredicts.new
sudo rsync -a --delete /opt/mypredicts.new/ /opt/mypredicts/
sudo chown -R ubuntu:www-data /opt/mypredicts
cd /opt/mypredicts/backend
python3 -m venv .venv
. .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
sudo cp /opt/mypredicts/deploy/systemd/mypredicts-api.service /etc/systemd/system/mypredicts-api.service
sudo cp /opt/mypredicts/deploy/systemd/mypredicts-worker.service /etc/systemd/system/mypredicts-worker.service
sudo cp /opt/mypredicts/deploy/systemd/mypredicts-beat.service /etc/systemd/system/mypredicts-beat.service
sudo cp /opt/mypredicts/deploy/nginx/mypredicts-api.conf /etc/nginx/sites-available/mypredicts-api.conf
sudo ln -sf /etc/nginx/sites-available/mypredicts-api.conf /etc/nginx/sites-enabled/mypredicts-api.conf
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
LETSENCRYPT_EMAIL="$letsencryptEmail"
if sudo test -d /etc/letsencrypt/live/$Global:DOMAIN; then
  if [ -n "`$LETSENCRYPT_EMAIL" ]; then
    sudo certbot --nginx --cert-name $Global:DOMAIN -d $Global:DOMAIN -d www.$Global:DOMAIN -d $Global:API_DOMAIN --redirect --non-interactive --agree-tos -m "`$LETSENCRYPT_EMAIL"
  else
    sudo certbot --nginx --cert-name $Global:DOMAIN -d $Global:DOMAIN -d www.$Global:DOMAIN -d $Global:API_DOMAIN --redirect --non-interactive || true
  fi
  sudo nginx -t
  sudo systemctl reload nginx
fi
sudo systemctl daemon-reload
sudo systemctl enable mypredicts-api mypredicts-worker mypredicts-beat
if [ ! -f /etc/mypredicts/api.env ]; then
  sudo cp /opt/mypredicts/backend/.env.production.example /etc/mypredicts/api.env
  sudo chown root:root /etc/mypredicts/api.env
  sudo chmod 600 /etc/mypredicts/api.env
  echo "Creada plantilla /etc/mypredicts/api.env. Rellena valores reales antes de arrancar servicios."
  exit 0
fi
if sudo grep -E "CHANGE_ME|<|>|tudominio" /etc/mypredicts/api.env >/dev/null; then
  echo "/etc/mypredicts/api.env contiene placeholders. No se arrancan servicios."
  exit 0
fi
sudo systemctl restart mypredicts-api
sudo systemctl restart mypredicts-worker
sudo systemctl restart mypredicts-beat
sudo systemctl status mypredicts-api --no-pager || true
"@

$remote | ssh -i $key -o StrictHostKeyChecking=accept-new $ssh "bash -s"

