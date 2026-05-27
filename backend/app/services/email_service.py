"""
Servicio de correo de MyPredicts.
"""
from __future__ import annotations

import logging
from urllib.parse import urlencode

from flask import current_app
from flask_mail import Message

from app import mail

logger = logging.getLogger(__name__)


class EmailService:
    @staticmethod
    def _frontend_url(path: str, **params) -> str:
        base = (current_app.config.get("FRONTEND_URL") or "http://localhost:5173").rstrip("/")
        query = f"?{urlencode(params)}" if params else ""
        return f"{base}{path}{query}"

    @staticmethod
    def _send_message(subject: str, recipient: str, html: str, body: str | None = None) -> bool:
        try:
            msg = Message(subject=subject, recipients=[recipient], body=body, html=html)
            mail.send(msg)
            logger.info("Email enviado a %s: %s", recipient, subject)
            return True
        except Exception as exc:
            logger.error("Error enviando email a %s: %s", recipient, exc)
            return False

    @staticmethod
    def send_email_verification(user, token: str) -> bool:
        verification_url = EmailService._frontend_url("/verify-email", token=token)
        username = user.full_name or user.username
        subject = "Verifica tu correo en MyPredicts"
        body = (
            f"Hola {username},\n\n"
            "Confirma tu correo para activar tu cuenta de MyPredicts:\n"
            f"{verification_url}\n\n"
            "El enlace caduca por seguridad. Si no has creado esta cuenta, puedes ignorar este correo."
        )
        html = f"""
        <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#111827;">
          <h2>Verifica tu correo</h2>
          <p>Hola <strong>{username}</strong>,</p>
          <p>Confirma este correo para activar tu cuenta de MyPredicts.</p>
          <p>
            <a href="{verification_url}"
               style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;
                      padding:12px 18px;border-radius:8px;font-weight:700;">
              Verificar correo
            </a>
          </p>
          <p style="font-size:13px;color:#6b7280;">
            Si el botón no funciona, copia este enlace en el navegador:<br>
            <span>{verification_url}</span>
          </p>
        </div>
        """
        return EmailService._send_message(subject, user.email, html, body)

    @staticmethod
    def send_welcome_email(user) -> bool:
        username = user.full_name or user.username
        subject = "Bienvenido a MyPredicts"
        html = f"""
        <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#111827;">
          <h2>Hola {username}</h2>
          <p>Tu cuenta en <strong>MyPredicts</strong> ya está lista.</p>
          <p>Desde la plataforma puedes generar predicciones, revisar análisis, probar backtests y gestionar tu cartera virtual.</p>
          <p style="font-size:13px;color:#6b7280;">
            MyPredicts es una herramienta educativa de análisis financiero. No constituye asesoramiento financiero.
          </p>
        </div>
        """
        return EmailService._send_message(subject, user.email, html)

    @staticmethod
    def send_password_reset_email(user, reset_token: str) -> bool:
        reset_url = EmailService._frontend_url("/reset-password", token=reset_token)
        username = user.full_name or user.username
        subject = "Restablece tu contraseña en MyPredicts"
        body = (
            f"Hola {username},\n\n"
            "Usa este enlace para restablecer tu contraseña:\n"
            f"{reset_url}\n\n"
            "Si no lo has solicitado, ignora este correo."
        )
        html = f"""
        <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#111827;">
          <h2>Restablecer contraseña</h2>
          <p>Hola <strong>{username}</strong>,</p>
          <p>Hemos recibido una solicitud para cambiar la contraseña de tu cuenta.</p>
          <p>
            <a href="{reset_url}"
               style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;
                      padding:12px 18px;border-radius:8px;font-weight:700;">
              Cambiar contraseña
            </a>
          </p>
          <p style="font-size:13px;color:#6b7280;">
            Este enlace caduca por seguridad. Si no lo has solicitado, puedes ignorar este correo.
          </p>
        </div>
        """
        return EmailService._send_message(subject, user.email, html, body)

    @staticmethod
    def send_alert_email(alert) -> bool:
        user = alert.user
        if not user or not user.email:
            return False

        subject = f"[MyPredicts] Alerta disparada: {alert.ticker}"
        body = EmailService._build_alert_body(alert)
        return EmailService._send_message(subject, user.email, EmailService._build_alert_html(alert), body)

    @staticmethod
    def send_alert_created_email(alert) -> bool:
        user = alert.user
        if not user or not user.email:
            return False

        type_labels = {
            "price_threshold": "Precio umbral",
            "prediction_change": "Cambio de predicción",
            "trend_reversal": "Inversión de tendencia",
        }
        cond_label = ""
        if alert.alert_type == "price_threshold":
            cond = "supere" if alert.condition == "above" else "caiga por debajo de"
            cond_label = f"cuando el precio {cond} {alert.trigger_value}"
        elif alert.alert_type == "prediction_change":
            cond_label = f"cuando la predicción cambie más de {alert.change_percent}%"
        elif alert.alert_type == "trend_reversal":
            cond_label = "cuando detectemos una inversión de tendencia RSI"

        username = user.full_name or user.username
        html = f"""
        <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#111827;">
          <h2>Alerta configurada correctamente</h2>
          <p>Hola <strong>{username}</strong>,</p>
          <p>Tu alerta para <strong>{alert.ticker}</strong> ha sido creada.</p>
          <ul>
            <li>Tipo: {type_labels.get(alert.alert_type, alert.alert_type)}</li>
            <li>Condición: {cond_label}</li>
            <li>Prioridad: {alert.priority or "medium"}</li>
          </ul>
          <p style="font-size:13px;color:#6b7280;">
            MyPredicts es una herramienta educativa. No constituye asesoramiento financiero.
          </p>
        </div>
        """
        return EmailService._send_message(f"[MyPredicts] Alerta creada: {alert.ticker}", user.email, html)

    @staticmethod
    def _build_alert_body(alert) -> str:
        if alert.alert_type == "price_threshold":
            condition = "superado" if alert.condition == "above" else "caído por debajo de"
            return (
                f"Tu alerta para {alert.ticker} se ha disparado.\n"
                f"El precio ha {condition} {alert.trigger_value}.\n\n"
                "MyPredicts - herramienta educativa de análisis financiero."
            )
        if alert.alert_type == "trend_reversal":
            return (
                f"Tu alerta de inversión de tendencia para {alert.ticker} se ha disparado.\n"
                "El RSI ha cruzado el nivel 50, indicando posible cambio de tendencia.\n\n"
                "MyPredicts - herramienta educativa de análisis financiero."
            )
        if alert.alert_type == "prediction_change":
            return (
                f"Tu alerta de cambio de predicción para {alert.ticker} se ha disparado.\n"
                f"La predicción del modelo {alert.model} ha cambiado más de {alert.change_percent}%.\n\n"
                "MyPredicts - herramienta educativa de análisis financiero."
            )
        return f"Tu alerta para {alert.ticker} se ha disparado."

    @staticmethod
    def _build_alert_html(alert) -> str:
        type_labels = {
            "price_threshold": "Umbral de precio",
            "trend_reversal": "Inversión de tendencia",
            "prediction_change": "Cambio de predicción",
        }
        label = type_labels.get(alert.alert_type, alert.alert_type)

        detail = ""
        if alert.alert_type == "price_threshold":
            direction = "superado" if alert.condition == "above" else "caído por debajo de"
            detail = f"El precio de <strong>{alert.ticker}</strong> ha {direction} <strong>{alert.trigger_value}</strong>."
        elif alert.alert_type == "trend_reversal":
            detail = f"El RSI de <strong>{alert.ticker}</strong> ha cruzado el nivel 50."
        elif alert.alert_type == "prediction_change":
            detail = f"La predicción del modelo <em>{alert.model}</em> para <strong>{alert.ticker}</strong> ha cambiado más de {alert.change_percent}%."

        return f"""
        <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#111827;">
          <h2>Alerta disparada: {label}</h2>
          <p>{detail}</p>
          <p style="font-size:13px;color:#6b7280;">
            MyPredicts es una herramienta educativa de análisis financiero. No constituye asesoramiento financiero.
          </p>
        </div>
        """
