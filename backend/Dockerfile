FROM python:3.11-slim

WORKDIR /app

# ── Dependencias del sistema ───────────────────────────────────────────────
# gcc + libpq-dev: psycopg2
# wget + ca-certificates: descarga de CmdStan (Prophet backend)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    libpq-dev \
    wget \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# ── Instalar dependencias Python ───────────────────────────────────────────
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# ── Instalar CmdStan (backend de Stan requerido por Prophet) ───────────────
# Se hace DESPUÉS de instalar cmdstanpy para usar la versión correcta
RUN python -c "import cmdstanpy; cmdstanpy.install_cmdstan()" || \
    echo "⚠️  CmdStan no pudo instalarse automáticamente — Prophet usará fallback"

# ── Copiar código fuente ───────────────────────────────────────────────────
COPY . .

# ── Variables de entorno por defecto ──────────────────────────────────────
ENV FLASK_ENV=production \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

EXPOSE 5000

# ── Health check (ECS lo usa para saber si el contenedor está listo) ───────
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:5000/api/health || exit 1

# ── Comando por defecto (producción) ──────────────────────────────────────
CMD ["gunicorn", "wsgi:app", "--workers", "2", "--bind", "0.0.0.0:5000", \
     "--timeout", "120", "--access-logfile", "-", "--error-logfile", "-", \
     "--log-level", "info"]
