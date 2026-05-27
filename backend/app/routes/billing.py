"""
Rutas de billing/suscripciones — /api/billing

Endpoints públicos (autenticados):
  GET  /my-subscription             → plan efectivo + info de suscripción
  POST /create-checkout-session     → crea sesión de Stripe Checkout
  POST /create-portal-session       → crea sesión de Stripe Customer Portal
  GET  /plans                       → retorna PLAN_LIMITS para la UI

Webhook (sin JWT, validación por firma Stripe):
  POST /webhook                     → recibe eventos Stripe, idempotente

Admin:
  GET  /admin/stats                 → estadísticas de facturación globales
  GET  /admin/users/<user_id>       → suscripción de un usuario concreto
  POST /admin/users/<user_id>/set-plan  → fuerza plan manualmente
"""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity

from app import db
from app.models.user import User
from app.models.billing import Subscription, Payment, BillingEvent
from app.services.subscription_service import SubscriptionService, PLAN_LIMITS, normalize_plan
from app.utils.decorators import admin_required

logger = logging.getLogger(__name__)

billing_bp = Blueprint("billing", __name__)


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _stripe_datetime(timestamp: int | None) -> datetime | None:
    if not timestamp:
        return None
    return datetime.fromtimestamp(int(timestamp), tz=timezone.utc).replace(tzinfo=None)


def _current_user():
    uid = get_jwt_identity()
    return User.query.get(uid)


def _is_configured_value(value: str | None, pending_markers: tuple[str, ...] = ("PENDIENTE", "TODO", "CHANGE_ME")) -> bool:
    """True si el valor existe y no parece placeholder."""
    if not value:
        return False
    upper = str(value).upper()
    return not any(marker in upper for marker in pending_markers)


def _stripe_price_or_price_data(plan: str) -> dict:
    """
    Devuelve line_item para Checkout.
    rumarrcc: primero Price ID real; si falta, Stripe crea el precio mensual al vuelo.
    """
    # mcajamar - 12/04/2026: configuré Stripe en modo prueba con checkout y webhook para monedas y suscripción.
    plan = normalize_plan(plan)
    price_id = current_app.config.get("STRIPE_PRO_PRICE_ID", "")
    amount = current_app.config.get("STRIPE_PRO_AMOUNT_CENTS", 999)
    label = "MyPredicts PRO"

    if _is_configured_value(price_id):
        return {"price": price_id, "quantity": 1}

    return {
        "price_data": {
            "currency": current_app.config.get("STRIPE_CURRENCY", "eur"),
            "unit_amount": int(amount),
            "recurring": {"interval": "month"},
            "product_data": {
                "name": label,
                "metadata": {"plan": plan},
            },
        },
        "quantity": 1,
    }


def _stripe_price_id_for_plan(plan: str) -> str | None:
    if normalize_plan(plan) != "pro":
        return None
    price_id = current_app.config.get("STRIPE_PRO_PRICE_ID", "")
    return price_id if _is_configured_value(price_id) else None


def _subscription_confers_access(status: str | None) -> bool:
    return status in ("active", "trialing")


def _sync_user_effective_plan(user) -> None:
    if not user:
        return
    user.subscription = SubscriptionService.get_effective_subscription(user)


def _success_url_with_session_id() -> str:
    """
    Stripe reemplaza {CHECKOUT_SESSION_ID} al completar Checkout.
    Tenerlo en la URL nos permite sincronizar la suscripcion aunque el webhook
    local no este escuchando o falle durante desarrollo.
    """
    success_url = current_app.config.get("STRIPE_SUCCESS_URL") or "http://localhost:5173/billing?success=1"
    if "{CHECKOUT_SESSION_ID}" in success_url or "session_id=" in success_url:
        return success_url

    separator = "&" if "?" in success_url else "?"
    return f"{success_url}{separator}session_id={{CHECKOUT_SESSION_ID}}"


def _frontend_url(path: str) -> str:
    base = os.environ.get("FRONTEND_URL") or "http://localhost:5173"
    return f"{base.rstrip('/')}/{path.lstrip('/')}"


def _money_from_cents(cents: int | None) -> float:
    return round(float(cents or 0) / 100.0, 2)


def _wallet_topup_balance(user_id: int) -> float:
    from sqlalchemy import func

    total = db.session.query(func.sum(Payment.amount)).filter_by(
        user_id=user_id,
        status="succeeded",
        plan="wallet_topup",
    ).scalar() or 0
    spent = db.session.query(func.sum(Payment.amount)).filter_by(
        user_id=user_id,
        status="succeeded",
        plan="wallet_spend",
    ).scalar() or 0
    return round(float(total) - float(spent), 2)


def _wallet_payload(user) -> dict:
    payments = (
        Payment.query
        .filter_by(user_id=user.id)
        .filter(Payment.plan.in_(["wallet_topup", "wallet_spend"]))
        .order_by(Payment.created_at.desc())
        .limit(12)
        .all()
    )
    return {
        "balance": _wallet_topup_balance(user.id),
        "currency": current_app.config.get("STRIPE_CURRENCY", "eur").upper(),
        "transactions": [p.to_dict() for p in payments],
    }


# ── GET /plans ─────────────────────────────────────────────────────────────────

