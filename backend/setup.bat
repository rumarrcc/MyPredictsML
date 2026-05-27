@echo off
setlocal EnableDelayedExpansion
title MyPredicts - Setup con Python 3.11

echo.
echo ============================================================
echo   MyPredicts - Configuracion del entorno
echo ============================================================
echo.

:: ── Paso 1: Eliminar venv viejo (creado con Python 3.13) ─────────────────
if exist "venv" (
    echo [1/5] Eliminando entorno virtual anterior...
    rmdir /s /q venv
    echo       OK - venv eliminado.
) else (
    echo [1/5] No habia venv previo.
)

:: ── Paso 2: Buscar Python 3.11 ────────────────────────────────────────────
echo.
echo [2/5] Buscando Python 3.11...

set PYTHON311=

:: Rutas comunes donde se instala Python 3.11 en Windows
set PATHS_TO_CHECK=^
    "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" ^
    "%LOCALAPPDATA%\Programs\Python\Python311-32\python.exe" ^
    "C:\Python311\python.exe" ^
    "C:\Program Files\Python311\python.exe" ^
    "C:\Program Files (x86)\Python311\python.exe"

for %%P in (%PATHS_TO_CHECK%) do (
    if exist %%P (
        set PYTHON311=%%P
        goto :found_python
    )
)

:: Intentar con py launcher (py -3.11)
py -3.11 --version >nul 2>&1
if %ERRORLEVEL% == 0 (
    set PYTHON311=py -3.11
    goto :found_python
)

echo.
echo  ERROR: No se encontro Python 3.11 en rutas estandar.
echo.
echo  Soluciones:
echo   1. Descarga Python 3.11 desde: https://www.python.org/downloads/release/python-3119/
echo      (Marca "Add Python to PATH" durante la instalacion)
echo   2. O ejecuta manualmente:
echo      py -3.11 -m venv venv
echo      venv\Scripts\activate
echo      pip install -r requirements.txt
echo.
pause
exit /b 1

:found_python
echo       Encontrado: !PYTHON311!

:: Verificar version
!PYTHON311! --version
echo.

:: ── Paso 3: Crear nuevo venv con Python 3.11 ─────────────────────────────
echo [3/5] Creando entorno virtual con Python 3.11...
!PYTHON311! -m venv venv
if %ERRORLEVEL% neq 0 (
    echo  ERROR creando venv. Verifica que Python 3.11 este correctamente instalado.
    pause
    exit /b 1
)
echo       OK - venv creado con Python 3.11

:: ── Paso 4: Instalar dependencias ────────────────────────────────────────
echo.
echo [4/5] Instalando dependencias (puede tardar 2-5 minutos)...
echo       Instalando Flask, SQLAlchemy, Prophet, Celery...
echo.

call venv\Scripts\activate.bat
pip install --upgrade pip --quiet
pip install -r requirements.txt

if %ERRORLEVEL% neq 0 (
    echo.
    echo  ERROR instalando dependencias.
    echo  Revisa el mensaje de error arriba.
    pause
    exit /b 1
)

:: ── Paso 5: Crear .env si no existe ──────────────────────────────────────
echo.
echo [5/5] Configurando variables de entorno...
if not exist ".env" (
    copy .env.example .env >nul
    echo       Archivo .env creado desde .env.example
    echo       Nota: Edita .env con tus datos de PostgreSQL y Redis
) else (
    echo       .env ya existe, no se sobreescribe.
)

:: ── Verificacion final ────────────────────────────────────────────────────
echo.
echo ============================================================
echo   Verificacion del entorno:
echo ============================================================
python --version
python -c "import flask; print('  Flask', flask.__version__, '- OK')"
python -c "import sqlalchemy; print('  SQLAlchemy', sqlalchemy.__version__, '- OK')"
python -c "import celery; print('  Celery', celery.__version__, '- OK')"
python -c "import yfinance; print('  yfinance', yfinance.__version__, '- OK')"

echo.
echo ============================================================
echo   Listo! Para arrancar el proyecto:
echo ============================================================
echo.
echo   1. Asegurate de tener PostgreSQL y Redis corriendo
echo   2. Edita el archivo .env con tus credenciales
echo   3. Ejecuta:
echo.
echo      venv\Scripts\activate
echo      python run.py
echo.
echo   Para Celery (otra terminal):
echo      venv\Scripts\activate
echo      celery -A app.tasks.celery_app worker --loglevel=info
echo.
pause
