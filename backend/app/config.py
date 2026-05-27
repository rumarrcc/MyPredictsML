"""
Configuración de la aplicación MyPredicts
Soporta entornos: development, testing, production
"""
import os
from datetime import timedelta
from dotenv import load_dotenv

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
BACKEND_DIR = os.path.abspath(os.path.join(BASE_DIR, ".."))

_ENV_NAME = os.environ.get("FLASK_ENV", "development").lower()
_ALLOW_DOTENV_IN_PRODUCTION = os.environ.get("ALLOW_DOTENV_IN_PRODUCTION", "false").lower() == "true"

if _ENV_NAME != "production" or _ALLOW_DOTENV_IN_PRODUCTION:
    load_dotenv(os.path.join(BACKEND_DIR, ".env"))
    load_dotenv()


def _valor_inseguro(value: str | None, min_length: int = 32) -> bool:
    value = (value or "").strip().strip('"').strip("'")
    lowered = value.lower()
    if len(value) < min_length:
        return True
    return any(
        marker in lowered
        for marker in (
            "change",
            "cambiar",
            "placeholder",
            "example",
            "secret",
            "dev",
            "elsaleporeleste",
            "devbimarck",
        )
    )


def validate_production_config(app_config) -> None:
    """Evita arrancar produccion con secretos o URLs de desarrollo."""

    errores = []
    for key in ("SECRET_KEY", "JWT_SECRET_KEY"):
        if _valor_inseguro(app_config.get(key)):
            errores.append(f"{key} debe ser un secreto real de al menos 32 caracteres")

    frontend_url = (app_config.get("FRONTEND_URL") or "").lower()
    backend_url = (app_config.get("BACKEND_URL") or "").lower()
    cors_origins = ",".join(app_config.get("CORS_ORIGINS") or []).lower()

    for key, value in (
        ("FRONTEND_URL", frontend_url),
        ("BACKEND_URL", backend_url),
        ("CORS_ORIGINS", cors_origins),
    ):
        if "localhost" in value or "127.0.0.1" in value:
            errores.append(f"{key} no puede apuntar a localhost en produccion")

    database_url = (app_config.get("SQLALCHEMY_DATABASE_URI") or "").lower()
    if database_url.startswith("sqlite"):
        errores.append("DATABASE_URL no puede usar SQLite en produccion")

    if os.environ.get("AUTO_MIGRATE", "false").lower() == "true":
        errores.append("AUTO_MIGRATE debe estar desactivado en produccion")

    if errores:
        detalle = "; ".join(errores)
        raise RuntimeError(f"Configuracion de produccion insegura: {detalle}")