@billing_bp.get("/plans")
def get_plans():
    """Devuelve los límites de cada plan para que el frontend pueda renderizar la tabla."""
    return jsonify({
        "plans": {key: PLAN_LIMITS[key] for key in ("free", "pro")},
        "plan_order": ["free", "pro"],
    })


# ── GET /my-subscription ───────────────────────────────────────────────────────

@billing_bp.get("/my-subscription")
@jwt_required()
def my_subscription():
    user = _current_user()
    if not user:
        return jsonify({"error": "NOT_FOUND", "message": "Usuario no encontrado"}), 404

    info = SubscriptionService.get_subscription_info(user)
    return jsonify(info)


# ── POST /create-checkout-session ─────────────────────────────────────────────

@billing_bp.post("/create-checkout-session")
@jwt_required()
def create_checkout_session():
    """
    Crea una Stripe Checkout Session para el plan PRO.
    Devuelve { checkout_url } para redirigir al usuario.
    Requiere STRIPE_SECRET_KEY; si no hay Price ID, usa price_data recurrente.
    """
    stripe_key = current_app.config.get("STRIPE_SECRET_KEY", "")
    if not _is_configured_value(stripe_key):
        return jsonify({
            "error": "STRIPE_NOT_CONFIGURED",
            "message": "Falta STRIPE_SECRET_KEY valida en backend/.env.",
        }), 503

    data = request.get_json(silent=True) or {}
    plan = normalize_plan(str(data.get("plan", "")).strip().lower())

    if plan != "pro":
        return jsonify({"error": "BAD_REQUEST", "message": "El unico plan de pago disponible es PRO"}), 400

    success_url = _success_url_with_session_id()
    cancel_url = current_app.config.get("STRIPE_CANCEL_URL")
    if not _is_configured_value(success_url) or not _is_configured_value(cancel_url):
        return jsonify({
            "error": "STRIPE_URLS_NOT_CONFIGURED",
            "message": "Faltan STRIPE_SUCCESS_URL o STRIPE_CANCEL_URL validas.",
        }), 503

    user = _current_user()
    if not user:
        return jsonify({"error": "NOT_FOUND", "message": "Usuario no encontrado"}), 404

    try:
        import stripe
        stripe.api_key = stripe_key

        # Obtener o crear Customer de Stripe
        customer_id = SubscriptionService.get_or_create_stripe_customer(user)

        session_params = {
            "mode": "subscription",
            "line_items": [_stripe_price_or_price_data(plan)],
            "success_url": success_url,
            "cancel_url":  cancel_url,
            "metadata": {"user_id": str(user.id), "plan": plan},
            "subscription_data": {"metadata": {"user_id": str(user.id), "plan": plan}},
        }
        if customer_id:
            session_params["customer"] = customer_id
        else:
            session_params["customer_email"] = user.email

        checkout_session = stripe.checkout.Session.create(**session_params)

        return jsonify({
            "checkout_url": checkout_session.url,
            "session_id":   checkout_session.id,
        })

    except Exception as exc:
        logger.error("Billing: error creando Stripe Checkout Session: %s", exc)
        return jsonify({"error": "STRIPE_ERROR", "message": str(exc)}), 500


# ── POST /create-portal-session ───────────────────────────────────────────────

@billing_bp.post("/create-portal-session")
@jwt_required()
def create_portal_session():
    """
    Crea una Stripe Customer Portal Session para gestionar la suscripción.
    El usuario puede cancelar, cambiar plan, actualizar forma de pago, etc.
    """
    stripe_key = current_app.config.get("STRIPE_SECRET_KEY", "")
    if not _is_configured_value(stripe_key):
        return jsonify({
            "error": "STRIPE_NOT_CONFIGURED",
            "message": "Falta STRIPE_SECRET_KEY valida en backend/.env.",
        }), 503

    user = _current_user()
    if not user:
        return jsonify({"error": "NOT_FOUND", "message": "Usuario no encontrado"}), 404

    # Buscar customer ID
    sub = (
        Subscription.query
        .filter_by(user_id=user.id)
        .filter(Subscription.external_customer_id != None)
        .order_by(Subscription.created_at.desc())
        .first()
    )
    customer_id = sub.external_customer_id if sub else None

    if not customer_id:
        return jsonify({
            "error": "NO_STRIPE_CUSTOMER",
            "message": "No tienes una suscripción de Stripe activa.",
        }), 400

    try:
        import stripe
        stripe.api_key = stripe_key

        return_url = current_app.config.get("STRIPE_SUCCESS_URL", "http://localhost:5173/billing")
        portal_session = stripe.billing_portal.Session.create(
            customer=customer_id,
            return_url=return_url,
        )
        return jsonify({"portal_url": portal_session.url})

    except Exception as exc:
        logger.error("Billing: error creando Stripe Portal Session: %s", exc)
        return jsonify({"error": "STRIPE_ERROR", "message": str(exc)}), 500


# ── POST /webhook ──────────────────────────────────────────────────────────────

@billing_bp.get("/wallet")
@jwt_required()
def get_wallet():
    """Saldo de wallet calculado desde el ledger de pagos."""
    user = _current_user()
    if not user:
        return jsonify({"error": "NOT_FOUND", "message": "Usuario no encontrado"}), 404
    return jsonify(_wallet_payload(user)), 200


