"""
Herramienta explicita para preparar la base de datos de MyPredicts.

Uso habitual:
    py manage_db.py init
    py manage_db.py reset --yes
    py manage_db.py seed
    py manage_db.py check
"""
from __future__ import annotations

import argparse
import os
import sys
from getpass import getpass

from sqlalchemy import inspect, text

os.environ["AUTO_MIGRATE"] = "false"
os.environ.setdefault("FLASK_ENV", "development")
sys.path.insert(0, os.path.dirname(__file__))

from app import create_app, db


app = create_app(os.environ.get("FLASK_ENV", "development"))


def _engine_name() -> str:
    return db.engine.url.get_backend_name()


def _reset_postgres_schema() -> None:
    with db.engine.begin() as conn:
        conn.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))
        conn.execute(text("GRANT ALL ON SCHEMA public TO public"))


def _reset_sqlalchemy_tables() -> None:
    db.drop_all()


def crear_esquema() -> None:
    db.create_all()


def sembrar_datos_base() -> None:
    from app.services.ticker_service import TickerService
    from app.services.economy_services import StripePaymentService

    tickers = TickerService.seed(overwrite=False)
    StripePaymentService.ensure_default_packages()
    print(f"Tickers sembrados/actualizados: {tickers.get('inserted', 0) + tickers.get('updated', 0)}")
    print("Paquetes de monedas verificados: 100, 500, 1000")


def crear_admin(username: str | None, email: str | None, password: str | None) -> None:
    if not username and not email and not password:
        return

    from app.models.user import User

    username = (username or input("Username admin: ")).strip().lower()
    email = (email or input("Email admin: ")).strip().lower()
    password = password or getpass("Password admin: ")

    if not username or not email or not password:
        raise SystemExit("Faltan datos para crear el admin.")

    existente = User.query.filter((User.username == username) | (User.email == email)).first()
    if existente:
        existente.role = "admin"
        existente.email_verified = True
        db.session.commit()
        print(f"Admin existente promovido: {existente.username}")
        return

    admin = User(username=username, email=email, role="admin")
    admin.set_password(password)
    admin.email_verified = True
    db.session.add(admin)
    db.session.commit()
    print(f"Admin creado: {username}")


def actualizar_auth_email() -> None:
    with db.engine.begin() as conn:
        conn.execute(text("""
            ALTER TABLE users
              ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT TRUE,
              ADD COLUMN IF NOT EXISTS email_verification_token_hash VARCHAR(128),
              ADD COLUMN IF NOT EXISTS email_verification_sent_at TIMESTAMP,
              ADD COLUMN IF NOT EXISTS password_reset_token_hash VARCHAR(128),
              ADD COLUMN IF NOT EXISTS password_reset_sent_at TIMESTAMP
        """))
        conn.execute(text("ALTER TABLE users ALTER COLUMN email_verified SET DEFAULT FALSE"))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS ix_users_email_verification_token_hash
            ON users (email_verification_token_hash)
            WHERE email_verification_token_hash IS NOT NULL
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS ix_users_password_reset_token_hash
            ON users (password_reset_token_hash)
            WHERE password_reset_token_hash IS NOT NULL
        """))


def init_db(args) -> None:
    with app.app_context():
        crear_esquema()
        sembrar_datos_base()
        crear_admin(args.admin_username, args.admin_email, args.admin_password)
    print("Base de datos inicializada sin parches de arranque.")


def reset_db(args) -> None:
    if not args.yes:
        raise SystemExit("Reset cancelado. Repite con --yes para borrar los datos de prueba.")

    with app.app_context():
        if _engine_name().startswith("postgres"):
            _reset_postgres_schema()
        else:
            _reset_sqlalchemy_tables()
        crear_esquema()
        sembrar_datos_base()
        crear_admin(args.admin_username, args.admin_email, args.admin_password)
    print("Base de datos recreada desde cero.")


def seed_db(_) -> None:
    with app.app_context():
        sembrar_datos_base()
    print("Seed base completado.")


def check_db(_) -> None:
    required = {
        "users": {"id", "username", "email", "password_hash", "role", "email_verified"},
        "tickers": {"id", "symbol", "name", "exchange", "sector", "is_supported"},
        "coin_packages": {"id", "name", "coins", "price_cents", "currency"},
        "subscriptions": {"id", "user_id", "plan", "status"},
    }

    with app.app_context():
        inspector = inspect(db.engine)
        tables = set(inspector.get_table_names())
        ok = True
        for table, columns in required.items():
            if table not in tables:
                ok = False
                print(f"Falta tabla: {table}")
                continue
            existing_columns = {column["name"] for column in inspector.get_columns(table)}
            missing = columns - existing_columns
            if missing:
                ok = False
                print(f"{table}: faltan columnas {', '.join(sorted(missing))}")
            else:
                print(f"{table}: OK")
        if not ok:
            raise SystemExit(1)
    print("Chequeo de esquema correcto.")


def upgrade_auth_db(_) -> None:
    with app.app_context():
        actualizar_auth_email()
    print("Columnas de autenticación y verificación de email actualizadas.")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Gestion de base de datos de MyPredicts")
    sub = parser.add_subparsers(dest="command", required=True)

    for name in ("init", "reset"):
        cmd = sub.add_parser(name)
        cmd.add_argument("--admin-username")
        cmd.add_argument("--admin-email")
        cmd.add_argument("--admin-password")
        if name == "reset":
            cmd.add_argument("--yes", action="store_true")
        cmd.set_defaults(func=init_db if name == "init" else reset_db)

    seed = sub.add_parser("seed")
    seed.set_defaults(func=seed_db)

    check = sub.add_parser("check")
    check.set_defaults(func=check_db)

    upgrade_auth = sub.add_parser("upgrade-auth")
    upgrade_auth.set_defaults(func=upgrade_auth_db)

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
