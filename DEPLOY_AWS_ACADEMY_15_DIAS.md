# Deploy AWS Academy 15 dias - MyPredicts

Guia para desplegar MyPredicts en AWS Academy con coste bajo y una arquitectura defendible para TFG.

## Limitacion importante de AWS Academy

AWS Academy no es hosting permanente. Si el laboratorio se cierra, caduca la sesion o se agotan creditos, la EC2 puede detenerse y la web puede dejar de responder. Antes de una defensa hay que iniciar el lab y comprobar servicios.

## Arquitectura actual recomendada

- Frontend React/Vite compilado y servido por Nginx en EC2.
- API Flask con Gunicorn en `127.0.0.1:8000`.
- Nginx como reverse proxy para API y servidor del frontend.
- Celery worker como servicio systemd.
- Celery beat como servicio systemd.
- Redis local en EC2.
- RDS PostgreSQL `db.t3.micro`, Single-AZ, 20 GB gp3.
- HTTPS con Certbot.
- Dominio:
  - `mypredicts.es` hacia EC2.
  - `www.mypredicts.es` hacia EC2.
  - `api.mypredicts.es` hacia EC2.

S3/CloudFront queda como opcion alternativa, pero la demo actual funciona correctamente con Nginx en EC2.

## Servicios evitados por coste

- NAT Gateway.
- ALB.
- ECS.
- Fargate.
- ElastiCache.
- Multi-AZ.
- WAF.

## Estimacion de coste para 15 dias

Valores orientativos en `us-east-1`:

- EC2 `t3.small`: 7-9 USD.
- EBS gp3 20 GB: menos de 1 USD.
- RDS `db.t3.micro`: 6-9 USD.
- RDS storage 20 GB: 1-2 USD.
- Route 53 hosted zone si se usa: coste bajo.
- Trafico demo: normalmente bajo.

Total esperado: 16-22 USD si no hay servicios extra vivos.

## Validacion previa

```powershell
aws sts get-caller-identity
aws configure get region
.\deploy\aws-cli\01_revisar_costes_existentes.ps1
```

No continuar si aparecen recursos caros vivos:

- NAT Gateway.
- ALB.
- ECS tasks o services.
- ElastiCache.
- RDS duplicado.
- Elastic IP sin asociar.

## Preparacion local sin subir nada

Antes de crear recursos o subir archivos, deja el proyecto validado y empaquetado en local:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\preparar_aws_local.ps1
```

Este script:

- revisa que no haya secretos versionables;
- valida la sintaxis de los scripts PowerShell;
- comprueba archivos clave del backend;
- compila el frontend con `VITE_API_URL` de produccion;
- genera `deploy/aws-cli/.outputs/mypredicts-package.tar.gz`.

No ejecuta `scp`, no crea EC2/RDS, no modifica Route 53 y no sube nada a AWS.

Si solo quieres preparar el paquete sin recompilar frontend:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\preparar_aws_local.ps1 -SkipFrontendBuild
```

## Crear configuracion local

```powershell
copy deploy\aws-cli\00_configuracion_ejemplo.ps1 deploy\aws-cli\config.ps1
notepad deploy\aws-cli\config.ps1
```

Rellenar:

- `DB_PASSWORD`
- `S3_BUCKET` si se va a probar S3
- `USE_RDS=$true`
- `USE_LOCAL_POSTGRES_FALLBACK=$false`
- dominios si cambian

`config.ps1` no debe subirse a Git.

## Orden de despliegue

```powershell
.\deploy\aws-cli\01_revisar_costes_existentes.ps1
.\deploy\aws-cli\02_crear_grupos_seguridad.ps1
.\deploy\aws-cli\03_crear_rds_opcional.ps1
.\deploy\aws-cli\04_crear_ec2.ps1
.\deploy\aws-cli\05_preparar_ec2.ps1
.\deploy\aws-cli\06_empaquetar_proyecto.ps1
.\deploy\aws-cli\07_subir_backend.ps1
```

Despues editar `/etc/mypredicts/api.env` en EC2.

## Variables de produccion

Archivo:

```text
/etc/mypredicts/api.env
```

Minimo:

```env
FLASK_ENV=production
AUTO_MIGRATE=false
DATABASE_URL=postgresql://postgres:CHANGE_ME@RDS_ENDPOINT:5432/stockpredictor
REDIS_URL=redis://localhost:6379/0
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0
SECRET_KEY=CHANGE_ME_LONG_RANDOM_SECRET
JWT_SECRET_KEY=CHANGE_ME_LONG_RANDOM_SECRET
CORS_ORIGINS=https://mypredicts.es,https://www.mypredicts.es
FRONTEND_URL=https://mypredicts.es
BACKEND_URL=https://api.mypredicts.es
STRIPE_TEST_MODE=true
STRIPE_SECRET_KEY=sk_test_CHANGE_ME
STRIPE_PUBLISHABLE_KEY=pk_test_CHANGE_ME
STRIPE_WEBHOOK_SECRET=whsec_CHANGE_ME
MAIL_SERVER=smtp.gmail.com
MAIL_PORT=587
MAIL_USE_TLS=true
MAIL_USERNAME=CHANGE_ME
MAIL_PASSWORD=CHANGE_ME
MAIL_DEFAULT_SENDER=CHANGE_ME
EMAIL_REQUIRE_VERIFICATION=true
EMAIL_VALIDATE_DOMAIN=true
```

Generar secretos:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
```

Proteger archivo:

```bash
sudo chown root:root /etc/mypredicts/api.env
sudo chmod 600 /etc/mypredicts/api.env
```

## Inicializar base

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

No usar `reset --yes` salvo demo destructiva confirmada.

## Servicios systemd

```bash
sudo systemctl restart mypredicts-api
sudo systemctl restart mypredicts-worker
sudo systemctl restart mypredicts-beat
sudo systemctl status mypredicts-api --no-pager
sudo systemctl status mypredicts-worker --no-pager
sudo systemctl status mypredicts-beat --no-pager
```

Logs:

```bash
sudo journalctl -u mypredicts-api -f
sudo journalctl -u mypredicts-worker -f
sudo journalctl -u mypredicts-beat -f
```

## Frontend

En local:

```powershell
cd frontend
copy .env.production.example .env.production
notepad .env.production
npm install
npm run build
```

`frontend/.env.production`:

```env
VITE_API_URL=https://api.mypredicts.es
```

Subir build segun scripts de despliegue o copiar `dist` a la ruta de Nginx configurada en EC2.

## DNS y HTTPS

En el proveedor del dominio:

```text
mypredicts.es      A    IP_ELASTICA_EC2
www.mypredicts.es  A    IP_ELASTICA_EC2
api.mypredicts.es  A    IP_ELASTICA_EC2
```

Certbot:

```bash
sudo certbot --nginx -d mypredicts.es -d www.mypredicts.es -d api.mypredicts.es
```

## Stripe

Webhook:

```text
https://api.mypredicts.es/api/billing/webhook
```

Eventos recomendados:

- `checkout.session.completed`
- `payment_intent.succeeded`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

## Verificacion final

```powershell
curl https://api.mypredicts.es/api/health
curl -I https://mypredicts.es
curl -I https://www.mypredicts.es
```

En EC2:

```bash
systemctl is-active nginx mypredicts-api mypredicts-worker mypredicts-beat redis-server
```

## Apagado tras defensa

Para evitar gasto:

- parar EC2;
- detener o borrar RDS si ya no se necesita;
- liberar Elastic IP solo si no se va a reutilizar;
- revisar que no haya NAT, ALB, ECS ni ElastiCache.