@billing_bp.post("/wallet/create-topup-session")
@jwt_required()
def create_wallet_topup_session():
    """Crea una Stripe Checkout Session de pago unico para recargar wallet."""
    return jsonify({
        "error": "LEGACY_WALLET_DISABLED",
        "message": "La wallet monetaria legacy esta desactivada. Compra monedas internas en /api/payments/stripe/coin-checkout.",
        "status": 410,
    }), 410

    stripe_key = current_app.config.get("STRIPE_SECRET_KEY", "")
    if not _is_configured_value(stripe_key):
        return jsonify({
            "error": "STRIPE_NOT_CONFIGURED",
            "message": "Falta STRIPE_SECRET_KEY valida en backend/.env.",
        }), 503

    user = _current_user()
    if not user:
        return jsonify({"error": "NOT_FOUND", "message": "Usuario no encontrado"}), 404

    data = request.get_json(silent=True) or {}
    try:
        amount = round(float(data.get("amount", 0)), 2)
    except Exception:
        amount = 0
    if amount < 5 or amount > 1000:
        return jsonify({"error": "BAD_REQUEST", "message": "La recarga debe estar entre 5 y 1000."}), 400
    success_path = str(data.get("success_path") or "/billing/payment-methods").strip()
    if not success_path.startswith("/") or success_path.startswith("//"):
        success_path = "/billing/payment-methods"
    separator = "&" if "?" in success_path else "?"
    success_path = f"{success_path}{separator}wallet_success=1&session_id={{CHECKOUT_SESSION_ID}}"

    try:
        import stripe
        stripe.api_key = stripe_key
        customer_id = SubscriptionService.get_or_create_stripe_customer(user)
        currency = current_app.config.get("STRIPE_CURRENCY", "eur").lower()

        session_params = {
            "mode": "payment",
            "line_items": [{
                "price_data": {
                    "currency": currency,
                    "unit_amount": int(round(amount * 100)),
                    "product_data": {
                        "name": "Recarga wallet MyPredicts",
                        "metadata": {"type": "wallet_topup"},
                    },
                },
                "quantity": 1,
            }],
            "success_url": _frontend_url(success_path),
            "cancel_url": _frontend_url("/billing/payment-methods?wallet_canceled=1"),
            "metadata": {"type": "wallet_topup", "user_id": str(user.id), "amount": f"{amount:.2f}"},
            "payment_intent_data": {"metadata": {"type": "wallet_topup", "user_id": str(user.id)}},
        }
        if customer_id:
            session_params["customer"] = customer_id
        else:
            session_params["customer_email"] = user.email

        checkout_session = stripe.checkout.Session.create(**session_params)
        return jsonify({"checkout_url": checkout_session.url, "session_id": checkout_session.id}), 200

    except Exception as exc:
        logger.error("Billing: error creando wallet top-up Checkout Session: %s", exc)
        return jsonify({"error": "STRIPE_ERROR", "message": str(exc)}), 500


@billing_bp.post("/wallet/sync-topup-session")
@jwt_required()
def sync_wallet_topup_session():
    """Sincroniza una recarga completada cuando vuelve el navegador de Stripe."""
    return jsonify({
        "error": "LEGACY_WALLET_DISABLED",
        "message": "La sincronizacion de wallet monetaria legacy esta desactivada. Las recargas reales son de monedas internas.",
        "status": 410,
    }), 410

    stripe_key = current_app.config.get("STRIPE_SECRET_KEY", "")
    if not _is_configured_value(stripe_key):
        return jsonify({
            "error": "STRIPE_NOT_CONFIGURED",
            "message": "Falta STRIPE_SECRET_KEY valida en backend/.env.",
        }), 503

    data = request.get_json(silent=True) or {}
    session_id = (data.get("session_id") or "").strip()
    if not session_id.startswith("cs_"):
        return jsonify({"error": "BAD_REQUEST", "message": "session_id invalido"}), 400

    user = _current_user()
    if not user:
        return jsonify({"error": "NOT_FOUND", "message": "Usuario no encontrado"}), 404

    try:
        import stripe
        stripe.api_key = stripe_key
        checkout_session = stripe.checkout.Session.retrieve(session_id)
        metadata = checkout_session.get("metadata", {}) or {}

        if metadata.get("type") != "wallet_topup":
            return jsonify({"error": "BAD_REQUEST", "message": "La sesion no es una recarga de wallet."}), 400
        if str(metadata.get("user_id") or "") != str(user.id):
            return jsonify({"error": "FORBIDDEN", "message": "La sesion no pertenece al usuario actual."}), 403
        if checkout_session.get("payment_status") != "paid":
            return jsonify({"error": "PAYMENT_NOT_COMPLETED", "message": "La recarga todavia no esta pagada."}), 409

        _handle_wallet_topup_checkout(dict(checkout_session), user, checkout_session.get("customer"))
        db.session.commit()
        return jsonify({"message": "Wallet recargada correctamente.", **_wallet_payload(user)}), 200

    except Exception as exc:
        db.session.rollback()
        logger.error("Billing: error sincronizando wallet top-up %s: %s", session_id, exc)
        return jsonify({"error": "STRIPE_ERROR", "message": str(exc)}), 500


