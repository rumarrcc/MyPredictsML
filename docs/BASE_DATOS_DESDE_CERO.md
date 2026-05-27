# Base de datos desde cero

MyPredicts puede levantar una base limpia para desarrollo o pruebas. No usar resets destructivos en produccion sin confirmacion.

## Local Windows

Crear base en PostgreSQL:

```powershell
createdb -U postgres stockpredictor
```

O desde `psql`:

```sql
CREATE DATABASE stockpredictor;
```

Inicializar:

```powershell
cd L:\MyPredictsPRO\backend
.\.venv\Scripts\Activate.ps1
python manage_db.py init
python manage_db.py upgrade-auth
python manage_db.py check
python manage_db.py seed
```

## Local macOS

```bash
brew services start postgresql@15
createdb stockpredictor
cd ~/MyPredictsPRO/backend
source .venv/bin/activate
python manage_db.py init
python manage_db.py upgrade-auth
python manage_db.py check
python manage_db.py seed
```

## Produccion

En EC2:

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

## Reset destructivo

Solo para entorno local o base de pruebas:

```bash
python manage_db.py reset --yes
python manage_db.py init
python manage_db.py seed
```

No ejecutar esto contra RDS de produccion salvo que quieras borrar datos de prueba.

## Reglas

- `AUTO_MIGRATE=false` en produccion.
- No crear tablas automaticamente en cada arranque.
- No traducir nombres fisicos de columnas si los modelos ya usan nombres ingleses.
- Usar `manage_db.py` para inicializar.
- Mantener datos semilla pequenos y defendibles.
