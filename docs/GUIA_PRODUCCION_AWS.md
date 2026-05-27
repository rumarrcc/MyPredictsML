# Guia de produccion AWS - MyPredicts

Esta guia describe la produccion actual de MyPredicts.

## Arquitectura actual

```text
Usuario
  -> https://mypredicts.es
  -> Nginx en EC2
  -> frontend React estatico

Usuario/API
  -> https://api.mypredicts.es
  -> Nginx en EC2
  -> Gunicorn
  -> Flask
  -> RDS PostgreSQL
  -> Redis local
  -> Celery worker/beat
```

## EC2

Servicios:

```bash
nginx
mypredicts-api
mypredicts-worker
mypredicts-beat
redis-server
```

Comprobar:

```bash
systemctl is-active nginx mypredicts-api mypredicts-worker mypredicts-beat redis-server
```

## Backend

Ruta:

```text
/opt/mypredicts/backend
```

Arranque:

```bash
gunicorn "wsgi:app" --workers 2 --bind 127.0.0.1:8000 --timeout 120
```

El arranque real lo gestiona `mypredicts-api.service`.

## Variables

Archivo:

```text
/etc/mypredicts/api.env
```

Debe tener permisos:

```bash
sudo chown root:root /etc/mypredicts/api.env
sudo chmod 600 /etc/mypredicts/api.env
```

Produccion debe tener:

```env
FLASK_ENV=production
AUTO_MIGRATE=false
CORS_ORIGINS=https://mypredicts.es,https://www.mypredicts.es
FRONTEND_URL=https://mypredicts.es
BACKEND_URL=https://api.mypredicts.es
```

No usar localhost en produccion.

## Base de datos

Preferida en AWS Academy:

```text
RDS PostgreSQL db.t3.micro, Single-AZ, 20 GB gp3
```

Inicializacion:

```bash
sudo bash
set -a
source /etc/mypredicts/api.env
set +a
cd /opt/mypredicts/backend
FLASK_ENV=production .venv/bin/python manage_db.py init
FLASK_ENV=production .venv/bin/python manage_db.py upgrade-auth
FLASK_ENV=production .venv/bin/python manage_db.py check
FLASK_ENV=production .venv/bin/python manage_db.py seed
```

## Nginx

Nginx debe:

- servir el frontend estatico;
- reenviar `/api` a `127.0.0.1:8000`;
- mantener fallback SPA hacia `index.html`;
- tener HTTPS gestionado por Certbot.

Comprobar configuracion:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## Frontend

Build de produccion:

```powershell
cd frontend
copy .env.production.example .env.production
npm install
npm run build
```

Variable:

```env
VITE_API_URL=https://api.mypredicts.es
```

## Stripe

Webhook:

```text
https://api.mypredicts.es/api/billing/webhook
```

Variables:

```env
STRIPE_TEST_MODE=false
STRIPE_SECRET_KEY=CHANGE_ME_STRIPE_SECRET_KEY
STRIPE_PUBLISHABLE_KEY=CHANGE_ME_STRIPE_PUBLISHABLE_KEY
STRIPE_WEBHOOK_SECRET=CHANGE_ME_STRIPE_WEBHOOK_SECRET
```

## Promover admin

```bash
sudo bash
set -a
source /etc/mypredicts/api.env
set +a
cd /opt/mypredicts/backend
FLASK_ENV=production .venv/bin/python manage_db.py init --admin-username "mark" --admin-email "mark@example.com" --admin-password "PasswordTemporalSegura123!"
```

El usuario admin tiene plan efectivo PRO para evitar bloqueos de feature-gating.

## Verificacion rapida

```powershell
curl https://api.mypredicts.es/api/health
curl -I https://mypredicts.es
curl -I https://www.mypredicts.es
```

## AWS Academy

Si el laboratorio se apaga, la web puede dejar de responder. Antes de presentar:

1. Iniciar lab.
2. Confirmar EC2 running.
3. Confirmar RDS available.
4. Probar `/api/health`.
5. Entrar en la web desde navegador privado.
