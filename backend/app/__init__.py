"""
MyPredicts — Flask Application Factory
"""
import os
import logging
import re
import time
from logging.handlers import RotatingFileHandler

from flask import Flask, jsonify, request
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager
from flask_cors import CORS
from flask_mail import Mail
from werkzeug.middleware.proxy_fix import ProxyFix
try:
    from flask_migrate import Migrate as FlaskMigrate
    _FLASK_MIGRATE_AVAILABLE = True
except ImportError:
    _FLASK_MIGRATE_AVAILABLE = False

from .config import config, validate_production_config

# ── Extensiones (sin app aún) ──────────────────────────────────────────────
# mcajamar - 01/02/2026: dejé creada la base del backend Flask con módulos separados para que el proyecto fuera más ordenado.
db = SQLAlchemy()
jwt = JWTManager()
mail = Mail()

# Flask-Migrate — se inicializa en create_app si está disponible
migrate = None

# Redis client — se inicializa en create_app; None si Redis no está disponible
redis_client = None
_memory_rate_limits: dict[str, tuple[int, float]] = {}

_SQLI_PATTERN = re.compile(
    r"(?is)(\bunion\s+select\b|;\s*--|/\*|\*/|\bor\s+1\s*=\s*1\b|"
    r"\band\s+1\s*=\s*1\b|\bdrop\s+table\b|\binformation_schema\b|"
    r"\bpg_sleep\s*\(|\bbenchmark\s*\()"
)


def _client_ip() -> str:
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",", 1)[0].strip() or "unknown"
    return request.remote_addr or "unknown"


def _iter_strings(value, depth: int = 0):
    if depth > 4:
        return
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for item in value.values():
            yield from _iter_strings(item, depth + 1)
    elif isinstance(value, list):
        for item in value[:50]:
            yield from _iter_strings(item, depth + 1)


def _request_has_sqli_pattern() -> bool:
    for value in request.args.values():
        if value and _SQLI_PATTERN.search(str(value)):
            return True

    if request.path == "/api/billing/webhook":
        return False

    if request.is_json:
        payload = request.get_json(silent=True)
        for value in _iter_strings(payload):
            if len(value) <= 2000 and _SQLI_PATTERN.search(value):
                return True
    return False


def _rate_limit_for_request(app):
    if request.method == "OPTIONS" or not request.path.startswith("/api/"):
        return None
    if request.path == "/api/health":
        return None

    if request.path.startswith(("/api/auth/login", "/api/auth/register")):
        return "auth", int(app.config["RATE_LIMIT_AUTH_ROUTES_PER_MINUTE"])

    if request.path.startswith("/api/admin"):
        return "admin", int(app.config["RATE_LIMIT_ADMIN_PER_MINUTE"])

    expensive_prefixes = (
        "/api/predictions",
        "/api/backtest",
        "/api/coins",
        "/api/billing/create",
        "/api/coin",
    )
    if request.method != "GET" and request.path.startswith(expensive_prefixes):
        return "expensive", int(app.config["RATE_LIMIT_EXPENSIVE_PER_MINUTE"])

    is_authenticated_request = bool(request.headers.get("Authorization"))
    limit = app.config["RATE_LIMIT_AUTH_PER_MINUTE"] if is_authenticated_request else app.config["RATE_LIMIT_ANON_PER_MINUTE"]
    return "api", int(limit)


