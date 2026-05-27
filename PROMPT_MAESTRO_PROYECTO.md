# Prompt maestro del proyecto - MyPredicts

## Contexto

MyPredicts es un proyecto TFG full-stack con backend Flask, frontend React/Vite, PostgreSQL, Redis, Celery, Stripe y despliegue en AWS Academy.

El proyecto no debe rehacerse desde cero. La prioridad es estabilizar lo existente, cerrar flujos incompletos y mantener una experiencia coherente.

## Definicion del producto

MyPredicts es una plataforma educativa de predicciones financieras. Permite:

- consultar datos de mercado;
- generar predicciones ML;
- realizar backtesting;
- gestionar una cartera virtual;
- comprar monedas internas;
- vender y comprar estrategias;
- usar una suscripcion PRO;
- administrar usuarios y contenido.

## Reglas funcionales

- Stripe solo se usa para monedas y suscripcion.
- Predicciones/estrategias de pago se compran con monedas.
- Las monedas no tienen valor real.
- No hay retiradas.
- No hay brokers.
- No hay inversion real.
- PRO es el unico plan comercial activo.
- Admin tiene plan efectivo PRO.

## Stack

Backend:

- Flask.
- SQLAlchemy.
- PostgreSQL.
- Redis.
- Celery.
- Gunicorn.
- Stripe.
- yfinance.

Frontend:

- React.
- Vite.
- MUI.
- Tailwind.
- Redux Toolkit.
- Axios.
- Plotly/Recharts.

Produccion:

- AWS Academy.
- EC2.
- RDS PostgreSQL.
- Nginx.
- Certbot.
- systemd.

## Flujos que deben funcionar

1. Registro e inicio de sesion.
2. Home publica.
3. Dashboard privado.
4. Generar prediccion.
5. Ejecutar backtest.
6. Comprar monedas con Stripe.
7. Ver saldo e historial.
8. Crear estrategia.
9. Comprar estrategia con monedas.
10. Revisar actividad y portfolio virtual.
11. Gestionar desde admin.

## Desarrollo local

Windows:

```powershell
cd backend
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
python manage_db.py init
python run.py
```

```powershell
cd frontend
npm install
copy .env.example .env
npm run dev
```

macOS:

```bash
cd backend
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python manage_db.py init
python run.py
```

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

## Produccion

La produccion vive en AWS Academy. No es permanente. Si el laboratorio se apaga, la web puede caer.

Comprobar:

```powershell
curl https://api.mypredicts.es/api/health
```

## Seguridad

No subir:

- `.env`
- `.pem`
- outputs AWS
- dumps SQL
- `node_modules`
- builds
- secretos Stripe/AWS/DB.

Usar:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\exportar_github_limpio.ps1
```

para preparar una copia limpia si se va a publicar en GitHub.
