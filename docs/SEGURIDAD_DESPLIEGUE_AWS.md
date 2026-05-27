# Seguridad de despliegue - MyPredicts

## Objetivo

Evitar filtrado de claves, reducir superficie de ataque y mantener un despliegue estable.

## Secretos

No subir a Git:

- `backend/.env`
- `frontend/.env`
- `frontend/.env.production`
- `*.pem`
- `deploy/aws-cli/config.ps1`
- `deploy/aws-cli/.outputs/`
- dumps SQL
- paquetes de despliegue

Usar siempre archivos example con placeholders:

- `backend/.env.example`
- `backend/.env.production.example`
- `frontend/.env.example`
- `frontend/.env.production.example`

## Variables sensibles

Son sensibles:

- `SECRET_KEY`
- `JWT_SECRET_KEY`
- `DATABASE_URL`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `MAIL_PASSWORD`
- claves AWS Academy
- claves `.pem`

## Produccion

Requisitos:

```env
FLASK_ENV=production
AUTO_MIGRATE=false
CORS_ORIGINS=https://mypredicts.es,https://www.mypredicts.es
FRONTEND_URL=https://mypredicts.es
BACKEND_URL=https://api.mypredicts.es
```

No usar:

- `CORS_ORIGINS=*`
- localhost en URLs publicas
- `AUTO_MIGRATE=true`
- secretos cortos
- passwords en codigo

## SQL injection

La aplicacion usa SQLAlchemy y consultas parametrizadas. Mantener esta regla:

- no construir SQL concatenando strings de usuario;
- validar filtros, ordenaciones y paginacion;
- usar allowlists para campos de ordenacion;
- limitar `limit/per_page`;
- no exponer errores SQL crudos al usuario.

## DDoS y abuso

En AWS Academy no se usa WAF por coste. Medidas ligeras:

- Nginx con HTTPS y limites razonables.
- Security Group con solo 80/443 publicos y SSH restringido.
- API detras de Gunicorn.
- Validacion de input.
- Paginacion en listados.
- Jobs pesados en Celery.
- Stripe webhook con firma.

Para produccion real fuera de Academy:

- CloudFront delante del frontend.
- WAF gestionado.
- rate limiting en Nginx o API gateway.
- backups automaticos.
- monitorizacion.

## Permisos EC2

```bash
sudo chown root:root /etc/mypredicts/api.env
sudo chmod 600 /etc/mypredicts/api.env
```

La clave `.pem` se queda solo en local y nunca en Git.

## GitHub

Antes de subir:

```powershell
git status --short
git check-ignore -v backend/.env frontend/.env.production deploy/aws-cli/.outputs/mypredicts-key.pem
powershell -ExecutionPolicy Bypass -File .\scripts\comprobar_secretos.ps1
```

Si hay dudas por historial pesado o viejo:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\exportar_github_limpio.ps1
```

Subir la carpeta limpia generada, no el `.git` viejo.
