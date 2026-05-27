"""
Validadores para datos de entrada de la API.
"""
import re
import os
from typing import Any


def validate_register(data: dict) -> str | None:
    """Valida los datos de registro. Retorna mensaje de error o None si OK."""
    required = ["username", "email", "password"]
    for field in required:
        if not data.get(field):
            return f"El campo '{field}' es requerido"

    username = data["username"].strip()
    if len(username) < 3 or len(username) > 50:
        return "username debe tener entre 3 y 50 caracteres"
    if not re.match(r"^[a-zA-Z0-9_.-]+$", username):
        return "username solo puede contener letras, números, guiones y puntos"

    email = data["email"].strip()
    if not _is_valid_email(email):
        return "Email inválido"
    if os.environ.get("EMAIL_VALIDATE_DOMAIN", "true").lower() == "true" and not _email_domain_accepts_mail(email):
        return "El dominio del email no parece aceptar correo"

    password = data["password"]
    pwd_error = _validate_password(password)
    if pwd_error:
        return pwd_error

    return None


def validate_login(data: dict) -> str | None:
    if not data.get("email"):
        return "email es requerido"
    if not data.get("password"):
        return "password es requerido"
    return None


def _is_valid_email(email: str) -> bool:
    pattern = r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$"
    return bool(re.match(pattern, email))


def _email_domain_accepts_mail(email: str) -> bool:
    domain = email.rsplit("@", 1)[-1].lower()
    if domain in {"example.com", "example.org", "example.net", "test.com", "localhost"}:
        return False
    try:
        import dns.resolver

        resolver = dns.resolver.Resolver()
        resolver.lifetime = 3
        resolver.timeout = 2
        try:
            answers = resolver.resolve(domain, "MX")
            return any(str(answer.exchange).strip(".") for answer in answers)
        except dns.resolver.NoAnswer:
            answers = resolver.resolve(domain, "A")
            return bool(answers)
        except (dns.resolver.NXDOMAIN, dns.resolver.NoNameservers):
            return False
        except dns.resolver.Timeout:
            return True
    except Exception:
        return True


def _validate_password(password: str) -> str | None:
    if len(password) < 8:
        return "La contraseña debe tener al menos 8 caracteres"
    if len(password) > 128:
        return "La contraseña no puede superar 128 caracteres"
    if not re.search(r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]", password):
        return "La contraseña debe incluir al menos una letra"
    if not re.search(r"\d", password):
        return "La contraseña debe incluir al menos un número"
    return None


def validate_ticker_input(ticker: str) -> str | None:
    """Valida el formato de un símbolo bursátil."""
    if not ticker or not isinstance(ticker, str):
        return "ticker es requerido"
    ticker = ticker.strip().upper()
    if len(ticker) < 1 or len(ticker) > 10:
        return "El ticker debe tener entre 1 y 10 caracteres"
    if not re.match(r"^[A-Z0-9.\-^=]+$", ticker):
        return "El ticker contiene caracteres inválidos"
    return None


def validate_date_range(start_date_str: str, end_date_str: str) -> str | None:
    """Valida que start_date < end_date y ambas son fechas válidas."""
    from datetime import date
    try:
        start = date.fromisoformat(start_date_str)
        end = date.fromisoformat(end_date_str)
    except (ValueError, TypeError):
        return "Formato de fecha inválido (use YYYY-MM-DD)"

    if start >= end:
        return "start_date debe ser anterior a end_date"
    if (end - start).days < 10:
        return "El rango de fechas debe ser de al menos 10 días"

    return None