@billing_bp.post("/sync-checkout-session")
@jwt_required()
def sync_checkout_session():
    """
    Sincroniza una sesion de Checkout completada desde el retorno del navegador.
    Complementa al webhook para que el flujo local no dependa solo del listener.
    """
    stripe_key = current_app.config.get("STRIPE_SECRET_KEY", "")
    if not _is_configured_value(stripe_key):
        return jsonify({
            "error": "STRIPE_NOT_CONFIGURED",
            "message": "Falta STRIPE_SECRET_KEY valida en backend/.env.",
        }), 503

    data = request.get_json(silent=True) or {}
    session_id = (data.get("session_id") or "").strip()
    if not session_id.startswith("cs_"):
        return jsonify({"error": "BAD_REQUEST", "message": "session_id invalido"}), 400

    user = _current_user()
    if not user:
        return jsonify({"error": "NOT_FOUND", "message": "Usuario no encontrado"}), 404

    try:
        import stripe
        stripe.api_key = stripe_key

        checkout_session = stripe.checkout.Session.retrieve(session_id)
        metadata = checkout_session.get("metadata", {}) or {}
        metadata_user_id = str(metadata.get("user_id") or "")

        if metadata_user_id and metadata_user_id != str(user.id):
            return jsonify({
                "error": "FORBIDDEN",
                "message": "La sesion de pago no pertenece al usuario actual.",
            }), 403

        if checkout_session.get("payment_status") != "paid":
            return jsonify({
                "error": "PAYMENT_NOT_COMPLETED",
                "message": "El pago todavia no aparece como completado en Stripe.",
            }), 409

        return jsonify({
            "message": "Pago confirmado por Stripe. El plan se activara al recibir el webhook firmado.",
            "status": "awaiting_webhook",
            **SubscriptionService.get_subscription_info(user),
        }), 202

    except Exception as exc:
        db.session.rollback()
        logger.error("Billing: error sincronizando Checkout Session %s: %s", session_id, exc)
        return jsonify({"error": "STRIPE_ERROR", "message": str(exc)}), 500


@billing_bp.post("/webhook")
def stripe_webhook():
    """
    Recibe webhooks de Stripe.
    - Valida la firma con STRIPE_WEBHOOK_SECRET
    - Es idempotente: BillingEvent.external_event_id UNIQUE previene reprocesar
    - Procesa: checkout.session.completed, customer.subscription.updated/deleted,
               invoice.payment_succeeded, invoice.payment_failed
    """
    webhook_secret = current_app.config.get("STRIPE_WEBHOOK_SECRET", "")
    if not _is_configured_value(webhook_secret, pending_markers=("PENDIENTE", "TODO", "CHANGE_ME", "WHSEC_PENDIENTE")):
        logger.error("Billing webhook: STRIPE_WEBHOOK_SECRET no configurado")
        return jsonify({"error": "WEBHOOK_NOT_CONFIGURED"}), 503

    payload   = request.get_data(as_text=True)
    sig_header = request.headers.get("Stripe-Signature", "")

    try:
        import stripe
        stripe.api_key = current_app.config.get("STRIPE_SECRET_KEY", "")
        event = stripe.Webhook.construct_event(payload, sig_header, webhook_secret)
    except Exception as exc:
        logger.warning("Billing webhook: firma inválida — %s", exc)
        return jsonify({"error": "INVALID_SIGNATURE"}), 400

    event_id   = event.get("id")
    event_type = event.get("type")
    event_obj  = event.get("data", {}).get("object", {})

    # ── Idempotencia: descartar si ya se procesó ──────────────────────────────
    existing = BillingEvent.query.filter_by(external_event_id=event_id).first()
    if existing:
        logger.info("Billing webhook: evento %s ya procesado (idempotente)", event_id)
        return jsonify({"status": "already_processed"}), 200

    # ── Registrar el evento crudo ─────────────────────────────────────────────
    billing_event = BillingEvent(
        provider=         "stripe",
        event_type=       event_type,
        external_event_id=event_id,
        payload_json=     json.dumps(event_obj),
        processed=        False,
    )
    db.session.add(billing_event)

    try:
        # ── Resolver user_id desde metadata o customer ────────────────────────
        user_id    = None
        customer_id = event_obj.get("customer")
        metadata   = event_obj.get("metadata", {}) or {}

        if metadata.get("user_id"):
            user_id = int(metadata["user_id"])
        elif customer_id:
            sub = Subscription.query.filter_by(external_customer_id=customer_id).first()
            if sub:
                user_id = sub.user_id

        billing_event.user_id = user_id
        user = User.query.get(user_id) if user_id else None

        # ── Procesar por tipo de evento ───────────────────────────────────────
        if event_type == "checkout.session.completed":
            _handle_checkout_completed(event_obj, user, customer_id)

        elif event_type in (
            "customer.subscription.updated",
            "customer.subscription.created",
        ):
            _handle_subscription_updated(event_obj, user)

        elif event_type == "customer.subscription.deleted":
            _handle_subscription_deleted(event_obj, user)

        elif event_type == "invoice.payment_succeeded":
            _handle_invoice_paid(event_obj, user, customer_id)

        elif event_type == "invoice.payment_failed":
            _handle_invoice_failed(event_obj, user)

        else:
            logger.debug("Billing webhook: evento '%s' ignorado (no manejado)", event_type)

        billing_event.processed    = True
        billing_event.processed_at = _now()
        db.session.commit()
        logger.info("Billing webhook: evento %s (%s) procesado OK", event_id, event_type)

    except Exception as exc:
        db.session.rollback()
        billing_event.error_msg = str(exc)
        try:
            db.session.add(billing_event)
            db.session.commit()
        except Exception:
            db.session.rollback()
        logger.error("Billing webhook: error procesando evento %s: %s", event_id, exc)
        return jsonify({"error": "PROCESSING_ERROR"}), 500

    return jsonify({"status": "ok"}), 200


