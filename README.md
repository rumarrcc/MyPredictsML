# MyPredicts

MyPredicts es una plataforma de predicciones financieras. El producto permite consultar datos de mercado, generar predicciones con modelos ML, ejecutar backtests, gestionar una cartera virtual, operar con monedas internas, publicar estrategias y gestionar suscripciones con Stripe.

La aplicacion no realiza inversiones reales, no conecta con brokers, no permite retiradas y las monedas internas no tienen valor monetario real.

## Modulos activos

- Home publica en `/`.
- Login y registro.
- Dashboard privado.
- Predicciones ML en `/predictions`.
- Backtesting en `/backtest`.
- Cartera virtual en `/portfolio`.
- Marketplace en `/marketplace`.
- Estrategias en `/strategies`.
- Wallet y compra de monedas en `/wallet`, `/coins/buy` y `/coins/success`.
- Billing y suscripcion PRO en `/billing`.
- Ruleta de recompensas en `/wheel`.
- Reviews en `/reviews`.
- Noticias en `/news`.
- Perfil y ajustes de usuario.
- Panel de administracion en `/admin`.

## Arquitectura del repositorio

```text
MyPredictsPRO/
  backend/
    app/
      models/
      routes/
      services/
      tasks/
      utils/
    manage_db.py
    run.py
    wsgi.py
    requirements.txt
  frontend/
    src/
      pages/
      components/
      services/
      store/
    package.json
    vite.config.js
  deploy/
    aws-cli/
    nginx/
    systemd/
  docs/
  scripts/
```

## Stack tecnico

Backend:

- Python 3.11.
- Flask.
- Flask-JWT-Extended.
- SQLAlchemy.
- PostgreSQL.
- Redis.
- Celery.
- Gunicorn para produccion.
- Stripe.
- yfinance para datos financieros.

Frontend:

- React 18.
- Vite.
- React Router.
- Redux Toolkit.
- Material UI.
- Tailwind CSS.
- Plotly/Recharts.
- Axios.

Produccion:

- AWS Academy.
- EC2 Ubuntu.
- Nginx.
- Gunicorn.
- Celery worker.
- Celery beat.
- Redis local.
- RDS PostgreSQL.
- HTTPS con Certbot.
- Dominio `mypredicts.es`.

## Requisitos locales

Windows:

- Windows 11.
- PowerShell.
- Git.
- Python 3.11.
- Node.js 18 o 20.
- PostgreSQL 15 o Docker.
- Redis local, Docker o WSL para ejecutar Celery completo.

macOS:

- macOS actualizado.
- Terminal.
- Homebrew.
- Git.
- Python 3.11.
- Node.js 18 o 20.
- PostgreSQL 15.
- Redis.

## Instalacion en Windows

Raiz del proyecto:

```powershell
cd L:\MyPredictsPRO
```

Backend:

```powershell
cd backend
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
copy .env.example .env
notepad .env
```

Variables minimas en `backend/.env`:

```env
FLASK_ENV=development
AUTO_MIGRATE=false
DATABASE_URL=postgresql://postgres:TU_PASSWORD@localhost:5432/stockpredictor
REDIS_URL=redis://localhost:6379/0
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0
SECRET_KEY=CAMBIA_ESTO_POR_UN_SECRETO_LARGO
JWT_SECRET_KEY=CAMBIA_ESTO_POR_OTRO_SECRETO_LARGO
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
FRONTEND_URL=http://localhost:5173
BACKEND_URL=http://localhost:5000
STRIPE_TEST_MODE=true
EMAIL_REQUIRE_VERIFICATION=true
EMAIL_VALIDATE_DOMAIN=true
```

Inicializacion de base de datos:

```powershell
python manage_db.py init
python manage_db.py check
python manage_db.py seed
```

Arranque del backend:

```powershell
python run.py
```

Frontend:

```powershell
cd ..\frontend
npm install
copy .env.example .env
notepad .env
npm run dev
```

Contenido minimo de `frontend/.env`:

```env
VITE_API_URL=http://localhost:5000
```

Stripe CLI local para probar compras de monedas y suscripcion:

```powershell
docker run --rm -it -v stripe-cli-config:/root/.config/stripe stripe/stripe-cli:latest listen --forward-to host.docker.internal:5000/api/billing/webhook
```

