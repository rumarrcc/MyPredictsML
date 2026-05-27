"""
Script de utilidad: crea o promueve un usuario a administrador.

Uso:
    python create_admin.py                         # interactivo
    python create_admin.py --username kevin        # promueve usuario existente
    python create_admin.py --create --username kevin --email k@x.com --password s3cr3t
"""
import os
import sys
import argparse

# Asegurarse de que estamos en el directorio del backend
sys.path.insert(0, os.path.dirname(__file__))

from app import create_app, db
from app.models.user import User

app = create_app(os.environ.get("FLASK_ENV", "development"))


def promote_existing(username: str) -> None:
    user = User.query.filter(
        (User.username == username) | (User.email == username)
    ).first()
    if not user:
        print(f"No se encontró ningún usuario con username/email '{username}'")
        sys.exit(1)
    user.role = "admin"
    user.email_verified = True
    db.session.commit()
    print(f"@{user.username} ({user.email}) promovido a administrador")


def create_admin(username: str, email: str, password: str) -> None:
    if User.query.filter_by(username=username).first():
        print(f"El username '{username}' ya existe. Promoviendo a admin...")
        promote_existing(username)
        return
    if User.query.filter_by(email=email).first():
        print(f"El email '{email}' ya existe. Promoviendo a admin...")
        promote_existing(email)
        return
    admin = User(username=username, email=email, role="admin")
    admin.set_password(password)
    admin.email_verified = True
    db.session.add(admin)
    db.session.commit()
    print(f"Nuevo usuario admin creado: @{username} ({email})")


def interactive() -> None:
    print("=== Crear/Promover usuario Admin en MyPredicts ===\n")
    action = input("¿Promover usuario existente (P) o crear nuevo (C)? [P/C]: ").strip().upper()

    if action == "P":
        username = input("Username o email del usuario a promover: ").strip()
        promote_existing(username)
    elif action == "C":
        username = input("Nuevo username: ").strip()
        email    = input("Email: ").strip()
        import getpass
        password = getpass.getpass("Contraseña: ")
        create_admin(username, email, password)
    else:
        print("Opción no válida")
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="Gestión de usuario admin de MyPredicts")
    parser.add_argument("--username", help="Username o email a promover/crear")
    parser.add_argument("--email",    help="Email (solo con --create)")
    parser.add_argument("--password", help="Contraseña (solo con --create)")
    parser.add_argument("--create",   action="store_true", help="Crear nuevo usuario admin")
    args = parser.parse_args()

    with app.app_context():
        if args.create:
            if not args.username or not args.email or not args.password:
                print("Con --create necesitas pasar --username, --email y --password")
                sys.exit(1)
            create_admin(args.username, args.email, args.password)
        elif args.username:
            promote_existing(args.username)
        else:
            interactive()


if __name__ == "__main__":
    main()
