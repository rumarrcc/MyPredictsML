# Checklist de despliegue TFG

## Antes de subir a GitHub

- [ ] No hay `.env` versionado.
- [ ] No hay `.pem` versionado.
- [ ] No hay `node_modules` versionado.
- [ ] No hay `frontend/dist` versionado.
- [ ] No hay dumps SQL versionados.
- [ ] No hay `deploy/aws-cli/.outputs` versionado.
- [ ] `.env.example` y `.env.production.example` solo tienen placeholders.
- [ ] `scripts/exportar_github_limpio.ps1` genera copia limpia.

## Desarrollo local

- [ ] Backend arranca con `python run.py`.
- [ ] Frontend arranca con `npm run dev`.
- [ ] `GET /api/health` responde.
- [ ] PostgreSQL esta operativo.
- [ ] Redis esta operativo si se prueban worker/beat.
- [ ] Stripe CLI reenvia a `/api/billing/webhook`.

## Producto

- [ ] `/` carga Home publica.
- [ ] Login funciona.
- [ ] Registro funciona.
- [ ] Dashboard privado funciona.
- [ ] Predicciones funcionan.
- [ ] Backtest funciona para PRO/admin.
- [ ] Wallet muestra saldo.
- [ ] Compra de monedas redirige a resumen.
- [ ] Marketplace compra con monedas.
- [ ] Estrategias se pueden crear y editar.
- [ ] Reviews y noticias responden.
- [ ] Panel admin responde.

## AWS Academy

- [ ] Lab iniciado.
- [ ] Credenciales AWS Academy vigentes.
- [ ] Region `us-east-1`.
- [ ] EC2 running.
- [ ] Elastic IP asociada.
- [ ] RDS available.
- [ ] Nginx active.
- [ ] `mypredicts-api` active.
- [ ] `mypredicts-worker` active.
- [ ] `mypredicts-beat` active.
- [ ] Redis active.
- [ ] HTTPS activo en `mypredicts.es`, `www.mypredicts.es` y `api.mypredicts.es`.
- [ ] `curl https://api.mypredicts.es/api/health` responde.

## Coste

- [ ] No hay NAT Gateway.
- [ ] No hay ALB.
- [ ] No hay ECS/Fargate activo.
- [ ] No hay ElastiCache.
- [ ] No hay Multi-AZ.
- [ ] No hay Elastic IP sin asociar.
- [ ] Se revisa coste antes y despues de la defensa.