# ── Handlers de eventos Stripe ─────────────────────────────────────────────────

def _stripe_plan_from_subscription(stripe_sub: dict) -> str:
    """Intenta deducir el plan desde una Stripe Subscription."""
    cfg     = current_app.config
    pro_price     = cfg.get("STRIPE_PRO_PRICE_ID", "")
    premium_price = cfg.get("STRIPE_PREMIUM_PRICE_ID", "")

    items = stripe_sub.get("items", {}).get("data", [])
    for item in items:
        price_id = item.get("price", {}).get("id", "")
        if price_id == premium_price:
            return "pro"
        if price_id == pro_price:
            return "pro"

    # Fallback: mirar metadata
    meta = stripe_sub.get("metadata", {}) or {}
    return normalize_plan(meta.get("plan", "pro"))


def _handle_checkout_completed(event_obj: dict, user, customer_id: str | None) -> None:
    """checkout.session.completed — solo para mode='subscription'."""
    metadata = event_obj.get("metadata", {}) or {}
    mode = event_obj.get("mode")

    if mode == "payment" and metadata.get("academic_simulation") == "true" and metadata.get("purchase_id"):
        from app.services.economy_services import StripePaymentService
        StripePaymentService.handle_checkout_completed(event_obj, commit=False)
        return

    if mode == "payment" and metadata.get("type") == "strategy_purchase":
        logger.warning("Billing: strategy_purchase ignorado; las estrategias se compran con monedas internas")
        return

    if mode == "payment" and metadata.get("type") == "wallet_topup":
        logger.warning("Billing: wallet_topup ignorado; las recargas usan monedas internas")
        return

    if mode != "subscription":
        return

    stripe_sub_id = event_obj.get("subscription")
    if not stripe_sub_id:
        return

    # Obtener detalles de la suscripción desde Stripe
    import stripe as stripe_lib
    stripe_lib.api_key = current_app.config.get("STRIPE_SECRET_KEY", "")
    try:
        stripe_sub = stripe_lib.Subscription.retrieve(stripe_sub_id)
    except Exception as exc:
        logger.error("Billing: error recuperando suscripción %s: %s", stripe_sub_id, exc)
        raise

    plan   = _stripe_plan_from_subscription(stripe_sub)
    status = stripe_sub.get("status", "active")

    period_start = _stripe_datetime(stripe_sub.get("current_period_start"))
    period_end   = _stripe_datetime(stripe_sub.get("current_period_end"))
    trial_end_ts = stripe_sub.get("trial_end")
    trial_end    = _stripe_datetime(trial_end_ts)

    cid = customer_id or stripe_sub.get("customer")

    # Crear o actualizar Subscription en BD
    sub = Subscription.query.filter_by(external_subscription_id=stripe_sub_id).first()
    if sub:
        sub.plan                  = plan
        sub.status                = status
        sub.external_customer_id  = cid
        sub.current_period_start  = period_start
        sub.current_period_end    = period_end
        sub.trial_end             = trial_end
    else:
        sub = Subscription(
            user_id=                 user.id if user else None,
            plan=                    plan,
            status=                  status,
            provider=                "stripe",
            external_subscription_id=stripe_sub_id,
            external_customer_id=    cid,
            current_period_start=    period_start,
            current_period_end=      period_end,
            trial_end=               trial_end,
        )
        db.session.add(sub)

    # Sincronizar campo cacheado del usuario solo si la suscripcion confiere acceso.
    if user:
        _sync_user_effective_plan(user)

    db.session.flush()
    logger.info("Billing: Subscription %s creada/actualizada → plan=%s", stripe_sub_id, plan)


def _handle_strategy_purchase_checkout(event_obj: dict, user, customer_id: str | None) -> None:
    """Completa una compra puntual de estrategia pagada por Stripe Checkout."""
    metadata = event_obj.get("metadata", {}) or {}
    strategy_id = metadata.get("strategy_id")
    buyer_id = metadata.get("buyer_id") or metadata.get("user_id")
    if not strategy_id or not buyer_id:
        logger.warning("Billing: strategy_purchase sin metadata suficiente: %s", metadata)
        return

    if user is None:
        user = User.query.get(int(buyer_id))

    from app.services.strategy_service import StrategyService

    external_id = event_obj.get("payment_intent") or event_obj.get("id")
    result, err = StrategyService.confirm_payment(
        int(strategy_id),
        int(buyer_id),
        external_payment_id=external_id,
        provider="stripe",
    )
    if err:
        raise RuntimeError(err)

    if external_id and Payment.query.filter_by(external_payment_id=external_id).first():
        return

    amount = _money_from_cents(event_obj.get("amount_total"))
    currency = (event_obj.get("currency") or current_app.config.get("STRIPE_CURRENCY", "eur")).upper()
    payment = Payment(
        user_id=int(buyer_id),
        provider="stripe",
        amount=amount,
        currency=currency,
        status="succeeded",
        plan="strategy_purchase",
        external_payment_id=external_id,
        external_customer_id=customer_id or event_obj.get("customer"),
        description=f"Compra estrategia #{strategy_id} - {currency} {amount:.2f}",
    )
    db.session.add(payment)
    db.session.flush()
    logger.info("Billing: compra estrategia confirmada strategy=%s buyer=%s", strategy_id, buyer_id)


