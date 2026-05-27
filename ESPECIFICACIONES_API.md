# Especificaciones API - MyPredicts

Base local:

```text
http://localhost:5000/api
```

Base produccion:

```text
https://api.mypredicts.es/api
```

Autenticacion:

```http
Authorization: Bearer <token>
```

## Health

```http
GET /api/health
```

Respuesta:

```json
{
  "status": "ok",
  "service": "MyPredicts API",
  "version": "1.0.0"
}
```

## Auth

```http
POST /api/auth/register
POST /api/auth/login
GET  /api/auth/me
PUT  /api/auth/profile
```

Registro:

```json
{
  "username": "marc",
  "email": "marc@example.com",
  "password": "PasswordTemporalSegura123!",
  "full_name": "Marc"
}
```

Login:

```json
{
  "email": "marc@example.com",
  "password": "PasswordTemporalSegura123!"
}
```

## Stocks y mercado

```http
GET /api/stocks
GET /api/stocks/search?q=AAPL&limit=18
GET /api/stocks/meta
GET /api/stock/AAPL?days=30
GET /api/stock/batch?tickers=AAPL,MSFT,NVDA&days=30
```

El catalogo usa la tabla `tickers`. Los nombres fisicos de columnas no deben traducirse si ya estan definidos por SQLAlchemy.

## Predicciones

```http
POST /api/predictions
GET  /api/predictions
GET  /api/predictions/:id
```

Peticion ejemplo:

```json
{
  "ticker": "AAPL",
  "models": ["prophet", "arima", "sma"],
  "horizon_days": 30,
  "historical_days": 365
}
```

Notas:

- requiere login;
- admin tiene plan efectivo PRO;
- las respuestas son educativas y no asesoramiento financiero.

## Backtesting

```http
POST /api/backtest
GET  /api/backtest/history
GET  /api/backtest/:id
```

Peticion ejemplo:

```json
{
  "ticker": "AAPL",
  "start_date": "2024-01-01",
  "end_date": "2024-12-31",
  "models": ["sma"],
  "trade_type": "long",
  "initial_capital": 10000,
  "position_size_percent": 25
}
```

## Portfolio

```http
GET    /api/portfolio
POST   /api/portfolio
PUT    /api/portfolio/:id
DELETE /api/portfolio/:id
```

## Alertas

```http
GET    /api/alerts
POST   /api/alerts
PUT    /api/alerts/:id
DELETE /api/alerts/:id
```

## Billing, Stripe y monedas

Stripe solo se usa para:

- compra de monedas internas;
- suscripcion PRO;
- billing.

No se usa para comprar predicciones individuales.

Endpoints:

```http
GET  /api/billing/my-subscription
POST /api/billing/create-checkout-session
POST /api/billing/webhook
POST /api/billing/wallet/pay-subscription
GET  /api/coin-packages
POST /api/coin-purchases/checkout
GET  /api/coin-purchases/:id
```

Webhook:

```text
/api/billing/webhook
```

Eventos Stripe esperados:

- `checkout.session.completed`
- `payment_intent.succeeded`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

## Wallet

```http
GET /api/coins/balance
GET /api/coins/transactions
```

La wallet muestra saldo, historial y movimientos de monedas internas.

## Strategies y marketplace

```http
GET    /api/strategies
POST   /api/strategies
GET    /api/strategies/:id
PUT    /api/strategies/:id
DELETE /api/strategies/:id
POST   /api/strategies/:id/purchase
POST   /api/strategies/:id/reviews
```

Las estrategias de pago se compran con monedas internas.

## Reviews y news

```http
GET /api/reviews
POST /api/reviews
GET /api/news
```

## Admin

```http
GET  /api/admin/stats
GET  /api/admin/data-status
POST /api/admin/users/:id/promote
POST /api/admin/users/:id/block
POST /api/admin/jobs
```

Para promover admin desde servidor:

```bash
sudo bash
set -a
source /etc/mypredicts/api.env
set +a
cd /opt/mypredicts/backend
FLASK_ENV=production .venv/bin/python manage_db.py init --admin-username "usuario" --admin-email "correo@example.com" --admin-password "PasswordTemporalSegura123!"
```

## Errores comunes

```json
{
  "error": "UNAUTHORIZED",
  "message": "Token requerido",
  "status": 401
}
```

Indica peticion sin JWT.

```json
{
  "error": "INSUFFICIENT_COINS",
  "message": "Saldo insuficiente",
  "status": 402
}
```

Indica compra interna sin monedas suficientes.

```json
{
  "error": "MARKET_DATA_UNAVAILABLE",
  "message": "No hay precio valido disponible",
  "status": 422
}
```

Indica que el proveedor de datos no devolvio precio valido.