## Instalacion en macOS

Instalacion de dependencias:

```bash
brew install python@3.11 node postgresql@15 redis git
brew services start postgresql@15
brew services start redis
```

Creacion de base local:

```bash
createdb stockpredictor
```

Backend:

```bash
cd ~/MyPredictsPRO/backend
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
cp .env.example .env
nano .env
python manage_db.py init
python manage_db.py check
python manage_db.py seed
python run.py
```

Frontend:

```bash
cd ~/MyPredictsPRO/frontend
npm install
cp .env.example .env
nano .env
npm run dev
```

Contenido minimo de `frontend/.env`:

```env
VITE_API_URL=http://localhost:5000
```

Stripe CLI con Docker Desktop:

```bash
docker run --rm -it -v stripe-cli-config:/root/.config/stripe stripe/stripe-cli:latest listen --forward-to host.docker.internal:5000/api/billing/webhook
```

Stripe CLI nativo:

```bash
stripe listen --forward-to localhost:5000/api/billing/webhook
```

## Comandos de desarrollo

Backend:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python run.py
```

Frontend:

```powershell
cd frontend
npm run dev
```

Celery worker:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
celery -A app.tasks.celery_app worker --loglevel=info
```

Celery beat:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
celery -A app.tasks.celery_app beat --loglevel=info
```

Health check:

```powershell
curl http://localhost:5000/api/health
```

## Flujo funcional

1. Registro de usuario.
2. Inicio de sesion.
3. Generacion de prediccion ML.
4. Revision de cartera virtual.
5. Ejecucion de backtest.
6. Compra de monedas con Stripe.
7. Revision de saldo e historial en Wallet.
8. Creacion de estrategia.
9. Compra de estrategia con monedas internas.
10. Revision de actividad, perfil y panel de administracion.

## Despliegue en AWS Academy

La arquitectura de despliegue esta preparada para un entorno de bajo coste en AWS Academy. La cuenta Academy funciona por sesiones de laboratorio; cuando el laboratorio se detiene, los servicios pueden dejar de responder hasta que la sesion vuelva a estar activa.

Servicios usados:

- EC2 Ubuntu para API, frontend, Nginx, Redis y Celery.
- RDS PostgreSQL para la base de datos.
- Elastic IP asociada a EC2.
- Certbot para HTTPS.
- Route 53 o DNS externo apuntando a la Elastic IP.

Servicios evitados por coste:

- NAT Gateway.
- ALB.
- ECS.
- Fargate.
- ElastiCache.
- Multi-AZ.
- WAF.

### Preparacion local previa

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\preparar_aws_local.ps1
```

Este script valida secretos, sintaxis PowerShell, backend, build frontend y paquete local.

### Configuracion de AWS CLI

```powershell
aws configure
aws configure set region us-east-1
aws sts get-caller-identity
```

En AWS Academy tambien se configura el token temporal de sesion:

```powershell
aws configure set aws_session_token "TOKEN_DE_SESION"
```

### Configuracion del despliegue

```powershell
copy deploy\aws-cli\00_configuracion_ejemplo.ps1 deploy\aws-cli\config.ps1
notepad deploy\aws-cli\config.ps1
```

Valores principales de `config.ps1`:

- `AWS_REGION`
- `APP`
- `DOMAIN`
- `API_DOMAIN`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `KEY_NAME`
- `INSTANCE_TYPE`
- `RDS_INSTANCE_CLASS`
- `USE_RDS`
- `USE_LOCAL_POSTGRES_FALLBACK`

`deploy/aws-cli/config.ps1` contiene configuracion local sensible y no se versiona.

### Despliegue simplificado

Una vez configurada la AWS CLI y creado `deploy\aws-cli\config.ps1`, se puede desplegar con un solo comando:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\aws-cli\00_desplegar_todo.ps1
```

El script revisa secretos, valida los scripts PowerShell, empaqueta sin `.env`, claves ni builds locales, sube backend, compila frontend y ejecuta la comprobacion final.

Para una primera instalacion desde cero:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\aws-cli\00_desplegar_todo.ps1 -Modo primera-instalacion -CrearRds
```

