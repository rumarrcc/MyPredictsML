"""
migrate_db.py — Migración segura para añadir role/is_blocked/last_login a la tabla users.
También crea el primer usuario admin si no existe ninguno.

Uso:
    python migrate_db.py                  # migración + admin interactivo
    python migrate_db.py --skip-admin     # solo migración, sin crear admin
    python migrate_db.py --admin-username kevin  # migración + promueve 'kevin'
"""
import os
import sys
import argparse
import getpass

sys.path.insert(0, os.path.dirname(__file__))
os.environ.setdefault("FLASK_ENV", "development")

from app import create_app, db
from sqlalchemy import text, inspect

app = create_app()


# ── Helpers ────────────────────────────────────────────────────────────────

def column_exists(conn, table: str, column: str) -> bool:
    insp = inspect(conn)
    cols = [c["name"] for c in insp.get_columns(table)]
    return column in cols


def run_migration():
    """Añade las columnas nuevas a la tabla users si no existen."""
    with app.app_context():
        with db.engine.connect() as conn:
            added = []

            if not column_exists(conn, "users", "role"):
                conn.execute(text(
                    "ALTER TABLE users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'user'"
                ))
                added.append("role")
                print("  ✅ Columna 'role' añadida")
            else:
                print("  ⏭  Columna 'role' ya existe")

            if not column_exists(conn, "users", "is_blocked"):
                conn.execute(text(
                    "ALTER TABLE users ADD COLUMN is_blocked BOOLEAN NOT NULL DEFAULT FALSE"
                ))
                added.append("is_blocked")
                print("  ✅ Columna 'is_blocked' añadida")
            else:
                print("  ⏭  Columna 'is_blocked' ya existe")

            if not column_exists(conn, "users", "last_login"):
                conn.execute(text(
                    "ALTER TABLE users ADD COLUMN last_login TIMESTAMP"
                ))
                added.append("last_login")
                print("  ✅ Columna 'last_login' añadida")
            else:
                print("  ⏭  Columna 'last_login' ya existe")

            conn.commit()

            if added:
                print(f"\n✅ Migración completada. Columnas añadidas: {', '.join(added)}")
            else:
                print("\n✅ Schema ya estaba actualizado, no se realizaron cambios.")


def promote_user(username_or_email: str):
    """Promueve un usuario existente a admin."""
    from app.models.user import User
    with app.app_context():
        user = User.query.filter(
            (User.username == username_or_email) |
            (User.email == username_or_email)
        ).first()
        if not user:
            print(f"  No se encontró usuario con username/email '{username_or_email}'")
            return False
        user.role = "admin"
        user.email_verified = True
        db.session.commit()
        print(f"  @{user.username} ({user.email}) promovido a administrador")
        return True


def create_admin_user(username: str, email: str, password: str):
    """Crea un nuevo usuario con role=admin."""
    from app.models.user import User
    with app.app_context():
        if User.query.filter_by(username=username).first():
            print(f"  Username '{username}' ya existe -> promoviendo a admin")
            return promote_user(username)
        if User.query.filter_by(email=email).first():
            print(f"  Email '{email}' ya existe -> promoviendo a admin")
            return promote_user(email)
        admin = User(username=username.lower().strip(), email=email.lower().strip(), role="admin")
        admin.set_password(password)
        admin.email_verified = True
        db.session.add(admin)
        db.session.commit()
        print(f"  Admin creado: @{admin.username} ({admin.email})")
        return True


def interactive_admin():
    """Modo interactivo para gestionar el admin."""
    from app.models.user import User
    with app.app_context():
        admin_count = User.query.filter_by(role="admin").count()

    if admin_count > 0:
        print(f"\n  ℹ️  Ya existe{'n' if admin_count > 1 else ''} {admin_count} admin(s) en la base de datos.")
        ans = input("  ¿Quieres añadir otro admin? [s/N]: ").strip().lower()
        if ans != "s":
            print("  ⏭  Sin cambios en admins.")
            return

    print("\n  ¿Cómo quieres crear el admin?")
    print("  1) Promover usuario existente")
    print("  2) Crear nuevo usuario admin")
    choice = input("  Opción [1/2]: ").strip()

    if choice == "1":
        ident = input("  Username o email a promover: ").strip()
        promote_user(ident)
    elif choice == "2":
        username = input("  Nuevo username: ").strip()
        email    = input("  Email: ").strip()
        password = getpass.getpass("  Contraseña: ")
        if len(password) < 6:
            print("  ❌ La contraseña debe tener al menos 6 caracteres")
            return
        create_admin_user(username, email, password)
    else:
        print("  ❌ Opción no válida")


# ── Punto de entrada ──────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Migración de BD y gestión de admin — MyPredicts")
    parser.add_argument("--skip-admin",       action="store_true", help="Saltar creación de admin")
    parser.add_argument("--admin-username",   help="Promover este usuario a admin directamente")
    parser.add_argument("--create-admin",     action="store_true", help="Crear admin (pide datos por consola)")
    parser.add_argument("--admin-email",      help="Email del nuevo admin (con --create-admin)")
    parser.add_argument("--admin-password",   help="Contraseña del nuevo admin (con --create-admin)")
    args = parser.parse_args()

    print("\n=== MyPredicts — Migración de base de datos ===\n")
    print("Paso 1: Añadiendo columnas a la tabla 'users'...")
    run_migration()

    if args.skip_admin:
        print("\nPaso 2: Omitido (--skip-admin)")
        return

    print("\nPaso 2: Gestión del usuario admin...")

    if args.admin_username:
        promote_user(args.admin_username)
    elif args.create_admin:
        if not args.admin_email or not args.admin_password:
            print("  ❌ Con --create-admin necesitas --admin-email y --admin-password")
            sys.exit(1)
        create_admin_user(args.admin_username or "admin", args.admin_email, args.admin_password)
    else:
        interactive_admin()

    print("\n✅ Proceso completado.\n")


if __name__ == "__main__":
    main()