def _handle_wallet_topup_checkout(event_obj: dict, user, customer_id: str | None) -> None:
    """Registra una recarga de wallet como movimiento de ledger."""
    metadata = event_obj.get("metadata", {}) or {}
    user_id = metadata.get("user_id") or (user.id if user else None)
    if not user_id:
        logger.warning("Billing: wallet_topup sin user_id")
        return

    external_id = event_obj.get(
        "payment_intent") or event_obj.get("id")

    if external_id and Payment.query.filter_by(external_payment_id=external_id).first():
        logger.info("Billing: wallet_topup %s ya registrado (idempotente)", external_id)
        return

    try:
        amount = float(metadata.get("amount") or 0) or _money_from_cents(event_obj.get("amount_total"))
    except Exception:
        amount = _money_from_cents(event_obj.get("amount_total"))

    currency = (event_obj.get("currency") or current_app.config.get("STRIPE_CURRENCY", "eur")).upper()
    payment = Payment(
        user_id=int(user_id),
        provider="stripe",
        amount=amount,
        currency=currency,
        status="succeeded",
        plan="wallet_topup",
        external_payment_id=external_id,
        external_customer_id=customer_id or event_obj.get("customer"),
        description=f"Recarga wallet MyPredicts - {currency} {amount:.2f}",
    )
    db.session.add(payment)
    db.session.flush()
    logger.info("Billing: wallet_topup registrado user=%s amount=%s", user_id, amount)


def _upsert_subscription_from_stripe(stripe_sub: dict, user=None) -> Subscription:
    """Crea/actualiza la Subscription local desde un objeto subscription de Stripe."""
    sub_id = stripe_sub.get("id")
    if not sub_id:
        raise ValueError("Stripe subscription sin id")

    metadata = stripe_sub.get("metadata", {}) or {}
    user_id = int(metadata["user_id"]) if metadata.get("user_id") else (user.id if user else None)
    if user is None and user_id:
        user = User.query.get(user_id)

    plan = _stripe_plan_from_subscription(stripe_sub)
    status = stripe_sub.get("status", "incomplete")
    sub = Subscription.query.filter_by(external_subscription_id=sub_id).first()
    if not sub:
        sub = Subscription(user_id=user_id, provider="stripe", external_subscription_id=sub_id)
        db.session.add(sub)

    sub.user_id = sub.user_id or user_id
    sub.plan = plan
    sub.status = status
    sub.external_customer_id = stripe_sub.get("customer")
    sub.current_period_start = _stripe_datetime(stripe_sub.get("current_period_start"))
    sub.current_period_end = _stripe_datetime(stripe_sub.get("current_period_end"))
    sub.cancel_at_period_end = bool(stripe_sub.get("cancel_at_period_end"))
    sub.canceled_at = _stripe_datetime(stripe_sub.get("canceled_at"))
    sub.trial_end = _stripe_datetime(stripe_sub.get("trial_end"))

    db.session.flush()
    if user:
        _sync_user_effective_plan(user)
    return sub


def _handle_subscription_updated(event_obj: dict, user) -> None:
    sub = _upsert_subscription_from_stripe(event_obj, user)
    logger.info("Billing: subscription updated %s status=%s plan=%s", sub.external_subscription_id, sub.status, sub.plan)


def _handle_subscription_deleted(event_obj: dict, user) -> None:
    sub = _upsert_subscription_from_stripe(event_obj, user)
    sub.status = "canceled"
    sub.cancel_at_period_end = False
    sub.canceled_at = sub.canceled_at or _now()
    if user is None and sub.user_id:
        user = User.query.get(sub.user_id)
    if user:
        _sync_user_effective_plan(user)
    db.session.flush()
    logger.info("Billing: subscription canceled %s user=%s", sub.external_subscription_id, sub.user_id)


def _record_invoice_payment(event_obj: dict, user, customer_id: str | None, status: str) -> None:
    invoice_id = event_obj.get("id")
    external_id = event_obj.get("payment_intent") or invoice_id
    if status == "failed" and external_id:
        external_id = f"{external_id}:failed"
    if external_id and Payment.query.filter_by(external_payment_id=external_id).first():
        logger.info("Billing: invoice payment %s ya registrado", external_id)
        return

    amount_cents = event_obj.get("amount_paid") if status == "succeeded" else event_obj.get("amount_due")
    currency = (event_obj.get("currency") or current_app.config.get("STRIPE_CURRENCY", "eur")).upper()
    sub_id = event_obj.get("subscription")
    local_sub = Subscription.query.filter_by(external_subscription_id=sub_id).first() if sub_id else None
    if user is None and local_sub:
        user = User.query.get(local_sub.user_id)

    db.session.add(Payment(
        user_id=user.id if user else (local_sub.user_id if local_sub else None),
        provider="stripe",
        amount=_money_from_cents(amount_cents),
        currency=currency,
        status=status,
        plan=local_sub.plan if local_sub else None,
        external_payment_id=external_id,
        external_customer_id=customer_id or event_obj.get("customer"),
        external_invoice_id=invoice_id,
        description=f"Stripe invoice {invoice_id} - {status}",
    ))