Si se quiere crear S3 y CloudFront en la primera instalacion:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\aws-cli\00_desplegar_todo.ps1 -Modo primera-instalacion -CrearRds -UsarCloudFront
```

Opciones utiles:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\aws-cli\00_desplegar_todo.ps1 -SoloBackend
powershell -ExecutionPolicy Bypass -File .\deploy\aws-cli\00_desplegar_todo.ps1 -SoloFrontend
```

### Orden manual de scripts de infraestructura

```powershell
.\deploy\aws-cli\01_revisar_costes_existentes.ps1
.\deploy\aws-cli\02_crear_grupos_seguridad.ps1
.\deploy\aws-cli\03_crear_rds_opcional.ps1
.\deploy\aws-cli\04_crear_ec2.ps1
.\deploy\aws-cli\05_preparar_ec2.ps1
```

`03_crear_rds_opcional.ps1` requiere confirmacion explicita antes de crear RDS.

### Empaquetado y subida del backend

```powershell
.\deploy\aws-cli\06_empaquetar_proyecto.ps1
.\deploy\aws-cli\07_subir_backend.ps1
```

El paquete excluye `.env`, claves `.pem`, `node_modules`, `frontend/dist`, outputs de despliegue y archivos temporales.

En EC2, la configuracion real vive en:

```text
/etc/mypredicts/api.env
```

Variables principales:

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
STRIPE_TEST_MODE=false
STRIPE_SECRET_KEY=CHANGE_ME_STRIPE_SECRET_KEY
STRIPE_PUBLISHABLE_KEY=CHANGE_ME_STRIPE_PUBLISHABLE_KEY
STRIPE_WEBHOOK_SECRET=CHANGE_ME_STRIPE_WEBHOOK_SECRET
MAIL_SERVER=smtp.gmail.com
MAIL_PORT=587
MAIL_USE_TLS=true
MAIL_USERNAME=CHANGE_ME
MAIL_PASSWORD=CHANGE_ME
MAIL_DEFAULT_SENDER=CHANGE_ME
EMAIL_REQUIRE_VERIFICATION=true
EMAIL_VALIDATE_DOMAIN=true
```

Inicializacion de base en EC2:

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

Servicios:

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

### Despliegue del frontend

```powershell
.\deploy\aws-cli\09_desplegar_frontend.ps1
```

El script genera `frontend/.env.production`, compila con Vite y despliega el contenido de `frontend/dist`.

Destino principal actual:

```text
/var/www/mypredicts
```

Nginx sirve el frontend y reenvia `/api/` a Gunicorn.

### Verificacion de despliegue

```powershell
.\deploy\aws-cli\11_comprobar_despliegue.ps1
```

Comprobaciones manuales:

```powershell
curl https://api.mypredicts.es/api/health
curl -I https://mypredicts.es
curl -I https://www.mypredicts.es
```

Servicios en EC2:

```bash
systemctl is-active nginx mypredicts-api mypredicts-worker mypredicts-beat redis-server
```

### Apagado y limpieza

```powershell
.\deploy\aws-cli\99_parar_o_destruir_recursos.ps1
```

Las acciones destructivas requieren la variable:

```powershell
$env:CONFIRM_DESTROY="yes"
```

## Seguridad y GitHub

Archivos que no se versionan:

- `backend/.env`
- `frontend/.env`
- `frontend/.env.production`
- `*.pem`
- `deploy/aws-cli/config.ps1`
- `deploy/aws-cli/.outputs/`
- `outputs/`
- dumps SQL.
- paquetes zip/tar.
- `node_modules`.
- `frontend/dist`.
- caches y logs locales.

Revision de secretos:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\comprobar_secretos.ps1
```

Exportacion limpia para GitHub:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\exportar_github_limpio.ps1
```

## Documentacion relacionada

- `ESPECIFICACIONES_API.md`
- `DEPLOY_AWS_ACADEMY_15_DIAS.md`
- `CHECKLIST_DESPLIEGUE_TFG.md`
- `docs\GUIA_PRODUCCION_AWS.md`
- `docs\SEGURIDAD_DESPLIEGUE_AWS.md`
- `docs\BASE_DATOS_DESDE_CERO.md`

## Aviso academico

MyPredicts es una herramienta educativa. Las predicciones y backtests no son asesoramiento financiero. Las monedas internas son virtuales y no tienen conversion a dinero real.