class Config:
    """Configuración base compartida por todos los entornos."""

    # ── Flask ──────────────────────────────────────────────────────────────
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-change-in-production")
    DEBUG = False
    TESTING = False
    MAX_CONTENT_LENGTH = int(os.environ.get("MAX_CONTENT_LENGTH_MB", "2")) * 1024 * 1024

    # ── Base de datos ──────────────────────────────────────────────────────
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URL",
        "postgresql://postgres:postgres@localhost:5432/stockpredictor",
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_size": 10,
        "pool_recycle": 3600,
        "pool_pre_ping": True,
    }

    # ── JWT ────────────────────────────────────────────────────────────────
    JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "jwt-secret-change-in-production")
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=24)
    JWT_ALGORITHM = "HS256"

    # ── CORS ───────────────────────────────────────────────────────────────
    CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")

    # ── Redis / Celery ─────────────────────────────────────────────────────
    REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
    CELERY_BROKER_URL = os.environ.get("CELERY_BROKER_URL", "redis://localhost:6379/0")
    CELERY_RESULT_BACKEND = os.environ.get("CELERY_RESULT_BACKEND", "redis://localhost:6379/0")
    CELERY_TASK_SERIALIZER = "json"
    CELERY_RESULT_SERIALIZER = "json"
    CELERY_ACCEPT_CONTENT = ["json"]
    CELERY_TIMEZONE = "UTC"
    CELERY_ENABLE_UTC = True

    # ── Email ──────────────────────────────────────────────────────────────
    MAIL_SERVER = os.environ.get("MAIL_SERVER", "smtp.gmail.com")
    MAIL_PORT = int(os.environ.get("MAIL_PORT", 587))
    MAIL_USE_TLS = os.environ.get("MAIL_USE_TLS", "True").lower() == "true"
    MAIL_USERNAME = os.environ.get("MAIL_USERNAME", "")
    MAIL_PASSWORD = os.environ.get("MAIL_PASSWORD", "")
    MAIL_DEFAULT_SENDER = os.environ.get("MAIL_DEFAULT_SENDER", "noreply@stockpredictorpro.com")
    EMAIL_REQUIRE_VERIFICATION = os.environ.get("EMAIL_REQUIRE_VERIFICATION", "true").lower() == "true"
    EMAIL_VALIDATE_DOMAIN = os.environ.get("EMAIL_VALIDATE_DOMAIN", "true").lower() == "true"
    EMAIL_VERIFICATION_TOKEN_HOURS = int(os.environ.get("EMAIL_VERIFICATION_TOKEN_HOURS", "24"))
    PASSWORD_RESET_TOKEN_MINUTES = int(os.environ.get("PASSWORD_RESET_TOKEN_MINUTES", "30"))

    # ── yfinance ──────────────────────────────────────────────────────────
    YFINANCE_TIMEOUT = int(os.environ.get("YFINANCE_TIMEOUT", 10))
    CACHE_MAX_AGE_HOURS = 1  # Refrescar caché si datos tienen > 1 hora

    # ── Stripe ─────────────────────────────────────────────────────────────
    STRIPE_SECRET_KEY       = os.environ.get("STRIPE_SECRET_KEY", "")
    STRIPE_PUBLISHABLE_KEY  = os.environ.get("STRIPE_PUBLISHABLE_KEY", "")
    STRIPE_WEBHOOK_SECRET   = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
    STRIPE_TEST_MODE        = os.environ.get("STRIPE_TEST_MODE", "false").lower() == "true"
    FRONTEND_URL            = os.environ.get("FRONTEND_URL", "http://localhost:5173")
    BACKEND_URL             = os.environ.get("BACKEND_URL", "http://localhost:5000")
    STRIPE_PRO_PRICE_ID     = os.environ.get("STRIPE_PRO_PRICE_ID", "")
    STRIPE_PREMIUM_PRICE_ID = os.environ.get("STRIPE_PREMIUM_PRICE_ID", "")
    STRIPE_CURRENCY         = os.environ.get("STRIPE_CURRENCY", "eur").lower()
    STRIPE_PRO_AMOUNT_CENTS = int(os.environ.get("STRIPE_PRO_AMOUNT_CENTS", "999"))
    STRIPE_PREMIUM_AMOUNT_CENTS = int(os.environ.get("STRIPE_PREMIUM_AMOUNT_CENTS", "1999"))
    STRIPE_SUCCESS_URL      = os.environ.get("STRIPE_SUCCESS_URL", "http://localhost:5173/billing?success=1")
    STRIPE_CANCEL_URL       = os.environ.get("STRIPE_CANCEL_URL",  "http://localhost:5173/billing?canceled=1")
    COIN_SUCCESS_URL        = os.environ.get("COIN_SUCCESS_URL", "")
    COIN_CANCEL_URL         = os.environ.get("COIN_CANCEL_URL", "")

    # ── Rate limiting ──────────────────────────────────────────────────────
    SECURITY_RATE_LIMIT_ENABLED = os.environ.get("SECURITY_RATE_LIMIT_ENABLED", "true").lower() == "true"
    SECURITY_SQLI_GUARD_ENABLED = os.environ.get("SECURITY_SQLI_GUARD_ENABLED", "true").lower() == "true"
    RATE_LIMIT_ANON_PER_MINUTE = int(os.environ.get("RATE_LIMIT_ANON_PER_MINUTE", "80"))
    RATE_LIMIT_AUTH_PER_MINUTE = int(os.environ.get("RATE_LIMIT_AUTH_PER_MINUTE", "220"))
    RATE_LIMIT_AUTH_ROUTES_PER_MINUTE = int(os.environ.get("RATE_LIMIT_AUTH_ROUTES_PER_MINUTE", "8"))
    RATE_LIMIT_EXPENSIVE_PER_MINUTE = int(os.environ.get("RATE_LIMIT_EXPENSIVE_PER_MINUTE", "12"))
    RATE_LIMIT_ADMIN_PER_MINUTE = int(os.environ.get("RATE_LIMIT_ADMIN_PER_MINUTE", "40"))
    SECURITY_HSTS_ENABLED = os.environ.get("SECURITY_HSTS_ENABLED", "false").lower() == "true"


class DevelopmentConfig(Config):
    DEBUG = True
    SQLALCHEMY_ECHO = False  # True para ver SQL en consola


class TestingConfig(Config):
    TESTING = True
    DEBUG = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    SQLALCHEMY_ENGINE_OPTIONS = {}
    CELERY_TASK_ALWAYS_EAGER = True   # Ejecuta tasks síncronamente en tests
    CELERY_TASK_EAGER_PROPAGATES = True


class ProductionConfig(Config):
    DEBUG = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_size": 20,
        "pool_recycle": 3600,
        "pool_pre_ping": True,
        "max_overflow": 10,
    }


config = {
    "development": DevelopmentConfig,
    "testing": TestingConfig,
    "production": ProductionConfig,
    "default": DevelopmentConfig,
}