def _handle_invoice_paid(event_obj: dict, user, customer_id: str | None) -> None:
    _record_invoice_payment(event_obj, user, customer_id, "succeeded")
    sub_id = event_obj.get("subscription")
    if sub_id:
        sub = Subscription.query.filter_by(external_subscription_id=sub_id).first()
        if sub and sub.status in ("past_due", "unpaid", "incomplete"):
            sub.status = "active"
            if user is None:
                user = User.query.get(sub.user_id)
    if user:
        _sync_user_effective_plan(user)
    db.session.flush()


def _handle_invoice_failed(event_obj: dict, user) -> None:
    _record_invoice_payment(event_obj, user, event_obj.get("customer"), "failed")
    sub_id = event_obj.get("subscription")
    if sub_id:
        sub = Subscription.query.filter_by(external_subscription_id=sub_id).first()
        if sub:
            sub.status = "past_due"
            if user is None:
                user = User.query.get(sub.user_id)
    if user:
        _sync_user_effective_plan(user)
    db.session.flush()
    logger.warning("Billing: invoice payment_failed invoice=%s subscription=%s", event_obj.get("id"), sub_id)


# ── Admin billing endpoints ────────────────────────────────────────────────────

@billing_bp.get("/admin/stats")
@jwt_required()
def admin_billing_stats():
    from sqlalchemy import func
    from decimal import Decimal
    from app.models.economy import CoinPurchase
    from app.models.user import User as UserModel

    user = _current_user()
    if not user or getattr(user, "role", None) != "admin":
        return jsonify({"error": "FORBIDDEN"}), 403

    payment_revenue_raw = db.session.query(
        func.coalesce(func.sum(Payment.amount), 0)
    ).filter(Payment.status == "succeeded").scalar() or 0
    coin_purchase_cents = db.session.query(
        func.coalesce(func.sum(CoinPurchase.amount_cents), 0)
    ).filter(CoinPurchase.status == "paid").scalar() or 0
    coin_payment_revenue_raw = db.session.query(
        func.coalesce(func.sum(Payment.amount), 0)
    ).filter(
        Payment.status == "succeeded",
        Payment.plan.in_(("coin_purchase", "coins")),
    ).scalar() or 0

    payment_revenue = Decimal(str(payment_revenue_raw))
    coin_purchase_revenue = Decimal(int(coin_purchase_cents or 0)) / Decimal("100")
    coin_payment_revenue = Decimal(str(coin_payment_revenue_raw))
    missing_coin_revenue = max(coin_purchase_revenue - coin_payment_revenue, Decimal("0"))
    total_revenue = payment_revenue + missing_coin_revenue

    payment_rows = db.session.query(
        func.coalesce(Payment.plan, "otros").label("plan"),
        func.count(Payment.id).label("count"),
        func.coalesce(func.sum(Payment.amount), 0).label("total"),
    ).filter(
        Payment.status == "succeeded"
    ).group_by(
        func.coalesce(Payment.plan, "otros")
    ).order_by(
        func.coalesce(Payment.plan, "otros")
    ).all()

    payments_by_plan = [
        {
            "plan": row.plan or "otros",
            "count": int(row.count or 0),
            "total": float(row.total or 0),
        }
        for row in payment_rows
    ]

    coin_purchase_count = CoinPurchase.query.filter_by(status="paid").count()
    coin_payment_count = Payment.query.filter(
        Payment.status == "succeeded",
        Payment.plan.in_(("coin_purchase", "coins")),
    ).count()
    missing_coin_count = max(coin_purchase_count - coin_payment_count, 0)

    if missing_coin_count or missing_coin_revenue > 0:
        coin_row = next((row for row in payments_by_plan if row["plan"] in ("coin_purchase", "coins")), None)
        if coin_row:
            coin_row["count"] += missing_coin_count
            coin_row["total"] = round(float(Decimal(str(coin_row["total"])) + missing_coin_revenue), 2)
        else:
            payments_by_plan.append({
                "plan": "coin_purchase",
                "count": missing_coin_count,
                "total": float(missing_coin_revenue),
            })

    subscription_rows = db.session.query(
        Subscription.plan,
        Subscription.status,
        func.count(Subscription.id).label("count"),
    ).group_by(
        Subscription.plan,
        Subscription.status,
    ).order_by(
        Subscription.plan,
        Subscription.status,
    ).all()
    subscriptions_by_plan = [
        {"plan": row.plan or "free", "status": row.status or "unknown", "count": int(row.count or 0)}
        for row in subscription_rows
    ]

    user_rows = db.session.query(
        func.coalesce(UserModel.subscription, "free").label("plan"),
        func.count(UserModel.id).label("count"),
    ).group_by(
        func.coalesce(UserModel.subscription, "free")
    ).order_by(
        func.coalesce(UserModel.subscription, "free")
    ).all()
    users_by_plan = [
        {"plan": row.plan or "free", "count": int(row.count or 0)}
        for row in user_rows
    ]

    total_users = UserModel.query.count()
    pro_users = UserModel.query.filter_by(subscription="pro").count()
    succeeded_payment_count = Payment.query.filter_by(status="succeeded").count()
    failed_payments = Payment.query.filter_by(status="failed").count() + CoinPurchase.query.filter_by(status="failed").count()
    refunded_payments = Payment.query.filter_by(status="refunded").count()
    active_subscriptions = Subscription.query.filter(Subscription.status.in_(("active", "trialing"))).count()
    total_payment_count = succeeded_payment_count + missing_coin_count

    return jsonify({
        "total_revenue": float(total_revenue),
        "total_revenue_eur": float(total_revenue),
        "total_revenue_usd": float(total_revenue),
        "payment_count": int(total_payment_count),
        "succeeded_payments": int(total_payment_count),
        "failed_payments": int(failed_payments),
        "refunded_payments": int(refunded_payments),
        "active_subscriptions": int(active_subscriptions),
        "coin_purchase_count": int(coin_purchase_count),
        "coin_revenue_eur": float(coin_purchase_revenue),
        "payments_by_plan": payments_by_plan,
        "subscriptions_by_plan": subscriptions_by_plan,
        "users_by_plan": users_by_plan,
        "total_users": total_users,
        "pro_users": pro_users,
        "premium_users": 0,
    }), 200


