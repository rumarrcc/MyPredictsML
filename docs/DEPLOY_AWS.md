# Deploy AWS - MyPredicts

Resumen operativo para desplegar o actualizar MyPredicts.

## Local a produccion

1. Revisar que no hay secretos en Git.
2. Ejecutar build frontend.
3. Empaquetar backend/frontend.
4. Subir a EC2.
5. Instalar requirements si cambiaron.
6. Inicializar/verificar base.
7. Reiniciar systemd.
8. Verificar health y web.

## Comandos locales Windows

```powershell
cd L:\MyPredictsPRO
powershell -ExecutionPolicy Bypass -File .\scripts\comprobar_secretos.ps1
cd frontend
npm install
npm run build
cd ..
```

## Comandos locales macOS

```bash
cd ~/MyPredictsPRO
pwsh -ExecutionPolicy Bypass -File ./scripts/comprobar_secretos.ps1
cd frontend
npm install
npm run build
cd ..
```

Si no tienes PowerShell en macOS, revisa manualmente `.env`, `.pem`, `node_modules`, `dist` y outputs AWS antes de subir.

## Subida con scripts

```powershell
.\deploy\aws-cli\06_empaquetar_proyecto.ps1
.\deploy\aws-cli\07_subir_backend.ps1
```

## Reinicio en EC2

```bash
sudo systemctl restart mypredicts-api
sudo systemctl restart mypredicts-worker
sudo systemctl restart mypredicts-beat
sudo systemctl reload nginx
```

## Verificacion

```powershell
curl https://api.mypredicts.es/api/health
curl -I https://mypredicts.es
curl -I https://www.mypredicts.es
```

## Logs

```bash
sudo journalctl -u mypredicts-api -n 100 --no-pager
sudo journalctl -u mypredicts-worker -n 100 --no-pager
sudo journalctl -u mypredicts-beat -n 100 --no-pager
sudo tail -n 100 /var/log/nginx/error.log
```

## Actualizar solo backend

```powershell
scp -i .\deploy\aws-cli\.outputs\mypredicts-key.pem backend\app\services\subscription_service.py ubuntu@52.70.55.47:/tmp/subscription_service.py
ssh -i .\deploy\aws-cli\.outputs\mypredicts-key.pem ubuntu@52.70.55.47 "sudo cp /tmp/subscription_service.py /opt/mypredicts/backend/app/services/subscription_service.py && sudo systemctl restart mypredicts-api"
```

Adaptar el archivo segun el cambio.

## Actualizar solo frontend

```powershell
cd frontend
npm run build
```

Copiar el contenido de `frontend/dist` a la ruta configurada en Nginx para el frontend.

## Problemas comunes

Nginx 502:

- Gunicorn caido.
- `mypredicts-api` no arranca.
- error en `/etc/mypredicts/api.env`.

Web carga pero API falla:

- `VITE_API_URL` incorrecta.
- CORS no incluye dominio.
- certificado API vencido.

Stripe no acredita monedas:

- webhook no configurado;
- `STRIPE_WEBHOOK_SECRET` incorrecto;
- evento no seleccionado;
- API no recibe `POST /api/billing/webhook`.

Admin bloqueado:

- cerrar sesion y entrar de nuevo;
- comprobar `role=admin`;
- admin tiene plan efectivo PRO en backend actual.

