"""Servicios de monedas internas y cobros Stripe de MyPredicts."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from decimal import Decimal

from flask import current_app

from app import db
from app.models.billing import BillingEvent, _now as billing_now
from app.models.economy import CoinPackage, CoinPurchase, CoinTransaction
from app.models.user import User


def utcnow():
    return datetime.now(timezone.utc)


class DomainError(ValueError):
    def __init__(self, message: str, code: str = "BAD_REQUEST", status: int = 400, details: dict | None = None):
        super().__init__(message)
        self.code = code
        self.status = status
        self.details = details or {}


class CoinService:
    @staticmethod
    def get_balance(user_id: int) -> int:
        user = User.query.get(user_id)
        return int(user.internal_coins or 0) if user else 0

    @staticmethod
    def credit(user_id: int, amount: int, reason: str, reference_type: str | None = None, reference_id: int | None = None):
        if amount <= 0:
            raise DomainError("La cantidad de monedas debe ser positiva")
        user = User.query.get(user_id)
        if not user:
            raise DomainError("Usuario no encontrado", "NOT_FOUND", 404)
        user.internal_coins = int(user.internal_coins or 0) + int(amount)
        tx = CoinTransaction(
            user_id=user_id,
            amount=int(amount),
            type="credit",
            reason=reason,
            reference_type=reference_type,
            reference_id=reference_id,
            balance_after=user.internal_coins,
        )
        db.session.add(tx)
        db.session.flush()
        return tx

    @staticmethod
    def debit(user_id: int, amount: int, reason: str, reference_type: str | None = None, reference_id: int | None = None):
        if amount <= 0:
            raise DomainError("La cantidad de monedas debe ser positiva")
        user = User.query.get(user_id)
        if not user:
            raise DomainError("Usuario no encontrado", "NOT_FOUND", 404)
        balance = int(user.internal_coins or 0)
        if balance < amount:
            raise DomainError(
                "No tienes monedas suficientes para esta compra.",
                "INSUFFICIENT_COINS",
                402,
                {
                    "required_coins": int(amount),
                    "current_balance": balance,
                    "missing_coins": int(amount) - balance,
                    "recharge_available": True,
                },
            )
        user.internal_coins = balance - int(amount)
        tx = CoinTransaction(
            user_id=user_id,
            amount=int(amount),
            type="debit",
            reason=reason,
            reference_type=reference_type,
            reference_id=reference_id,
            balance_after=user.internal_coins,
        )
        db.session.add(tx)
        db.session.flush()
        return tx


class StripePaymentService:
    DEFAULT_PACKAGES = [
        ("Pack 100 monedas", 100, 499, "EUR"),
        ("Pack 500 monedas", 500, 1999, "EUR"),
        ("Pack 1000 monedas", 1000, 3499, "EUR"),
    ]

    @staticmethod
    def ensure_default_packages():
        default_names = {name for name, _, _, _ in StripePaymentService.DEFAULT_PACKAGES}
        CoinPackage.query.filter(~CoinPackage.name.in_(default_names)).update({"is_active": False}, synchronize_session=False)
        for name, coins, price_cents, currency in StripePaymentService.DEFAULT_PACKAGES:
            package = CoinPackage.query.filter_by(name=name).first()
            if package:
                package.coins = coins
                package.price_cents = price_cents
                package.currency = currency
                package.is_active = True
            else:
                db.session.add(CoinPackage(name=name, coins=coins, price_cents=price_cents, currency=currency, is_active=True))
        db.session.commit()

    @staticmethod
    def _require_stripe_key():
        key = current_app.config.get("STRIPE_SECRET_KEY", "")
        if not key or not key.startswith(("sk_test_", "sk_live_")):
            raise DomainError("Falta configurar la pasarela de pago", "STRIPE_NOT_CONFIGURED", 503)
        return key

    @staticmethod
    def create_checkout_session(user_id: int, package_id: int):
        stripe_key = StripePaymentService._require_stripe_key()
        package = CoinPackage.query.filter_by(id=package_id, is_active=True).first()
        if not package:
            raise DomainError("Paquete de monedas no disponible", "PACKAGE_NOT_FOUND", 404)

        purchase = CoinPurchase(
            user_id=user_id,
            package_id=package.id,
            coins=package.coins,
            amount_cents=package.price_cents,
            currency=package.currency,
            status="pending",
        )
        db.session.add(purchase)
        db.session.flush()

        import stripe

        stripe.api_key = stripe_key
        frontend_url = current_app.config.get("FRONTEND_URL", "http://localhost:5173").rstrip("/")
        success_url = (current_app.config.get("COIN_SUCCESS_URL") or f"{frontend_url}/coins/success").rstrip("/")
        cancel_url = (current_app.config.get("COIN_CANCEL_URL") or f"{frontend_url}/coins/cancel").rstrip("/")
        metadata = {
            "source": "mypredicts_wallet",
            "user_id": str(user_id),
            "package_id": str(package.id),
            "purchase_id": str(purchase.id),
            "coins": str(package.coins),
        }
        session = stripe.checkout.Session.create(
            mode="payment",
            line_items=[{
                "price_data": {
                    "currency": package.currency.lower(),
                    "unit_amount": package.price_cents,
                    "product_data": {
                        "name": f"{package.name} - MyPredicts",
                        "description": "Recarga de monedas internas de MyPredicts.",
                    },
                },
                "quantity": 1,
            }],
            success_url=f"{success_url}?purchase_id={purchase.id}&session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{cancel_url}?purchase_id={purchase.id}",
            metadata=metadata,
            payment_intent_data={"metadata": metadata},
        )
        purchase.stripe_checkout_session_id = session.id
        db.session.commit()
        return {
            "checkout_url": session.url,
            "session_id": session.id,
            "purchase_id": purchase.id,
        }

    @staticmethod
    def handle_webhook(payload: bytes, signature: str | None):
        stripe_key = StripePaymentService._require_stripe_key()
        webhook_secret = current_app.config.get("STRIPE_WEBHOOK_SECRET", "")
        if not webhook_secret:
            raise DomainError("Falta STRIPE_WEBHOOK_SECRET", "STRIPE_WEBHOOK_NOT_CONFIGURED", 503)
        if not signature:
            raise DomainError("Firma Stripe-Signature requerida", "INVALID_SIGNATURE", 400)

        import stripe

        stripe.api_key = stripe_key
        try:
            event = stripe.Webhook.construct_event(payload, signature, webhook_secret)
        except Exception as exc:
            raise DomainError(f"Firma Stripe invalida: {exc}", "INVALID_SIGNATURE", 400)

        event_type = event.get("type")
        external_event_id = event.get("id")
        existing_event = BillingEvent.query.filter_by(external_event_id=external_event_id).first() if external_event_id else None
        if existing_event and existing_event.processed:
            return {"processed": False, "idempotent": True, "event_type": event_type}

        billing_event = existing_event or BillingEvent(
            provider="stripe",
            event_type=event_type or "unknown",
            external_event_id=external_event_id,
            payload_json=json.dumps(event, default=str),
            processed=False,
        )
        db.session.add(billing_event)
        db.session.flush()

        try:
            if event_type == "checkout.session.completed":
                result = StripePaymentService.handle_checkout_completed(event["data"]["object"], commit=False)
            elif event_type == "checkout.session.expired":
                result = StripePaymentService.handle_checkout_cancelled(event["data"]["object"], commit=False)
            elif event_type == "payment_intent.payment_failed":
                result = StripePaymentService.handle_payment_failed(event["data"]["object"], commit=False)
            else:
                result = {"processed": False, "event_type": event_type}
            billing_event.processed = True
            billing_event.processed_at = billing_now()
            db.session.commit()
            return result
        except Exception as exc:
            billing_event.error_msg = str(exc)
            db.session.commit()
            raise

    @staticmethod
    def handle_checkout_completed(session, commit=True):
        metadata = session.get("metadata") or {}
        purchase_id = int(metadata.get("purchase_id") or 0)
        purchase = CoinPurchase.query.get(purchase_id)
        if not purchase:
            raise DomainError("Compra no encontrada", "PURCHASE_NOT_FOUND", 404)
        if purchase.status == "paid":
            return {"processed": False, "idempotent": True, "purchase": purchase.to_dict()}
        if session.get("payment_status") not in (None, "paid"):
            raise DomainError("La sesion de Stripe no esta pagada", "PAYMENT_NOT_PAID", 400)

        purchase.status = "paid"
        purchase.paid_at = utcnow()
        purchase.stripe_checkout_session_id = session.get("id") or purchase.stripe_checkout_session_id
        purchase.stripe_payment_intent_id = session.get("payment_intent")
        purchase.stripe_customer_id = session.get("customer")
        CoinService.credit(purchase.user_id, purchase.coins, "stripe_test_purchase", "CoinPurchase", purchase.id)
        try:
            from app.models.billing import Payment

            external_id = purchase.stripe_payment_intent_id or purchase.stripe_checkout_session_id
            if external_id and not Payment.query.filter_by(external_payment_id=external_id).first():
                db.session.add(Payment(
                    user_id=purchase.user_id,
                    provider="stripe",
                    amount=Decimal(purchase.amount_cents) / Decimal("100"),
                    currency=purchase.currency,
                    status="succeeded",
                    plan="coin_purchase",
                    external_payment_id=external_id,
                    external_customer_id=purchase.stripe_customer_id,
                    description=f"Compra de {purchase.coins} monedas internas",
                ))
        except Exception as exc:
            current_app.logger.warning("No se pudo registrar Payment de monedas: %s", exc)
        if commit:
            db.session.commit()
        return {"processed": True, "purchase": purchase.to_dict()}

    @staticmethod
    def sync_checkout_session(user_id: int, purchase_id: int, session_id: str):
        stripe_key = StripePaymentService._require_stripe_key()
        clean_session_id = (session_id or "").strip()
        if not clean_session_id.startswith("cs_"):
            raise DomainError("Sesion Stripe no valida", "INVALID_SESSION", 400)

        purchase = CoinPurchase.query.filter_by(id=purchase_id, user_id=user_id).first()
        if not purchase:
            raise DomainError("Compra no encontrada", "PURCHASE_NOT_FOUND", 404)
        if purchase.status == "paid":
            return purchase
        if purchase.stripe_checkout_session_id and clean_session_id != purchase.stripe_checkout_session_id:
            raise DomainError("La sesion de Stripe no coincide con esta compra", "SESSION_MISMATCH", 403)

        import stripe

        stripe.api_key = stripe_key
        try:
            session = stripe.checkout.Session.retrieve(clean_session_id)
        except Exception as exc:
            raise DomainError(f"No se pudo verificar la sesion con Stripe: {exc}", "STRIPE_SESSION_ERROR", 502)

        metadata = session.get("metadata") or {}
        if str(metadata.get("purchase_id") or "") != str(purchase.id):
            raise DomainError("La sesion de Stripe no pertenece a esta compra", "SESSION_MISMATCH", 403)
        if str(metadata.get("user_id") or "") != str(user_id):
            raise DomainError("La sesion de Stripe no pertenece a este usuario", "SESSION_MISMATCH", 403)

        if session.get("payment_status") == "paid":
            StripePaymentService.handle_checkout_completed(session, commit=True)
            db.session.refresh(purchase)
        elif session.get("status") == "expired":
            StripePaymentService.handle_checkout_cancelled(session, commit=True)
            db.session.refresh(purchase)

        return purchase

    @staticmethod
    def handle_checkout_cancelled(session, commit=True):
        purchase = CoinPurchase.query.filter_by(stripe_checkout_session_id=session.get("id")).first()
        if purchase and purchase.status == "pending":
            purchase.status = "cancelled"
            purchase.failed_at = utcnow()
            purchase.error_message = "Stripe Checkout expirado o cancelado"
            if commit:
                db.session.commit()
        return {"processed": bool(purchase), "purchase": purchase.to_dict() if purchase else None}

    @staticmethod
    def handle_payment_failed(payment_intent, commit=True):
        purchase = CoinPurchase.query.filter_by(stripe_payment_intent_id=payment_intent.get("id")).first()
        if purchase and purchase.status != "paid":
            purchase.status = "failed"
            purchase.failed_at = utcnow()
            purchase.error_message = payment_intent.get("last_payment_error", {}).get("message") if payment_intent.get("last_payment_error") else "Pago fallido"
            if commit:
                db.session.commit()
        return {"processed": bool(purchase), "purchase": purchase.to_dict() if purchase else None}