@billing_bp.get("/admin/users/<int:user_id>")
@jwt_required()
def admin_user_subscription(user_id):
    user = _current_user()
    if not user or getattr(user, "role", None) != "admin":
        return jsonify({"error": "FORBIDDEN"}), 403
    from app.models.user import User as UserModel
    target = UserModel.query.get(user_id)
    if not target:
        return jsonify({"error": "NOT_FOUND"}), 404
    info = SubscriptionService.get_subscription_info(target)
    return jsonify(info), 200


@billing_bp.post("/admin/users/<int:user_id>/set-plan")
@jwt_required()
def admin_set_plan(user_id):
    user = _current_user()
    if not user or getattr(user, "role", None) != "admin":
        return jsonify({"error": "FORBIDDEN"}), 403
    from app.models.user import User as UserModel
    target = UserModel.query.get(user_id)
    if not target:
        return jsonify({"error": "NOT_FOUND"}), 404
    data = request.get_json(silent=True) or {}
    plan = normalize_plan(str(data.get("plan", "free")).strip().lower())
    if plan not in ("free", "pro"):
        return jsonify({"error": "BAD_REQUEST", "message": "Plan inválido"}), 400
    target.subscription = plan
    sub = Subscription(
        user_id=target.id, plan=plan, status="active",
        provider="manual", notes=f"Forzado por admin {user.id}",
    )
    db.session.add(sub)
    db.session.commit()
    return jsonify({"message": f"Plan {plan} asignado", "plan": plan}), 200


# ── Wallet payment endpoints ───────────────────────────────────────────────────

_PLAN_PRICES = {"pro": 9.99}


@billing_bp.post("/wallet/pay-subscription")
@jwt_required()
def wallet_pay_subscription():
    """
    Paga una suscripción mensual usando el saldo del wallet.
    Body: { "plan": "free" | "pro" }
    Devuelve 402 con shortfall si el saldo es insuficiente.
    """
    return jsonify({
        "error": "LEGACY_WALLET_DISABLED",
        "message": "Las suscripciones se pagan con Stripe Checkout o se gestionan desde el portal de billing.",
        "status": 410,
    }), 410

    user = _current_user()
    if not user:
        return jsonify({"error": "NOT_FOUND", "message": "Usuario no encontrado"}), 404

    data = request.get_json(silent=True) or {}
    plan = normalize_plan(str(data.get("plan") or "").strip().lower())
    if plan not in _PLAN_PRICES:
        return jsonify({"error": "BAD_REQUEST", "message": "El unico plan de pago disponible es PRO"}), 400

    price = _PLAN_PRICES[plan]
    balance = _wallet_topup_balance(user.id)
    currency = current_app.config.get("STRIPE_CURRENCY", "eur").upper()

    if balance < price:
        shortfall = round(price - balance, 2)
        return jsonify({
            "error": "INSUFFICIENT_BALANCE",
            "message": f"Saldo insuficiente. Necesitas {price:.2f} {currency}, tienes {balance:.2f} {currency}.",
            "balance": balance,
            "price": price,
            "shortfall": shortfall,
            "currency": currency,
        }), 402

    # Registrar gasto en el ledger del wallet
    import time as _time
    ext_id = f"wallet-sub-{plan}-{user.id}-{int(_time.time())}"
    spend = Payment(
        user_id=user.id,
        provider="wallet",
        amount=price,
        currency=currency,
        status="succeeded",
        plan="wallet_spend",
        external_payment_id=ext_id,
        description=f"Suscripción plan {plan.upper()} — {price:.2f} {currency}",
    )
    db.session.add(spend)

    # Crear registro de suscripción
    from datetime import timedelta
    period_start = _now()
    period_end = period_start + timedelta(days=30)
    sub = Subscription(
        user_id=user.id,
        plan=plan,
        status="active",
        provider="wallet",
        current_period_start=period_start,
        current_period_end=period_end,
        notes="Pagado desde wallet MyPredicts",
    )
    db.session.add(sub)
    user.subscription = plan
    db.session.commit()

    new_balance = _wallet_topup_balance(user.id)
    logger.info("Billing: suscripción %s activada desde wallet user=%s", plan, user.id)
    return jsonify({
        "message": f"Plan {plan.upper()} activado correctamente.",
        "plan": plan,
        "wallet_balance": new_balance,
        "currency": currency,
    }), 200