def _rate_limit_hit(key: str, limit: int, window_seconds: int = 60) -> tuple[bool, int]:
    now = time.time()
    bucket = int(now // window_seconds)
    storage_key = f"ratelimit:{key}:{bucket}"

    try:
        if redis_client is not None:
            count = int(redis_client.incr(storage_key))
            if count == 1:
                redis_client.expire(storage_key, window_seconds + 5)
            return count > limit, max(1, window_seconds - int(now % window_seconds))
    except Exception:
        pass

    count, expires_at = _memory_rate_limits.get(storage_key, (0, now + window_seconds))
    if expires_at <= now:
        count, expires_at = 0, now + window_seconds
    count += 1
    _memory_rate_limits[storage_key] = (count, expires_at)

    if len(_memory_rate_limits) > 5000:
        stale = [k for k, (_, exp) in _memory_rate_limits.items() if exp <= now]
        for stale_key in stale[:1000]:
            _memory_rate_limits.pop(stale_key, None)

    return count > limit, max(1, int(expires_at - now))


def _install_request_security(app: Flask) -> None:
    @app.before_request
    def request_security_guard():
        if app.config.get("SECURITY_SQLI_GUARD_ENABLED") and _request_has_sqli_pattern():
            return jsonify({
                "error": "SECURITY_BLOCKED",
                "message": "Solicitud bloqueada por patrón de entrada no permitido.",
                "status": 400,
            }), 400

        spec = _rate_limit_for_request(app) if app.config.get("SECURITY_RATE_LIMIT_ENABLED") else None
        if not spec:
            return None

        bucket, limit = spec
        key = f"{bucket}:{_client_ip()}"
        limited, retry_after = _rate_limit_hit(key, limit)
        if limited:
            response = jsonify({
                "error": "RATE_LIMITED",
                "message": "Demasiadas solicitudes. Espera un momento y vuelve a intentarlo.",
                "status": 429,
            })
            response.headers["Retry-After"] = str(retry_after)
            return response, 429
        return None

    @app.after_request
    def security_headers(response):
        if (
            response.mimetype in {"application/json", "text/html", "text/plain", "text/css", "application/javascript", "text/javascript"}
            and "charset=" not in response.content_type.lower()
        ):
            response.headers["Content-Type"] = f"{response.mimetype}; charset=utf-8"

        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
        response.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
        response.headers.setdefault("X-DNS-Prefetch-Control", "off")

        forwarded_proto = request.headers.get("X-Forwarded-Proto", request.scheme)
        if app.config.get("SECURITY_HSTS_ENABLED") and forwarded_proto == "https":
            response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        return response


def _auto_migrate(app) -> None:
    """
    rumarrcc: compatibilidad para bases antiguas.
    El flujo normal es crear el esquema con manage_db.py y arrancar con AUTO_MIGRATE=false.
    """
    from sqlalchemy import text
    # ── Columnas usuarios ─────────────────────────────────────────────────
    try:
        with db.engine.begin() as conn:
            conn.execute(text("""
                ALTER TABLE users
                  ADD COLUMN IF NOT EXISTS role         VARCHAR(20)  NOT NULL DEFAULT 'user',
                  ADD COLUMN IF NOT EXISTS is_blocked   BOOLEAN      NOT NULL DEFAULT FALSE,
                  ADD COLUMN IF NOT EXISTS last_login   TIMESTAMP,
                  ADD COLUMN IF NOT EXISTS subscription VARCHAR(10)  NOT NULL DEFAULT 'free',
                  ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(20) NOT NULL DEFAULT 'inactive',
                  ADD COLUMN IF NOT EXISTS internal_coins INTEGER    NOT NULL DEFAULT 0,
                  ADD COLUMN IF NOT EXISTS headline      VARCHAR(160),
                  ADD COLUMN IF NOT EXISTS location      VARCHAR(120),
                  ADD COLUMN IF NOT EXISTS website       VARCHAR(255),
                  ADD COLUMN IF NOT EXISTS trading_style VARCHAR(80),
                  ADD COLUMN IF NOT EXISTS settings      JSON DEFAULT '{}'::json,
                  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT TRUE,
                  ADD COLUMN IF NOT EXISTS email_verification_token_hash VARCHAR(128),
                  ADD COLUMN IF NOT EXISTS email_verification_sent_at TIMESTAMP,
                  ADD COLUMN IF NOT EXISTS password_reset_token_hash VARCHAR(128),
                  ADD COLUMN IF NOT EXISTS password_reset_sent_at TIMESTAMP
            """))
            conn.execute(text("ALTER TABLE users ALTER COLUMN email_verified SET DEFAULT FALSE"))
        app.logger.info("Auto-migrate: columnas de usuarios verificadas/añadidas")
    except Exception as exc:
        app.logger.debug("Auto-migrate users omitido: %s", exc)

    # ── Tabla tickers (catálogo maestro de instrumentos) ──────────────────
    try:
        with db.engine.begin() as conn:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS tickers (
                    id             SERIAL PRIMARY KEY,
                    symbol         VARCHAR(20)  UNIQUE NOT NULL,
                    name           VARCHAR(200),
                    exchange       VARCHAR(20),
                    sector         VARCHAR(100),
                    industry       VARCHAR(150),
                    country        VARCHAR(10),
                    currency       VARCHAR(10)  DEFAULT 'USD',
                    market_cap     BIGINT,
                    last_price     NUMERIC(14,4),
                    previous_close NUMERIC(14,4),
                    volume         BIGINT,
                    day_change     NUMERIC(8,4),
                    day_change_pct NUMERIC(8,4),
                    is_active      BOOLEAN NOT NULL DEFAULT TRUE,
                    is_supported   BOOLEAN NOT NULL DEFAULT TRUE,
                    logo_url       TEXT,
                    description    TEXT,
                    last_updated   TIMESTAMP,
                    created_at     TIMESTAMP DEFAULT NOW()
                )
            """))
            conn.execute(text("""
                DO $$
                DECLARE
                    par text[];
                    pares text[][] := ARRAY[
                        ARRAY['simbolo', 'symbol'],
                        ARRAY['nombre', 'name'],
                        ARRAY['mercado', 'exchange'],
                        ARRAY['bolsa', 'exchange'],
                        ARRAY['industria', 'industry'],
                        ARRAY['pais', 'country'],
                        ARRAY['moneda', 'currency'],
                        ARRAY['capitalizacion_mercado', 'market_cap'],
                        ARRAY['ultimo_precio', 'last_price'],
                        ARRAY['precio_ultimo', 'last_price'],
                        ARRAY['cierre_anterior', 'previous_close'],
                        ARRAY['volumen', 'volume'],
                        ARRAY['cambio_dia', 'day_change'],
                        ARRAY['cambio_dia_pct', 'day_change_pct'],
                        ARRAY['activo', 'is_active'],
                        ARRAY['soportado', 'is_supported'],
                        ARRAY['descripcion', 'description'],
                        ARRAY['ultima_actualizacion', 'last_updated'],
                        ARRAY['actualizado_en', 'last_updated'],
                        ARRAY['creado_en', 'created_at']
                    ];
                BEGIN
                    FOREACH par SLICE 1 IN ARRAY pares LOOP
                        IF EXISTS (
                            SELECT 1 FROM information_schema.columns
                            WHERE table_schema = current_schema()
                              AND table_name = 'tickers'
                              AND column_name = par[1]
                        ) AND NOT EXISTS (
                            SELECT 1 FROM information_schema.columns
                            WHERE table_schema = current_schema()
                              AND table_name = 'tickers'
                              AND column_name = par[2]
                        ) THEN
                            EXECUTE format('ALTER TABLE tickers RENAME COLUMN %I TO %I', par[1], par[2]);
                        ELSIF EXISTS (
                            SELECT 1 FROM information_schema.columns
                            WHERE table_schema = current_schema()
                              AND table_name = 'tickers'
                              AND column_name = par[1]
                        ) AND EXISTS (
                            SELECT 1 FROM information_schema.columns
                            WHERE table_schema = current_schema()
                              AND table_name = 'tickers'
                              AND column_name = par[2]
                        ) THEN
                            EXECUTE format('UPDATE tickers SET %I = %I WHERE %I IS NULL', par[2], par[1], par[2]);
                        END IF;
                    END LOOP;
                END $$;
            """))

            conn.execute(text("""
                ALTER TABLE tickers
                  ADD COLUMN IF NOT EXISTS symbol         VARCHAR(20),
                  ADD COLUMN IF NOT EXISTS name           VARCHAR(200),
                  ADD COLUMN IF NOT EXISTS exchange       VARCHAR(20),
                  ADD COLUMN IF NOT EXISTS sector         VARCHAR(100),
                  ADD COLUMN IF NOT EXISTS industry       VARCHAR(150),
                  ADD COLUMN IF NOT EXISTS country        VARCHAR(10),
                  ADD COLUMN IF NOT EXISTS currency       VARCHAR(10) DEFAULT 'USD',
                  ADD COLUMN IF NOT EXISTS market_cap     BIGINT,
                  ADD COLUMN IF NOT EXISTS last_price     NUMERIC(14,4),
                  ADD COLUMN IF NOT EXISTS previous_close NUMERIC(14,4),
                  ADD COLUMN IF NOT EXISTS volume         BIGINT,
                  ADD COLUMN IF NOT EXISTS day_change     NUMERIC(8,4),
                  ADD COLUMN IF NOT EXISTS day_change_pct NUMERIC(8,4),
                  ADD COLUMN IF NOT EXISTS is_active      BOOLEAN DEFAULT TRUE,
                  ADD COLUMN IF NOT EXISTS is_supported   BOOLEAN DEFAULT TRUE,
                  ADD COLUMN IF NOT EXISTS logo_url       TEXT,
                  ADD COLUMN IF NOT EXISTS description    TEXT,
                  ADD COLUMN IF NOT EXISTS last_updated   TIMESTAMP,
                  ADD COLUMN IF NOT EXISTS created_at     TIMESTAMP DEFAULT NOW()
            """))

            conn.execute(text("""
                UPDATE tickers
                SET symbol = UPPER(COALESCE(NULLIF(symbol, ''), 'TICKER-' || id::text)),
                    currency = COALESCE(currency, 'USD'),
                    is_active = COALESCE(is_active, TRUE),
                    is_supported = COALESCE(is_supported, TRUE),
                    created_at = COALESCE(created_at, NOW())
                WHERE symbol IS NULL
                   OR symbol = ''
                   OR currency IS NULL
                   OR is_active IS NULL
                   OR is_supported IS NULL
                   OR created_at IS NULL
            """))

            conn.execute(text("UPDATE tickers SET symbol = UPPER(symbol) WHERE symbol IS NOT NULL"))

            conn.execute(text("""
                WITH repetidos AS (
                    SELECT id,
                           ROW_NUMBER() OVER (PARTITION BY UPPER(symbol) ORDER BY id) AS posicion
                    FROM tickers
                    WHERE symbol IS NOT NULL
                )
                UPDATE tickers AS t
                SET symbol = LEFT(UPPER(t.symbol), 12) || '-' || t.id::text
                FROM repetidos AS r
                WHERE t.id = r.id
                  AND r.posicion > 1
            """))

            conn.execute(text("ALTER TABLE tickers ALTER COLUMN symbol SET NOT NULL"))
            conn.execute(text("ALTER TABLE tickers ALTER COLUMN is_active SET NOT NULL"))
            conn.execute(text("ALTER TABLE tickers ALTER COLUMN is_supported SET NOT NULL"))
            conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_tickers_symbol ON tickers (symbol)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_tickers_symbol  ON tickers (symbol)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_tickers_sector  ON tickers (sector)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_tickers_country ON tickers (country)"))
            try:
                from app.services.ticker_service import TICKER_UNIVERSE
                existing = {
                    row[0]
                    for row in conn.execute(text("SELECT symbol FROM tickers")).fetchall()
                }
                missing = [item for item in TICKER_UNIVERSE if item["symbol"].upper() not in existing]
                for item in missing:
                    conn.execute(text("""
                        INSERT INTO tickers (symbol, name, exchange, sector, industry, country, currency, is_active, is_supported, created_at)
                        VALUES (:symbol, :name, :exchange, :sector, :industry, :country, :currency, TRUE, TRUE, NOW())
                        ON CONFLICT (symbol) DO NOTHING
                    """), {
                        "symbol": item.get("symbol", "").upper(),
                        "name": item.get("name"),
                        "exchange": item.get("exchange"),
                        "sector": item.get("sector"),
                        "industry": item.get("industry"),
                        "country": item.get("country"),
                        "currency": item.get("currency", "USD"),
                    })
                if missing:
                    app.logger.info("Auto-migrate: %d tickers base sembrados", len(missing))
            except Exception as seed_exc:
                app.logger.debug("Auto-seed tickers omitido: %s", seed_exc)
        app.logger.info("Auto-migrate: tabla tickers verificada/creada")
    except Exception as exc:
        app.logger.debug("Auto-migrate tickers omitido: %s", exc)

    # ── Tabla signals (señales premium) ──────────────────────────────────
    try:
        with db.engine.begin() as conn:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS signals (
                    id               SERIAL PRIMARY KEY,
                    symbol           VARCHAR(20)  NOT NULL,
                    signal_type      VARCHAR(10)  NOT NULL,
                    category         VARCHAR(20)  NOT NULL,
                    confidence       NUMERIC(4,3),
                    score            INTEGER,
                    reason           VARCHAR(400),
                    indicators       TEXT,
                    price_at_signal  NUMERIC(14,4),
                    created_at       TIMESTAMP    DEFAULT NOW(),
                    expires_at       TIMESTAMP,
                    is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
                    generated_by     VARCHAR(20)  DEFAULT 'system'
                )
            """))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_signal_symbol   ON signals (symbol)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_signal_active   ON signals (is_active)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_signal_score    ON signals (score, is_active)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_signal_category ON signals (category, is_active)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_signal_expires  ON signals (expires_at)"))
        app.logger.info("Auto-migrate: tabla signals verificada/creada")
    except Exception as exc:
        app.logger.debug("Auto-migrate signals omitido: %s", exc)

    # -- Tabla alerts --------------------------------------------------------
    try:
        with db.engine.begin() as conn:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS alerts (
                    id                 SERIAL PRIMARY KEY,
                    user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    ticker             VARCHAR(10) NOT NULL,
                    alert_type         VARCHAR(50) NOT NULL,
                    condition          VARCHAR(20),
                    trigger_value      NUMERIC(10,4),
                    model              VARCHAR(50),
                    change_percent     NUMERIC(5,2),
                    description        TEXT,
                    is_active          BOOLEAN NOT NULL DEFAULT TRUE,
                    email_enabled      BOOLEAN DEFAULT TRUE,
                    priority           VARCHAR(10) DEFAULT 'medium',
                    last_triggered_at  TIMESTAMP,
                    trigger_count      INTEGER NOT NULL DEFAULT 0,
                    created_at         TIMESTAMP DEFAULT NOW()
                )
            """))
            conn.execute(text("""
                ALTER TABLE alerts
                  ADD COLUMN IF NOT EXISTS condition          VARCHAR(20),
                  ADD COLUMN IF NOT EXISTS trigger_value      NUMERIC(10,4),
                  ADD COLUMN IF NOT EXISTS model              VARCHAR(50),
                  ADD COLUMN IF NOT EXISTS change_percent     NUMERIC(5,2),
                  ADD COLUMN IF NOT EXISTS description        TEXT,
                  ADD COLUMN IF NOT EXISTS is_active          BOOLEAN NOT NULL DEFAULT TRUE,
                  ADD COLUMN IF NOT EXISTS email_enabled      BOOLEAN DEFAULT TRUE,
                  ADD COLUMN IF NOT EXISTS priority           VARCHAR(10) DEFAULT 'medium',
                  ADD COLUMN IF NOT EXISTS last_triggered_at  TIMESTAMP,
                  ADD COLUMN IF NOT EXISTS trigger_count      INTEGER NOT NULL DEFAULT 0,
                  ADD COLUMN IF NOT EXISTS created_at         TIMESTAMP DEFAULT NOW()
            """))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_alert_user ON alerts (user_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_alert_ticker ON alerts (ticker)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_alert_active ON alerts (is_active)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_alert_type ON alerts (alert_type)"))
        app.logger.info("Auto-migrate: tabla alerts verificada/creada")
    except Exception as exc:
        app.logger.debug("Auto-migrate alerts omitido: %s", exc)

    # -- Predicciones, backtests e inversiones -------------------------------
    try:
        with db.engine.begin() as conn:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS predictions (
                    id                       SERIAL PRIMARY KEY,
                    user_id                  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    ticker                   VARCHAR(10) NOT NULL,
                    model_type               VARCHAR(50) NOT NULL,
                    prediction_date          DATE NOT NULL,
                    predicted_price          NUMERIC(10,4) NOT NULL,
                    confidence_interval_low  NUMERIC(10,4),
                    confidence_interval_high NUMERIC(10,4),
                    confidence_level         NUMERIC(4,2) DEFAULT 0.95,
                    horizon_days             INTEGER,
                    accuracy_score           NUMERIC(5,4),
                    model_params             JSON,
                    mae                      NUMERIC(10,4),
                    rmse                     NUMERIC(10,4),
                    mape                     NUMERIC(5,2),
                    training_samples         INTEGER,
                    prediction_group_id      INTEGER,
                    historical_days          INTEGER,
                    created_at               TIMESTAMP DEFAULT NOW(),
                    updated_at               TIMESTAMP DEFAULT NOW()
                )
            """))
            conn.execute(text("""
                ALTER TABLE predictions
                  ADD COLUMN IF NOT EXISTS confidence_interval_low  NUMERIC(10,4),
                  ADD COLUMN IF NOT EXISTS confidence_interval_high NUMERIC(10,4),
                  ADD COLUMN IF NOT EXISTS confidence_level         NUMERIC(4,2) DEFAULT 0.95,
                  ADD COLUMN IF NOT EXISTS horizon_days             INTEGER,
                  ADD COLUMN IF NOT EXISTS accuracy_score           NUMERIC(5,4),
                  ADD COLUMN IF NOT EXISTS model_params             JSON,
                  ADD COLUMN IF NOT EXISTS mae                      NUMERIC(10,4),
                  ADD COLUMN IF NOT EXISTS rmse                     NUMERIC(10,4),
                  ADD COLUMN IF NOT EXISTS mape                     NUMERIC(5,2),
                  ADD COLUMN IF NOT EXISTS training_samples         INTEGER,
                  ADD COLUMN IF NOT EXISTS prediction_group_id      INTEGER,
                  ADD COLUMN IF NOT EXISTS historical_days          INTEGER,
                  ADD COLUMN IF NOT EXISTS created_at               TIMESTAMP DEFAULT NOW(),
                  ADD COLUMN IF NOT EXISTS updated_at               TIMESTAMP DEFAULT NOW()
            """))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_prediction_ticker ON predictions (ticker)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_prediction_group ON predictions (prediction_group_id)"))

            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS backtest_results (
                    id                    SERIAL PRIMARY KEY,
                    user_id               INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    ticker                VARCHAR(10) NOT NULL,
                    model_type            VARCHAR(50) NOT NULL,
                    start_date            DATE NOT NULL,
                    end_date              DATE NOT NULL,
                    initial_capital       NUMERIC(12,2) DEFAULT 10000,
                    trade_type            VARCHAR(20) DEFAULT 'long',
                    position_size_percent NUMERIC(5,2) DEFAULT 100,
                    total_return          NUMERIC(7,4),
                    win_rate              NUMERIC(5,4),
                    num_trades            INTEGER,
                    winning_trades        INTEGER,
                    losing_trades         INTEGER,
                    max_consecutive_wins  INTEGER,
                    max_consecutive_losses INTEGER,
                    max_drawdown          NUMERIC(7,4),
                    sharpe_ratio          NUMERIC(10,4),
                    sortino_ratio         NUMERIC(10,4),
                    profit_factor         NUMERIC(10,4),
                    average_win           NUMERIC(12,4),
                    average_loss          NUMERIC(12,4),
                    final_capital         NUMERIC(12,2),
                    results_json          JSON,
                    group_id              INTEGER,
                    created_at            TIMESTAMP DEFAULT NOW()
                )
            """))
            conn.execute(text("""
                ALTER TABLE backtest_results
                  ADD COLUMN IF NOT EXISTS initial_capital       NUMERIC(12,2) DEFAULT 10000,
                  ADD COLUMN IF NOT EXISTS trade_type            VARCHAR(20) DEFAULT 'long',
                  ADD COLUMN IF NOT EXISTS position_size_percent NUMERIC(5,2) DEFAULT 100,
                  ADD COLUMN IF NOT EXISTS total_return          NUMERIC(7,4),
                  ADD COLUMN IF NOT EXISTS win_rate              NUMERIC(5,4),
                  ADD COLUMN IF NOT EXISTS num_trades            INTEGER,
                  ADD COLUMN IF NOT EXISTS winning_trades        INTEGER,
                  ADD COLUMN IF NOT EXISTS losing_trades         INTEGER,
                  ADD COLUMN IF NOT EXISTS max_consecutive_wins  INTEGER,
                  ADD COLUMN IF NOT EXISTS max_consecutive_losses INTEGER,
                  ADD COLUMN IF NOT EXISTS max_drawdown          NUMERIC(7,4),
                  ADD COLUMN IF NOT EXISTS sharpe_ratio          NUMERIC(10,4),
                  ADD COLUMN IF NOT EXISTS sortino_ratio         NUMERIC(10,4),
                  ADD COLUMN IF NOT EXISTS profit_factor         NUMERIC(10,4),
                  ADD COLUMN IF NOT EXISTS average_win           NUMERIC(12,4),
                  ADD COLUMN IF NOT EXISTS average_loss          NUMERIC(12,4),
                  ADD COLUMN IF NOT EXISTS final_capital         NUMERIC(12,2),
                  ADD COLUMN IF NOT EXISTS results_json          JSON,
                  ADD COLUMN IF NOT EXISTS group_id              INTEGER,
                  ADD COLUMN IF NOT EXISTS created_at            TIMESTAMP DEFAULT NOW()
            """))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_backtest_ticker ON backtest_results (ticker)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_backtest_group ON backtest_results (group_id)"))

            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS virtual_portfolio (
                    id              SERIAL PRIMARY KEY,
                    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    name            VARCHAR(255) NOT NULL,
                    initial_capital NUMERIC(12,2) NOT NULL,
                    current_value   NUMERIC(12,2),
                    total_return    NUMERIC(7,4) DEFAULT 0,
                    created_at      TIMESTAMP DEFAULT NOW(),
                    updated_at      TIMESTAMP DEFAULT NOW()
                )
            """))
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS portfolio_positions (
                    id                SERIAL PRIMARY KEY,
                    portfolio_id      INTEGER NOT NULL REFERENCES virtual_portfolio(id) ON DELETE CASCADE,
                    ticker            VARCHAR(10) NOT NULL,
                    quantity          NUMERIC(10,4) NOT NULL,
                    buy_price         NUMERIC(10,4) NOT NULL,
                    buy_date          DATE NOT NULL,
                    current_price     NUMERIC(10,4),
                    gain_loss         NUMERIC(12,2),
                    gain_loss_percent NUMERIC(7,4),
                    source_type       VARCHAR(30) DEFAULT 'manual',
                    source_id         INTEGER,
                    source_label      VARCHAR(120),
                    signal_type       VARCHAR(20),
                    signal_score      INTEGER,
                    source_note       TEXT,
                    created_at        TIMESTAMP DEFAULT NOW(),
                    updated_at        TIMESTAMP DEFAULT NOW()
                )
            """))
            conn.execute(text("""
                ALTER TABLE portfolio_positions
                  ADD COLUMN IF NOT EXISTS source_type  VARCHAR(30) DEFAULT 'manual',
                  ADD COLUMN IF NOT EXISTS source_id    INTEGER,
                  ADD COLUMN IF NOT EXISTS source_label VARCHAR(120),
                  ADD COLUMN IF NOT EXISTS signal_type  VARCHAR(20),
                  ADD COLUMN IF NOT EXISTS signal_score INTEGER,
                  ADD COLUMN IF NOT EXISTS source_note  TEXT
            """))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_portfolio_user ON virtual_portfolio (user_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_position_portfolio ON portfolio_positions (portfolio_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_position_ticker ON portfolio_positions (ticker)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_position_source ON portfolio_positions (source_type, source_id)"))
        app.logger.info("Auto-migrate: predicciones/backtests/inversiones verificados")
    except Exception as exc:
        app.logger.debug("Auto-migrate prediction/backtest/portfolio omitido: %s", exc)


    # ── Tablas rewards / wheel / coupons ─────────────────────────────────
    try:
        with db.engine.begin() as conn:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS reward_grants (
                    id            SERIAL PRIMARY KEY,
                    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    reward_type   VARCHAR(40) NOT NULL,
                    reward_value  VARCHAR(80),
                    source        VARCHAR(20) NOT NULL DEFAULT 'wheel',
                    status        VARCHAR(20) NOT NULL DEFAULT 'active',
                    granted_at    TIMESTAMP DEFAULT NOW(),
                    expires_at    TIMESTAMP,
                    metadata      TEXT
                )
            """))
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS wheel_spins (
                    id                   SERIAL PRIMARY KEY,
                    user_id              INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    spin_date            DATE NOT NULL,
                    spin_number          INTEGER NOT NULL DEFAULT 1,
                    reward_type          VARCHAR(40) NOT NULL,
                    reward_value         VARCHAR(80),
                    reward_grant_id      INTEGER REFERENCES reward_grants(id) ON DELETE SET NULL,
                    is_bonus_spin        BOOLEAN NOT NULL DEFAULT FALSE,
                    probability_snapshot TEXT,
                    created_at           TIMESTAMP DEFAULT NOW()
                )
            """))
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS discount_coupons (
                    id               SERIAL PRIMARY KEY,
                    user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    code             VARCHAR(40) UNIQUE NOT NULL,
                    discount_percent INTEGER NOT NULL,
                    source           VARCHAR(20) NOT NULL DEFAULT 'wheel',
                    is_used          BOOLEAN NOT NULL DEFAULT FALSE,
                    expires_at       TIMESTAMP NOT NULL,
                    created_at       TIMESTAMP DEFAULT NOW()
                )
            """))
            conn.execute(text("ALTER TABLE wheel_spins ADD COLUMN IF NOT EXISTS spin_number INTEGER NOT NULL DEFAULT 1"))
            conn.execute(text("ALTER TABLE wheel_spins ADD COLUMN IF NOT EXISTS is_bonus_spin BOOLEAN NOT NULL DEFAULT FALSE"))
            conn.execute(text("ALTER TABLE wheel_spins ADD COLUMN IF NOT EXISTS probability_snapshot TEXT"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_reward_user ON reward_grants (user_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_reward_type_status ON reward_grants (reward_type, status)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_reward_expires ON reward_grants (expires_at)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_wheel_user_date ON wheel_spins (user_id, spin_date)"))
            conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_wheel_user_date_spin ON wheel_spins (user_id, spin_date, spin_number)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_coupon_user ON discount_coupons (user_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_coupon_active ON discount_coupons (is_used, expires_at)"))
        app.logger.info("Auto-migrate: tablas reward/wheel/coupons verificadas/creadas")
    except Exception as exc:
        app.logger.debug("Auto-migrate rewards omitido: %s", exc)

    # ── Marketplace de estrategias ────────────────────────────────────────
    try:
        with db.engine.begin() as conn:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS strategies (
                    id              SERIAL PRIMARY KEY,
                    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    name            VARCHAR(120) NOT NULL,
                    slug            VARCHAR(100) NOT NULL,
                    description     TEXT,
                    short_desc      VARCHAR(280),
                    category        VARCHAR(30) NOT NULL DEFAULT 'other',
                    rules_json      TEXT,
                    visibility      VARCHAR(15) NOT NULL DEFAULT 'private',
                    status          VARCHAR(15) NOT NULL DEFAULT 'draft',
                    is_paid         BOOLEAN NOT NULL DEFAULT FALSE,
                    price           NUMERIC(10,2) NOT NULL DEFAULT 0.00,
                    currency        VARCHAR(5) DEFAULT 'USD',
                    is_featured     BOOLEAN NOT NULL DEFAULT FALSE,
                    times_purchased INTEGER NOT NULL DEFAULT 0,
                    average_rating  NUMERIC(3,2),
                    reviews_count   INTEGER NOT NULL DEFAULT 0,
                    views_count     INTEGER NOT NULL DEFAULT 0,
                    target_tickers  VARCHAR(500),
                    version         INTEGER NOT NULL DEFAULT 1,
                    created_at      TIMESTAMP DEFAULT NOW(),
                    updated_at      TIMESTAMP DEFAULT NOW(),
                    published_at    TIMESTAMP
                )
            """))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_strategy_user      ON strategies (user_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_strategy_status    ON strategies (status)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_strategy_slug      ON strategies (slug)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_strategy_featured  ON strategies (is_featured, status)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_strategy_category  ON strategies (category)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_strategy_purchases ON strategies (times_purchased)"))

            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS strategy_backtest_metrics (
                    id                 SERIAL PRIMARY KEY,
                    strategy_id        INTEGER UNIQUE NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
                    win_rate           NUMERIC(5,2),
                    total_return       NUMERIC(8,2),
                    max_drawdown       NUMERIC(8,2),
                    sharpe_ratio       NUMERIC(6,3),
                    sortino_ratio      NUMERIC(6,3),
                    profit_factor      NUMERIC(6,3),
                    trades_count       INTEGER,
                    avg_trade_days     NUMERIC(6,1),
                    backtest_from      DATE,
                    backtest_to        DATE,
                    ticker_tested      VARCHAR(20),
                    backtest_result_id INTEGER REFERENCES backtest_results(id) ON DELETE SET NULL,
                    last_backtest_at   TIMESTAMP DEFAULT NOW(),
                    created_at         TIMESTAMP DEFAULT NOW()
                )
            """))

            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS strategy_purchases (
                    id                  SERIAL PRIMARY KEY,
                    buyer_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    strategy_id         INTEGER NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
                    seller_id           INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    listed_price        NUMERIC(10,2) NOT NULL DEFAULT 0.00,
                    platform_fee        NUMERIC(10,2) NOT NULL DEFAULT 0.00,
                    seller_amount       NUMERIC(10,2) NOT NULL DEFAULT 0.00,
                    fee_pct             NUMERIC(5,4) NOT NULL DEFAULT 0.2000,
                    strategy_version    INTEGER DEFAULT 1,
                    payment_status      VARCHAR(20) NOT NULL DEFAULT 'pending',
                    payment_provider    VARCHAR(20) NOT NULL DEFAULT 'internal',
                    external_payment_id VARCHAR(200),
                    paid_at             TIMESTAMP,
                    created_at          TIMESTAMP DEFAULT NOW(),
                    UNIQUE (buyer_id, strategy_id)
                )
            """))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_purchase_buyer   ON strategy_purchases (buyer_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_purchase_strategy ON strategy_purchases (strategy_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_purchase_status  ON strategy_purchases (payment_status)"))

            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS strategy_reviews (
                    id          SERIAL PRIMARY KEY,
                    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    strategy_id INTEGER NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
                    rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
                    comment     TEXT,
                    created_at  TIMESTAMP DEFAULT NOW(),
                    updated_at  TIMESTAMP DEFAULT NOW(),
                    UNIQUE (user_id, strategy_id)
                )
            """))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_review_strategy ON strategy_reviews (strategy_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_review_user     ON strategy_reviews (user_id)"))

            published_count = conn.execute(text("SELECT COUNT(*) FROM strategies WHERE status='published'")).scalar() or 0
            if published_count == 0:
                import json as _json
                import secrets as _secrets
                from werkzeug.security import generate_password_hash

                seller = conn.execute(text("SELECT id FROM users WHERE username='market_maker'")).fetchone()
                if seller:
                    seller_id = seller[0]
                else:
                    seller_id = conn.execute(text("""
                        INSERT INTO users (username, email, password_hash, full_name, role, subscription, is_active, created_at)
                        VALUES (:username, :email, :password_hash, :full_name, 'user', 'premium', TRUE, NOW())
                        RETURNING id
                    """), {
                        "username": "market_maker",
                        "email": "market-maker@mypredicts.local",
                        "password_hash": generate_password_hash(_secrets.token_urlsafe(24)),
                        "full_name": "MyPredicts Strategies",
                    }).scalar()

                seed_strategies = [
                    {
                        "name": "Alpha Breakout",
                        "slug": "alpha-breakout",
                        "description": "Rupturas con volumen, confirmacion de momentum y control dinamico de riesgo.",
                        "short_desc": "Breakouts con filtro de volumen y momentum.",
                        "category": "breakout",
                        "price": 49.99,
                        "target_tickers": "AAPL,MSFT,NVDA",
                        "is_featured": True,
                        "metrics": {"win_rate": 65, "total_return": 28.4, "max_drawdown": -8.1, "sharpe_ratio": 1.65, "trades_count": 248, "profit_factor": 2.18, "ticker_tested": "AAPL"},
                        "rules": {
                            "timeframe": "1h",
                            "entry_rules": [
                                {"indicator": "Close", "operator": ">", "value": "20 EMA", "description": "Precio confirma ruptura"},
                                {"indicator": "Volume", "operator": ">", "value": "SMA(20) * 1.4", "description": "Volumen institucional"},
                            ],
                            "exit_rules": [
                                {"indicator": "ATR", "operator": "trailing", "value": "2.2", "description": "Stop dinamico"},
                            ],
                            "indicators": ["EMA20", "RSI14", "ATR", "Volume SMA"],
                        },
                    },
                    {
                        "name": "RSI Master",
                        "slug": "rsi-master",
                        "description": "Estrategia de reversion con RSI, bandas y filtros de volatilidad intradia.",
                        "short_desc": "Mean reversion con RSI y volatilidad.",
                        "category": "mean_reversion",
                        "price": 29.99,
                        "target_tickers": "SPY,QQQ,EURUSD",
                        "is_featured": False,
                        "metrics": {"win_rate": 61, "total_return": 23.1, "max_drawdown": -7.5, "sharpe_ratio": 1.42, "trades_count": 156, "profit_factor": 1.84, "ticker_tested": "SPY"},
                        "rules": {
                            "timeframe": "4h",
                            "entry_rules": [
                                {"indicator": "RSI(14)", "operator": "<", "value": "32", "description": "Sobreventa controlada"},
                                {"indicator": "Close", "operator": "<", "value": "Lower Bollinger", "description": "Extension estadistica"},
                            ],
                            "exit_rules": [
                                {"indicator": "RSI(14)", "operator": ">", "value": "52", "description": "Normalizacion"},
                            ],
                            "indicators": ["RSI14", "Bollinger Bands", "ATR"],
                        },
                    },
                    {
                        "name": "Trend Hunter",
                        "slug": "trend-hunter",
                        "description": "Seguimiento de tendencia multi-timeframe para activos con alta fuerza relativa.",
                        "short_desc": "Tendencias fuertes con confirmacion multi-timeframe.",
                        "category": "trend_following",
                        "price": 59.99,
                        "target_tickers": "NVDA,TSLA,BTCUSD",
                        "is_featured": True,
                        "metrics": {"win_rate": 68, "total_return": 31.7, "max_drawdown": -6.3, "sharpe_ratio": 1.91, "trades_count": 198, "profit_factor": 2.34, "ticker_tested": "NVDA"},
                        "rules": {
                            "timeframe": "1D",
                            "entry_rules": [
                                {"indicator": "EMA50", "operator": ">", "value": "EMA200", "description": "Tendencia primaria"},
                                {"indicator": "Relative Strength", "operator": ">", "value": "70", "description": "Fuerza relativa"},
                            ],
                            "exit_rules": [
                                {"indicator": "Close", "operator": "<", "value": "EMA50", "description": "Perdida de estructura"},
                            ],
                            "indicators": ["EMA50", "EMA200", "Relative Strength", "ADX"],
                        },
                    },
                ]

                for item in seed_strategies:
                    strategy_id = conn.execute(text("""
                        INSERT INTO strategies (
                            user_id, name, slug, description, short_desc, category, rules_json,
                            visibility, status, is_paid, price, currency, is_featured,
                            times_purchased, average_rating, reviews_count, views_count,
                            target_tickers, version, created_at, updated_at, published_at
                        )
                        VALUES (
                            :user_id, :name, :slug, :description, :short_desc, :category, :rules_json,
                            'marketplace', 'published', TRUE, :price, 'EUR', :is_featured,
                            0, 4.7, 0, 0, :target_tickers, 1, NOW(), NOW(), NOW()
                        )
                        RETURNING id
                    """), {
                        "user_id": seller_id,
                        "name": item["name"],
                        "slug": item["slug"],
                        "description": item["description"],
                        "short_desc": item["short_desc"],
                        "category": item["category"],
                        "rules_json": _json.dumps(item["rules"]),
                        "price": item["price"],
                        "is_featured": item["is_featured"],
                        "target_tickers": item["target_tickers"],
                    }).scalar()
                    metrics = item["metrics"]
                    conn.execute(text("""
                        INSERT INTO strategy_backtest_metrics (
                            strategy_id, win_rate, total_return, max_drawdown, sharpe_ratio,
                            profit_factor, trades_count, ticker_tested, last_backtest_at, created_at
                        )
                        VALUES (
                            :strategy_id, :win_rate, :total_return, :max_drawdown, :sharpe_ratio,
                            :profit_factor, :trades_count, :ticker_tested, NOW(), NOW()
                        )
                    """), {"strategy_id": strategy_id, **metrics})

        app.logger.info("Auto-migrate: tablas marketplace de estrategias verificadas/creadas")
    except Exception as exc:
        app.logger.debug("Auto-migrate strategies omitido: %s", exc)

    # ── Billing: subscriptions, payments, billing_events ─────────────────
    try:
        with db.engine.begin() as conn:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS subscriptions (
                    id                        SERIAL PRIMARY KEY,
                    user_id                   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    plan                      VARCHAR(20)  NOT NULL DEFAULT 'free',
                    status                    VARCHAR(20)  NOT NULL DEFAULT 'active',
                    provider                  VARCHAR(20)  NOT NULL DEFAULT 'manual',
                    external_subscription_id  VARCHAR(200) UNIQUE,
                    external_customer_id      VARCHAR(200),
                    current_period_start      TIMESTAMP,
                    current_period_end        TIMESTAMP,
                    cancel_at_period_end      BOOLEAN      NOT NULL DEFAULT FALSE,
                    canceled_at               TIMESTAMP,
                    trial_end                 TIMESTAMP,
                    notes                     TEXT,
                    created_at                TIMESTAMP    NOT NULL DEFAULT NOW(),
                    updated_at                TIMESTAMP             DEFAULT NOW()
                )
            """))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_sub_user       ON subscriptions (user_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_sub_status     ON subscriptions (status)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_sub_user_status ON subscriptions (user_id, status)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_sub_provider   ON subscriptions (provider)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_sub_period_end ON subscriptions (current_period_end)"))

            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS payments (
                    id                    SERIAL PRIMARY KEY,
                    user_id               INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    provider              VARCHAR(20)    NOT NULL DEFAULT 'stripe',
                    amount                NUMERIC(10,2)  NOT NULL,
                    currency              VARCHAR(5)     NOT NULL DEFAULT 'USD',
                    status                VARCHAR(20)    NOT NULL DEFAULT 'pending',
                    plan                  VARCHAR(20),
                    external_payment_id   VARCHAR(200)   UNIQUE,
                    external_customer_id  VARCHAR(200),
                    external_invoice_id   VARCHAR(200),
                    description           VARCHAR(500),
                    refund_reason         VARCHAR(200),
                    created_at            TIMESTAMP      NOT NULL DEFAULT NOW(),
                    updated_at            TIMESTAMP               DEFAULT NOW()
                )
            """))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_payment_user         ON payments (user_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_payment_status        ON payments (status)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_payment_status_user   ON payments (user_id, status)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_payment_created       ON payments (created_at)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_payment_customer      ON payments (external_customer_id)"))

            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS billing_events (
                    id                SERIAL PRIMARY KEY,
                    provider          VARCHAR(20)  NOT NULL DEFAULT 'stripe',
                    event_type        VARCHAR(80)  NOT NULL,
                    external_event_id VARCHAR(200) UNIQUE,
                    user_id           INTEGER      REFERENCES users(id) ON DELETE SET NULL,
                    payload_json      TEXT,
                    processed         BOOLEAN      NOT NULL DEFAULT FALSE,
                    error_msg         TEXT,
                    processed_at      TIMESTAMP,
                    created_at        TIMESTAMP    NOT NULL DEFAULT NOW()
                )
            """))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_billing_event_type    ON billing_events (event_type)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_billing_event_proc    ON billing_events (processed)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_billing_event_created ON billing_events (created_at)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_billing_event_type_created ON billing_events (event_type, created_at)"))

        app.logger.info("Auto-migrate: tablas billing verificadas/creadas")
    except Exception as exc:
        app.logger.debug("Auto-migrate billing omitido: %s", exc)

    # ── App Reviews ──────────────────────────────────────────────────────────
    try:
        with db.engine.begin() as conn:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS app_reviews (
                    id          SERIAL PRIMARY KEY,
                    user_id     INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
                    stars       INTEGER NOT NULL DEFAULT 5 CHECK (stars BETWEEN 1 AND 5),
                    role        VARCHAR(80),
                    text        TEXT NOT NULL,
                    author_name VARCHAR(100),
                    created_at  TIMESTAMP DEFAULT NOW(),
                    updated_at  TIMESTAMP
                )
            """))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_app_review_stars ON app_reviews (stars)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_app_review_created ON app_reviews (created_at)"))
        app.logger.info("Auto-migrate: tabla app_reviews verificada/creada")
    except Exception as exc:
        app.logger.debug("Auto-migrate app_reviews omitido: %s", exc)

    # rumarrcc: alta rapida del primer admin cuando la instancia arranca sin panel listo.
    admin_username = os.environ.get("ADMIN_USERNAME", "").strip()
    if admin_username:
        try:
            from sqlalchemy import text as sql_text
            with db.engine.begin() as conn:
                result = conn.execute(
                    sql_text(
                        "UPDATE users SET role='admin' "
                        "WHERE (LOWER(username)=LOWER(:u) OR LOWER(email)=LOWER(:u)) "
                        "AND role!='admin'"
                    ),
                    {"u": admin_username},
                )
                if result.rowcount:
                    app.logger.info("Auto-migrate: usuario '%s' promovido a admin (case-insensitive)", admin_username)
                else:
                    app.logger.debug("Auto-migrate: '%s' ya era admin o no existe", admin_username)
        except Exception as exc:
            app.logger.debug("Auto-migrate admin-promote omitido: %s", exc)


def create_app(config_name: str | None = None) -> Flask:
    """Crea y configura la aplicación Flask."""
    global redis_client, migrate

    if config_name is None:
        config_name = os.environ.get("FLASK_ENV", "development")

    app = Flask(__name__)
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)
    app.config.from_object(config[config_name])
    app.config["JSON_AS_ASCII"] = False
    app.json.ensure_ascii = False
    if config_name == "production":
        validate_production_config(app.config)

    # ── Inicializar extensiones ────────────────────────────────────────────
    db.init_app(app)
    jwt.init_app(app)
    mail.init_app(app)

    # rumarrcc: cargar modelos aqui evita relationships sin resolver al registrar rutas.
    from .models.user import User, FavoriteTicker          # noqa: F401
    from .models.stock_data import StockData               # noqa: F401
    from .models.indicators import TechnicalIndicator      # noqa: F401
    from .models.prediction import Prediction              # noqa: F401
    from .models.alert import Alert                        # noqa: F401
    from .models.backtest import BacktestResult            # noqa: F401
    from .models.portfolio import VirtualPortfolio, PortfolioPosition  # noqa: F401
    from .models.analysis import SharedAnalysis, AnalysisComment, AnalysisLike, SearchHistory  # noqa: F401
    from .models.ticker import Ticker                      # noqa: F401
    from .models.signal import Signal                      # noqa: F401
    from .models.reward import RewardGrant, WheelSpin, DiscountCoupon  # noqa: F401
    from .models.strategy import Strategy, StrategyBacktestMetrics, StrategyPurchase, StrategyReview  # noqa: F401
    from .models.billing import Subscription, Payment, BillingEvent  # noqa: F401
    from .models.review import AppReview                   # noqa: F401
    from .models.economy import (                           # noqa: F401
        CoinTransaction,
        CoinPackage,
        CoinPurchase,
        MarketplacePrediction,
        MarketplacePurchase,
        RouletteSpin,
        MLModelRun,
        AdminJob,
    )

    # rumarrcc: Alembic queda disponible; produccion se prepara con manage_db.py.
    if _FLASK_MIGRATE_AVAILABLE:
        migrate = FlaskMigrate(app, db, render_as_batch=True)
        app.logger.info("Flask-Migrate (Alembic) inicializado — usa 'flask db upgrade' para migraciones")
    else:
        app.logger.warning("Flask-Migrate no disponible — usando solo auto-migrate. Instala: pip install Flask-Migrate")

    # ── Redis (graceful: si no hay servidor, la app sigue funcionando) ─────
    try:
        import redis as redis_lib
        redis_client = redis_lib.from_url(
            app.config["REDIS_URL"],
            decode_responses=True,
            socket_connect_timeout=2,
            socket_timeout=2,
        )
        redis_client.ping()
        app.logger.info("Redis conectado en %s", app.config["REDIS_URL"])
    except Exception as exc:
        redis_client = None
        app.logger.warning("Redis no disponible (%s) — caché en memoria activa", exc)

    _install_request_security(app)

    # rumarrcc: CORS local flexible, produccion cerrada por CORS_ORIGINS.
    if app.debug:
        CORS(
            app,
            origins="*",
            allow_headers=["Content-Type", "Authorization"],
            methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        )
    else:
        CORS(
            app,
            origins=app.config["CORS_ORIGINS"],
            supports_credentials=True,
            allow_headers=["Content-Type", "Authorization"],
            methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        )

    # ── JWT error handlers ─────────────────────────────────────────────────
    @jwt.expired_token_loader
    def expired_token_callback(jwt_header, jwt_data):
        return jsonify({"error": "UNAUTHORIZED", "message": "Token expirado", "status": 401}), 401

    @jwt.invalid_token_loader
    def invalid_token_callback(error):
        return jsonify({"error": "UNAUTHORIZED", "message": "Token inválido", "status": 401}), 401

    @jwt.unauthorized_loader
    def missing_token_callback(error):
        return jsonify({"error": "UNAUTHORIZED", "message": "Token requerido", "status": 401}), 401

    # Auto-migracion legacy al arranque.
    # No forma parte del flujo normal: la base se prepara con manage_db.py.
    if os.environ.get("AUTO_MIGRATE", "false").lower() == "true":
        with app.app_context():
            _auto_migrate(app)
            try:
                db.create_all()
                app.logger.info("AUTO_MIGRATE: esquema verificado con db.create_all()")
            except Exception as exc:
                app.logger.debug("AUTO_MIGRATE db.create_all omitido: %s", exc)
    else:
        app.logger.info("AUTO_MIGRATE no activo — usa 'py manage_db.py init' o 'py manage_db.py reset --yes'")

    # ── Registrar blueprints ───────────────────────────────────────────────
    from .routes.auth import auth_bp
    from .routes.stocks import stocks_bp
    from .routes.stocks_catalog import catalog_bp
    from .routes.predictions import predictions_bp
    from .routes.alerts import alerts_bp
    from .routes.backtest import backtest_bp
    from .routes.portfolio import portfolio_bp
    from .routes.indicators import indicators_bp
    from .routes.news import news_bp
    from .routes.admin import admin_bp
    from .routes.wheel import wheel_bp, rewards_bp, admin_wheel_bp
    from .routes.strategies import strategies_bp
    from .routes.billing import billing_bp
    from .routes.reviews import reviews_bp
    from .routes.community import community_bp
    from .routes.coin_payments import coin_payments_bp

    app.register_blueprint(auth_bp,    url_prefix="/api/auth")
    app.register_blueprint(catalog_bp, url_prefix="/api/stocks")
    app.register_blueprint(stocks_bp, url_prefix="/api/stock")
    app.register_blueprint(predictions_bp, url_prefix="/api/predictions")
    app.register_blueprint(alerts_bp, url_prefix="/api/alerts")
    app.register_blueprint(backtest_bp, url_prefix="/api/backtest")
    app.register_blueprint(portfolio_bp, url_prefix="/api/portfolio")
    app.register_blueprint(indicators_bp, url_prefix="/api/indicators")
    app.register_blueprint(news_bp,    url_prefix="/api/news")
    app.register_blueprint(wheel_bp, url_prefix="/api/wheel")
    app.register_blueprint(rewards_bp, url_prefix="/api/rewards")
    app.register_blueprint(admin_wheel_bp, url_prefix="/api/admin/wheel")
    app.register_blueprint(strategies_bp, url_prefix="/api/strategies")
    app.register_blueprint(billing_bp,    url_prefix="/api/billing")
    app.register_blueprint(reviews_bp,    url_prefix="/api/reviews")
    app.register_blueprint(community_bp,  url_prefix="/api/community")
    app.register_blueprint(admin_bp, url_prefix="/api/admin")
    app.register_blueprint(coin_payments_bp, url_prefix="/api")

    # ── Ruta raíz / health-check ───────────────────────────────────────────
    @app.route("/api/health")
    def health():
        return jsonify({"status": "ok", "service": "MyPredicts API", "version": "1.0.0"})

    @app.route("/api/search")
    def global_search():
        from flask import request
        from .models.user import User
        from .models.ticker import Ticker

        q = request.args.get("q", "").strip()
        limit = min(int(request.args.get("limit", 10)), 50)

        tickers = []
        users = []

        if q:
            # Usuarios
            user_results = User.query.filter(
                User.username.ilike(f"%{q}%") | User.full_name.ilike(f"%{q}%")
            ).limit(limit).all()
            users = [{"id": u.id, "username": u.username, "full_name": u.full_name} for u in user_results]

            # Análisis
            ticker_results = Ticker.query.filter(
                Ticker.symbol.ilike(f"%{q}%") | Ticker.name.ilike(f"%{q}%")
            ).limit(limit).all()
            tickers = [
                {"id": t.id, "symbol": t.symbol, "name": t.name, "sector": t.sector}
                for t in ticker_results
            ]

            # rumarrcc: si no hay catalogo cargado, devolvemos un ticker basico.
            if not tickers and len(q) <= 5:
                tickers = [{"symbol": q.upper(), "name": f"{q.upper()} ticker", "sector": "N/A"}]

        return jsonify({"tickers": tickers, "users": users})

    # ── Manejadores de error globales ──────────────────────────────────────
    @app.errorhandler(400)
    def bad_request(e):
        return jsonify({"error": "BAD_REQUEST", "message": str(e), "status": 400}), 400

    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"error": "NOT_FOUND", "message": "Recurso no encontrado", "status": 404}), 404

    @app.errorhandler(405)
    def method_not_allowed(e):
        return jsonify({"error": "METHOD_NOT_ALLOWED", "message": "Método no permitido", "status": 405}), 405

    @app.errorhandler(500)
    def internal_error(e):
        db.session.rollback()
        return jsonify({"error": "SERVER_ERROR", "message": "Error interno del servidor", "status": 500}), 500

    # ── Logging ────────────────────────────────────────────────────────────
    if not app.debug and not app.testing:
        os.makedirs("logs", exist_ok=True)
        file_handler = RotatingFileHandler("logs/stockpredictor.log", maxBytes=10240, backupCount=10)
        file_handler.setFormatter(
            logging.Formatter("%(asctime)s %(levelname)s: %(message)s [in %(pathname)s:%(lineno)d]")
        )
        file_handler.setLevel(logging.INFO)
        app.logger.addHandler(file_handler)
        app.logger.setLevel(logging.INFO)

    app.logger.info("MyPredicts iniciado")
    return app
