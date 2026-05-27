"""
Blueprint de estrategias — Marketplace de estrategias de inversión/trading.

Endpoints:
  Creador / usuario autenticado:
    POST   /api/strategies                   — crear estrategia
    PATCH  /api/strategies/<id>              — editar estrategia
    GET    /api/strategies/mine              — mis estrategias creadas
    GET    /api/strategies/purchased         — estrategias compradas
    POST   /api/strategies/<id>/publish      — publicar en marketplace
    POST   /api/strategies/<id>/archive      — archivar
    POST   /api/strategies/<id>/metrics      — añadir/actualizar métricas backtest

  Marketplace (público / semipúblico):
    GET    /api/strategies/marketplace       — catálogo con filtros
    GET    /api/strategies/<id>              — detalle de estrategia
    POST   /api/strategies/<id>/purchase     — comprar / desbloquear
    GET    /api/strategies/<id>/reviews      — listar reseñas
    POST   /api/strategies/<id>/reviews      — añadir reseña
    PATCH  /api/strategies/<id>/reviews/<rid>— editar reseña

  Pagos (protegidos):
    POST   /api/strategies/<id>/payment/admin-confirm  — Admin confirma manualmente un pago
    POST   /api/strategies/webhook/payment             — Webhook externo (Stripe/etc.)
                                                         requiere header X-Webhook-Secret
    DELETE /api/strategies/<id>/reviews/<rid>— borrar reseña

  Admin:
    GET    /api/strategies/admin/list        — lista all strategies
    GET    /api/strategies/admin/stats       — estadísticas del marketplace
    PATCH  /api/strategies/<id>/admin/feature   — destacar / quitar destacado
    PATCH  /api/strategies/<id>/admin/moderate  — archivar/publicar/despublicar

Seguridad:
  - Rutas autenticadas usan @jwt_required()
  - Rutas admin usan @admin_required
  - Rutas de marketplace usan @optional_jwt (acceso parcial según rol)
"""

from flask import Blueprint, jsonify, request, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity, verify_jwt_in_request

from app.utils.decorators import admin_required, optional_jwt

strategies_bp = Blueprint("strategies", __name__)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _current_user():
    """Obtiene el usuario autenticado o None."""
    try:
        verify_jwt_in_request(optional=True)
        uid = get_jwt_identity()
        if uid:
            from app.models.user import User
            return User.query.get(int(uid))
    except Exception:
        pass
    return None


def _require_user():
    """Obtiene el usuario autenticado. Lanza 401 si no hay token."""
    from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity
    verify_jwt_in_request()
    from app.models.user import User
    return User.query.get(int(get_jwt_identity()))


def _configured(value: str | None) -> bool:
    if not value:
        return False
    upper = str(value).upper()
    return not any(marker in upper for marker in ("PENDIENTE", "TODO", "CHANGE_ME"))


def _frontend_url(path: str) -> str:
    import os
    base = os.environ.get("FRONTEND_URL") or "http://localhost:5173"
    return f"{base.rstrip('/')}/{path.lstrip('/')}"


def _wallet_balance(user_id: int) -> float:
    from sqlalchemy import func
    from app import db
    from app.models.billing import Payment

    topups = db.session.query(func.sum(Payment.amount)).filter_by(
        user_id=user_id,
        status="succeeded",
        plan="wallet_topup",
    ).scalar() or 0
    spends = db.session.query(func.sum(Payment.amount)).filter_by(
        user_id=user_id,
        status="succeeded",
        plan="wallet_spend",
    ).scalar() or 0
    return round(float(topups) - float(spends), 2)


def _wallet_spend(user_id: int, amount: float, description: str, external_id: str) -> None:
    from app import db
    from app.models.billing import Payment

    db.session.add(Payment(
        user_id=user_id,
        provider="wallet",
        amount=round(float(amount), 2),
        currency="EUR",
        status="succeeded",
        plan="wallet_spend",
        external_payment_id=external_id,
        description=description,
    ))


# ══════════════════════════════════════════════════════════════════════════════
# CREADOR — CRUD
# ══════════════════════════════════════════════════════════════════════════════

@strategies_bp.route("", methods=["POST"])
@jwt_required()
def create_strategy():
    """Crea una estrategia en borrador."""
    # mcajamar - 05/04/2026: dejé listo el backend de estrategias y la compra con monedas internas.
    user_id = int(get_jwt_identity())
    data    = request.get_json(silent=True) or {}

    from app.services.strategy_service import StrategyService
    result, err = StrategyService.create(user_id, data)
    if err:
        return jsonify({"error": "BAD_REQUEST", "message": err, "status": 400}), 400

    return jsonify(result), 201


@strategies_bp.route("/<int:strategy_id>", methods=["PATCH"])
@jwt_required()
def update_strategy(strategy_id):
    """Edita una estrategia existente (solo autor o admin)."""
    user_id = int(get_jwt_identity())
    data    = request.get_json(silent=True) or {}

    from app.services.strategy_service import StrategyService
    result, err = StrategyService.update(strategy_id, user_id, data)
    if err:
        status = 403 if "permisos" in err.lower() else 400
        return jsonify({"error": "ERROR", "message": err, "status": status}), status

    return jsonify(result), 200


@strategies_bp.route("/mine", methods=["GET"])
@jwt_required()
def get_my_strategies():
    """Lista mis estrategias creadas (todas o filtradas por status)."""
    user_id = int(get_jwt_identity())
    status  = request.args.get("status")

    from app.services.strategy_service import StrategyService
    return jsonify(StrategyService.get_mine(user_id, status)), 200


@strategies_bp.route("/purchased", methods=["GET"])
@jwt_required()
def get_purchased_strategies():
    """Lista las estrategias compradas por el usuario autenticado."""
    user_id = int(get_jwt_identity())

    from app.services.strategy_service import StrategyService
    return jsonify(StrategyService.get_purchased(user_id)), 200


@strategies_bp.route("/<int:strategy_id>/publish", methods=["POST"])
@jwt_required()
def publish_strategy(strategy_id):
    """Publica la estrategia en el marketplace."""
    from app.models.user import User
    from app.services.subscription_service import SubscriptionService
    from app.services.strategy_service import StrategyService

    user_id = int(get_jwt_identity())
    user    = User.query.get(user_id)

    from app.models.strategy import Strategy as StrategyModel
    strategy_obj = StrategyModel.query.filter_by(id=strategy_id, user_id=user_id).first()
    if strategy_obj and strategy_obj.is_paid and not SubscriptionService.can_use_feature(user, "can_sell_strategies"):
        return jsonify({
            "error": "PLAN_REQUIRED",
            "message": (
                "Vender estrategias de pago requiere el plan PRO. "
                "Puedes publicarla como estrategia gratuita o actualizar tu plan."
            ),
            "status": 403,
            "effective_plan": SubscriptionService.get_user_plan(user),
        }), 403

    result, err = StrategyService.publish(strategy_id, user_id)
    if err:
        status = 403 if "permisos" in err.lower() or "pro" in err.lower() else 400
        return jsonify({"error": "ERROR", "message": err, "status": status}), status

    return jsonify(result), 200


@strategies_bp.route("/<int:strategy_id>/archive", methods=["POST"])
@jwt_required()
def archive_strategy(strategy_id):
    """Archiva una estrategia."""
    user_id = int(get_jwt_identity())

    from app.services.strategy_service import StrategyService
    result, err = StrategyService.archive(strategy_id, user_id)
    if err:
        status = 403 if "permisos" in err.lower() else 400
        return jsonify({"error": "ERROR", "message": err, "status": status}), status

    return jsonify(result), 200


@strategies_bp.route("/<int:strategy_id>/metrics", methods=["POST"])
@jwt_required()
def upsert_metrics(strategy_id):
    """Crea o actualiza las métricas de backtest de la estrategia."""
    user_id = int(get_jwt_identity())
    data    = request.get_json(silent=True) or {}

    from app.services.strategy_service import StrategyService
    result, err = StrategyService.upsert_metrics(strategy_id, user_id, data)
    if err:
        status = 403 if "permisos" in err.lower() else 400
        return jsonify({"error": "ERROR", "message": err, "status": status}), status

    return jsonify(result), 200


# ══════════════════════════════════════════════════════════════════════════════
# MARKETPLACE — PÚBLICO / SEMIPÚBLICO
# ══════════════════════════════════════════════════════════════════════════════

@strategies_bp.route("/marketplace", methods=["GET"])
@optional_jwt
def get_marketplace():
    """
    Catálogo público del marketplace.

    Query params:
      page, per_page, category, is_paid (true/false), min_rating,
      max_price, search, sort (recent|top_sales|best_rating|featured|best_return|price_asc|price_desc),
      featured_only (true/false)
    """
    page     = int(request.args.get("page", 1))
    per_page = min(int(request.args.get("per_page", 20)), 100)
    sort     = request.args.get("sort", "recent")
    search   = request.args.get("search", "").strip() or None
    category = request.args.get("category") or None

    is_paid_raw = request.args.get("is_paid")
    is_paid = None
    if is_paid_raw == "true":
        is_paid = True
    elif is_paid_raw == "false":
        is_paid = False

    min_rating_raw = request.args.get("min_rating")
    min_rating = float(min_rating_raw) if min_rating_raw else None

    max_price_raw = request.args.get("max_price")
    max_price = float(max_price_raw) if max_price_raw else None

    featured_only = request.args.get("featured_only", "false").lower() == "true"
    viewer = _current_user()

    from app.services.strategy_service import StrategyService
    result = StrategyService.get_marketplace(
        page=page, per_page=per_page, category=category,
        is_paid=is_paid, min_rating=min_rating, max_price=max_price,
        search=search, sort=sort, featured_only=featured_only,
        viewer=viewer,
    )
    return jsonify(result), 200


@strategies_bp.route("/<int:strategy_id>", methods=["GET"])
@optional_jwt
def get_strategy(strategy_id):
    """Detalle de una estrategia. Las reglas solo se devuelven si el viewer tiene acceso."""
    viewer = _current_user()

    from app.services.strategy_service import StrategyService
    result, err = StrategyService.get_strategy_public(strategy_id, viewer)
    if err:
        return jsonify({"error": "NOT_FOUND", "message": err, "status": 404}), 404

    return jsonify(result), 200


@strategies_bp.route("/<int:strategy_id>/purchase", methods=["POST"])
@jwt_required()
def purchase_strategy(strategy_id):
    """
    Compra / desbloquea una estrategia.
    Para estrategias gratuitas: acceso inmediato.
    Para estrategias de pago: crea intento de compra (pending) listo para pasarela.
    """
    buyer_id = int(get_jwt_identity())

    from app.services.strategy_service import StrategyService
    result, err = StrategyService.purchase_with_internal_coins(strategy_id, buyer_id)
    if err:
        error_code = result.get("error_code") if isinstance(result, dict) else None
        if error_code == "INSUFFICIENT_COINS":
            return jsonify({"error": error_code, "message": err, "status": 402, **result}), 402
        status_map = {
            "no puedes comprar tu propia": 403,
            "ya tienes acceso":            409,
            "no está disponible":          404,
        }
        status = 400
        for k, v in status_map.items():
            if k in (err or "").lower():
                status = v
                break
        return jsonify({"error": error_code or "ERROR", "message": err, "status": status, **(result if isinstance(result, dict) else {})}), status

    strategy_data, _ = StrategyService.get_strategy_public(strategy_id, _current_user())
    return jsonify({"unlocked": True, "purchase": result, "strategy": strategy_data}), 200


@strategies_bp.route("/<int:strategy_id>/checkout", methods=["POST"])
@jwt_required()
def create_strategy_checkout(strategy_id):
    """Crea Checkout de Stripe para comprar una estrategia de pago."""
    return jsonify({
        "error": "STRATEGY_STRIPE_DISABLED",
        "message": "Las estrategias se compran con monedas internas. Compra monedas en /coins/buy.",
        "status": 410,
    }), 410

    stripe_key = current_app.config.get("STRIPE_SECRET_KEY", "")
    if not _configured(stripe_key):
        return jsonify({
            "error": "STRIPE_NOT_CONFIGURED",
            "message": "Falta STRIPE_SECRET_KEY valida en backend/.env.",
        }), 503

    buyer_id = int(get_jwt_identity())

    from app import db
    from app.models.strategy import Strategy, StrategyPurchase
    from app.models.user import User
    from app.services.strategy_service import StrategyService
    from app.services.subscription_service import SubscriptionService

    buyer = User.query.get(buyer_id)
    strategy = Strategy.query.get(strategy_id)
    if not buyer:
        return jsonify({"error": "NOT_FOUND", "message": "Usuario no encontrado"}), 404
    if not strategy:
        return jsonify({"error": "NOT_FOUND", "message": "Estrategia no encontrada"}), 404

    purchase, err = StrategyService.purchase(strategy_id, buyer_id)
    if err:
        status = 409 if "ya tienes acceso" in err.lower() else 400
        return jsonify({"error": "ERROR", "message": err}), status

    if purchase.get("payment_status") == "completed":
        return jsonify({"already_unlocked": True, "purchase": purchase}), 200

    try:
        import stripe
        stripe.api_key = stripe_key
        customer_id = SubscriptionService.get_or_create_stripe_customer(buyer)
        currency = (strategy.currency or current_app.config.get("STRIPE_CURRENCY", "eur")).lower()
        amount_cents = int(round(float(strategy.price or 0) * 100))
        if amount_cents <= 0:
            result, err = StrategyService.confirm_payment(strategy_id, buyer_id, "free-checkout", "internal")
            if err:
                return jsonify({"error": "ERROR", "message": err}), 400
            return jsonify({"already_unlocked": True, "purchase": result}), 200

        session_params = {
            "mode": "payment",
            "line_items": [{
                "price_data": {
                    "currency": currency,
                    "unit_amount": amount_cents,
                    "product_data": {
                        "name": f"Estrategia MyPredicts: {strategy.name}",
                        "metadata": {"type": "strategy_purchase", "strategy_id": str(strategy.id)},
                    },
                },
                "quantity": 1,
            }],
            "success_url": _frontend_url(f"/marketplace/{strategy.id}?success=1&session_id={{CHECKOUT_SESSION_ID}}"),
            "cancel_url": _frontend_url(f"/marketplace/{strategy.id}?canceled=1"),
            "metadata": {
                "type": "strategy_purchase",
                "user_id": str(buyer_id),
                "buyer_id": str(buyer_id),
                "strategy_id": str(strategy.id),
                "purchase_id": str(purchase.get("id")),
            },
            "payment_intent_data": {
                "metadata": {
                    "type": "strategy_purchase",
                    "user_id": str(buyer_id),
                    "buyer_id": str(buyer_id),
                    "strategy_id": str(strategy.id),
                },
            },
        }
        if customer_id:
            session_params["customer"] = customer_id
        else:
            session_params["customer_email"] = buyer.email

        checkout_session = stripe.checkout.Session.create(**session_params)

        pending = StrategyPurchase.query.get(purchase.get("id"))
        if pending:
            pending.payment_provider = "stripe_checkout"
            pending.external_payment_id = checkout_session.id
            db.session.commit()

        return jsonify({
            "checkout_url": checkout_session.url,
            "session_id": checkout_session.id,
            "purchase": purchase,
        }), 200

    except Exception as exc:
        current_app.logger.error("Strategies: error creando checkout de estrategia: %s", exc)
        db.session.rollback()
        return jsonify({"error": "STRIPE_ERROR", "message": str(exc)}), 500


@strategies_bp.route("/checkout/sync", methods=["POST"])
@jwt_required()
def sync_strategy_checkout():
    """Sincroniza una compra de estrategia completada al volver de Stripe."""
    return jsonify({
        "error": "STRATEGY_STRIPE_DISABLED",
        "message": "La sincronizacion Stripe de estrategias esta desactivada. Usa monedas internas.",
        "status": 410,
    }), 410

    stripe_key = current_app.config.get("STRIPE_SECRET_KEY", "")
    if not _configured(stripe_key):
        return jsonify({
            "error": "STRIPE_NOT_CONFIGURED",
            "message": "Falta STRIPE_SECRET_KEY valida en backend/.env.",
        }), 503

    data = request.get_json(silent=True) or {}
    session_id = (data.get("session_id") or "").strip()
    if not session_id.startswith("cs_"):
        return jsonify({"error": "BAD_REQUEST", "message": "session_id invalido"}), 400

    buyer_id = int(get_jwt_identity())

    try:
        import stripe
        stripe.api_key = stripe_key
        checkout_session = stripe.checkout.Session.retrieve(session_id)
        metadata = checkout_session.get("metadata", {}) or {}

        if metadata.get("type") != "strategy_purchase":
            return jsonify({"error": "BAD_REQUEST", "message": "La sesion no corresponde a una estrategia."}), 400
        if str(metadata.get("buyer_id") or metadata.get("user_id") or "") != str(buyer_id):
            return jsonify({"error": "FORBIDDEN", "message": "La sesion no pertenece al usuario actual."}), 403
        if checkout_session.get("payment_status") != "paid":
            return jsonify({"error": "PAYMENT_NOT_COMPLETED", "message": "El pago todavia no esta completado."}), 409

        from app.services.strategy_service import StrategyService
        strategy_id = int(metadata.get("strategy_id"))
        external_id = checkout_session.get("payment_intent") or checkout_session.get("id")
        purchase, err = StrategyService.confirm_payment(strategy_id, buyer_id, external_id, "stripe")
        if err:
            return jsonify({"error": "ERROR", "message": err}), 400

        viewer = _current_user()
        strategy, _ = StrategyService.get_strategy_public(strategy_id, viewer)
        return jsonify({
            "message": "Estrategia desbloqueada correctamente.",
            "purchase": purchase,
            "strategy": strategy,
        }), 200

    except Exception as exc:
        current_app.logger.error("Strategies: error sincronizando checkout %s: %s", session_id, exc)
        return jsonify({"error": "STRIPE_ERROR", "message": str(exc)}), 500


@strategies_bp.route("/<int:strategy_id>/payment/admin-confirm", methods=["POST"])
@admin_required
def admin_confirm_payment(strategy_id):
    """
    Confirmación manual de pago por parte de un administrador.
    Solo accesible con role='admin'. Útil para confirmar pagos manualmente
    durante el desarrollo o cuando la pasarela aún no está integrada.

    Body: { buyer_id, external_payment_id, provider }
    """
    data     = request.get_json(silent=True) or {}
    buyer_id = data.get("buyer_id")

    if not buyer_id:
        return jsonify({"error": "BAD_REQUEST", "message": "Se requiere buyer_id", "status": 400}), 400

    from app.services.strategy_service import StrategyService
    result, err = StrategyService.confirm_payment(
        strategy_id, int(buyer_id),
        external_payment_id=data.get("external_payment_id", "admin-manual"),
        provider=data.get("provider", "manual"),
    )
    if err:
        return jsonify({"error": "ERROR", "message": err, "status": 400}), 400

    return jsonify(result), 200


@strategies_bp.route("/webhook/payment", methods=["POST"])
def webhook_payment():
    """
    Endpoint para webhooks de pasarelas de pago externas (Stripe, PayPal, etc.).

    Seguridad: valida el header 'X-Webhook-Secret' contra la variable de entorno
    WEBHOOK_PAYMENT_SECRET. Si no coincide, rechaza con 403.

    Body esperado (shape común para Stripe/PayPal adaptado):
    {
        "strategy_id": 1,
        "buyer_id": 42,
        "external_payment_id": "pi_3abc...",
        "provider": "stripe",
        "event": "payment_intent.succeeded"
    }

    NOTA: Esta es la forma correcta de confirmar pagos de forma automatizada.
    El endpoint /payment/admin-confirm es solo para uso manual de administradores.
    Para integrar Stripe real: validar 'Stripe-Signature' con stripe.webhook.construct_event().
    """
    return jsonify({
        "error": "STRATEGY_EXTERNAL_PAYMENTS_DISABLED",
        "message": "Las estrategias se desbloquean con monedas internas. Stripe queda reservado para monedas, suscripciones y billing.",
        "status": 410,
    }), 410

    import os
    from flask import current_app

    # ── Validar shared secret ──────────────────────────────────────────────
    expected_secret = os.environ.get("WEBHOOK_PAYMENT_SECRET", "")
    provided_secret = request.headers.get("X-Webhook-Secret", "")

    if not expected_secret:
        # Si no hay secret configurado, el webhook está deshabilitado
        current_app.logger.warning("Webhook /payment llamado pero WEBHOOK_PAYMENT_SECRET no configurado")
        return jsonify({"error": "WEBHOOK_DISABLED", "message": "Webhook no configurado", "status": 503}), 503

    if not provided_secret or provided_secret != expected_secret:
        current_app.logger.warning("Webhook /payment: secret inválido desde %s", request.remote_addr)
        return jsonify({"error": "FORBIDDEN", "message": "Secret inválido", "status": 403}), 403

    # ── Procesar evento ────────────────────────────────────────────────────
    data       = request.get_json(silent=True) or {}
    strategy_id_raw  = data.get("strategy_id")
    buyer_id_raw     = data.get("buyer_id")
    external_id      = data.get("external_payment_id", "")
    provider         = data.get("provider", "stripe")
    event            = data.get("event", "")

    if event not in ("payment_intent.succeeded", "charge.succeeded", "payment.captured"):
        return jsonify({"status": "ignored", "event": event}), 200

    if not strategy_id_raw or not buyer_id_raw:
        return jsonify({"error": "BAD_REQUEST", "message": "strategy_id y buyer_id requeridos"}), 400

    from app.services.strategy_service import StrategyService
    result, err = StrategyService.confirm_payment(
        int(strategy_id_raw), int(buyer_id_raw),
        external_payment_id=external_id, provider=provider,
    )
    if err:
        return jsonify({"error": "ERROR", "message": err}), 400

    return jsonify({"status": "ok", "purchase": result}), 200


# ══════════════════════════════════════════════════════════════════════════════
# WALLET — COMPRA DESDE SALDO DE WALLET
# ══════════════════════════════════════════════════════════════════════════════

@strategies_bp.route("/<int:strategy_id>/pay-from-wallet", methods=["POST"])
@jwt_required()
def pay_strategy_from_wallet(strategy_id):
    """
    Compra una estrategia usando el saldo del wallet MyPredicts.
    Si el saldo es insuficiente devuelve 402 con el shortfall.
    """
    from app.services.strategy_service import StrategyService

    result, err = StrategyService.purchase_with_internal_coins(strategy_id, int(get_jwt_identity()))
    if err:
        error_code = result.get("error_code") if isinstance(result, dict) else None
        status = 402 if error_code == "INSUFFICIENT_COINS" else 400
        return jsonify({"error": error_code or "ERROR", "message": err, "status": status, **(result if isinstance(result, dict) else {})}), status
    strategy_data, _ = StrategyService.get_strategy_public(strategy_id, _current_user())
    return jsonify({"unlocked": True, "purchase": result, "strategy": strategy_data}), 200

    import time as _time
    from app import db
    from app.models.strategy import Strategy
    from app.models.user import User
    from app.models.billing import Payment
    from app.services.strategy_service import StrategyService
    from app.routes.billing import _wallet_topup_balance

    buyer_id = int(get_jwt_identity())
    buyer = User.query.get(buyer_id)
    strategy = Strategy.query.get(strategy_id)

    if not buyer:
        return jsonify({"error": "NOT_FOUND", "message": "Usuario no encontrado"}), 404
    if not strategy:
        return jsonify({"error": "NOT_FOUND", "message": "Estrategia no encontrada"}), 404

    price = float(strategy.price or 0)

    # Estrategia gratuita: desbloquear directamente
    if price <= 0:
        purchase, err = StrategyService.purchase(strategy_id, buyer_id)
        if err and "ya tienes" not in (err or "").lower():
            return jsonify({"error": "ERROR", "message": err}), 400
        result, err2 = StrategyService.confirm_payment(strategy_id, buyer_id, "free-wallet", "wallet")
        return jsonify({"unlocked": True, "purchase": result or purchase}), 200

    # Verificar saldo
    balance = _wallet_topup_balance(buyer_id)
    currency = (strategy.currency or current_app.config.get("STRIPE_CURRENCY", "eur")).upper()

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

    # Crear registro de compra pendiente
    purchase, err = StrategyService.purchase(strategy_id, buyer_id)
    if err:
        if "ya tienes" in (err or "").lower():
            return jsonify({"already_unlocked": True}), 200
        return jsonify({"error": "ERROR", "message": err}), 400

    if purchase.get("payment_status") == "completed":
        return jsonify({"already_unlocked": True, "purchase": purchase}), 200

    # Registrar gasto en ledger del wallet
    ext_id = f"wallet-strat-{strategy_id}-{buyer_id}-{int(_time.time())}"
    spend = Payment(
        user_id=buyer_id,
        provider="wallet",
        amount=price,
        currency=currency,
        status="succeeded",
        plan="wallet_spend",
        external_payment_id=ext_id,
        description=f"Compra estrategia #{strategy_id} «{strategy.name}» — {price:.2f} {currency}",
    )
    db.session.add(spend)

    # Confirmar compra
    result, err2 = StrategyService.confirm_payment(strategy_id, buyer_id, ext_id, "wallet")
    if err2:
        db.session.rollback()
        return jsonify({"error": "ERROR", "message": err2}), 400

    db.session.commit()
    current_app.logger.info("Strategies: compra wallet strategy=%s buyer=%s", strategy_id, buyer_id)
    return jsonify({
        "unlocked": True,
        "purchase": result,
        "wallet_balance": _wallet_topup_balance(buyer_id),
    }), 200


# ══════════════════════════════════════════════════════════════════════════════
# COPY TO PREDICTIONS — Copiar estrategia como predicciones ML reales
# ══════════════════════════════════════════════════════════════════════════════

@strategies_bp.route("/<int:strategy_id>/copy-to-predictions", methods=["POST"])
@jwt_required()
def copy_strategy_to_predictions(strategy_id):
    """
    Copia una estrategia comprada generando predicciones ML reales para el ticker
    de la estrategia. Todas las predicciones son generadas por Prophet/ARIMA/SMA;
    no se insertan valores falsos ni automáticos.

    Body (todos opcionales):
      ticker         — ticker a predecir (default: ticker de la estrategia)
      models         — lista de modelos: ["prophet", "arima", "sma"] (default: todos)
      horizon_days   — días de horizonte 1-60 (default: 20)
      historical_days — días de histórico 90-3650 (default: 1825)
    """
    from app import db
    from app.models.strategy import Strategy, StrategyPurchase
    from app.models.prediction import Prediction
    from app.services.ml_service import MLService
    from app.routes.billing import _wallet_topup_balance

    buyer_id = int(get_jwt_identity())

    strategy = Strategy.query.get(strategy_id)
    if not strategy:
        return jsonify({"error": "NOT_FOUND", "message": "Estrategia no encontrada"}), 404

    # rumarrcc: acceso por compra confirmada, autor, admin o estrategia gratuita.
    if strategy.is_paid and strategy.user_id != buyer_id:
        purchase = StrategyPurchase.query.filter_by(
            strategy_id=strategy_id,
            buyer_id=buyer_id,
            payment_status="completed",
        ).first()
        if not purchase:
            return jsonify({
                "error": "FORBIDDEN",
                "message": "Debes comprar la estrategia antes de copiarla a tus predicciones.",
            }), 403

    data = request.get_json(silent=True) or {}
    default_ticker = ((strategy.target_tickers or "").split(",")[0] or "AAPL").strip().upper()
    ticker = (data.get("ticker") or default_ticker).strip().upper()
    horizon_days = max(1, min(60, int(data.get("horizon_days", 20))))
    historical_days = max(90, min(3650, int(data.get("historical_days", 1825))))

    requested_models = data.get("models") or ["prophet", "arima", "sma"]
    valid_models = {"prophet", "arima", "sma"}
    requested_models = [m for m in requested_models if m in valid_models] or ["prophet", "arima", "sma"]

    # ── Generar predicciones ML reales ────────────────────────────────────
    try:
        ml_result = MLService.predict_all(ticker, horizon_days=horizon_days, historical_days=historical_days)
    except ValueError as exc:
        return jsonify({"error": "TICKER_ERROR", "message": str(exc)}), 404
    except Exception as exc:
        current_app.logger.error("copy-to-predictions ML error: %s", exc)
        return jsonify({"error": "ML_ERROR", "message": f"Error ejecutando modelos ML: {exc}"}), 500

    # ── Calcular siguiente group_id ───────────────────────────────────────
    from sqlalchemy import func
    max_gid = db.session.query(func.max(Prediction.prediction_group_id)).scalar() or 0
    group_id = max_gid + 1

    saved = 0
    from datetime import date as _date
    for model_data in ml_result.get("models", []):
        model_name = model_data.get("name")
        if model_name not in requested_models:
            continue
        if model_data.get("error") or not model_data.get("predictions"):
            continue
        metrics = model_data.get("metrics", {})

        for pred_point in model_data["predictions"]:
            try:
                pred_date = _date.fromisoformat(pred_point["date"])
            except Exception:
                continue
            p = Prediction(
                user_id=buyer_id,
                ticker=ticker,
                model_type=model_name,
                prediction_date=pred_date,
                predicted_price=pred_point.get("predicted_price"),
                confidence_interval_low=pred_point.get("lower_bound"),
                confidence_interval_high=pred_point.get("upper_bound"),
                confidence_level=pred_point.get("confidence_level", 0.95),
                horizon_days=horizon_days,
                mae=metrics.get("mae"),
                rmse=metrics.get("rmse"),
                mape=metrics.get("mape"),
                training_samples=metrics.get("training_samples"),
                prediction_group_id=group_id,
                historical_days=historical_days,
                model_params={"source": "strategy_copy", "strategy_id": strategy_id},
            )
            db.session.add(p)
            saved += 1

    if saved == 0:
        return jsonify({
            "error": "NO_PREDICTIONS",
            "message": "Los modelos ML no generaron predicciones. Verifica que el ticker sea válido y tenga datos suficientes.",
        }), 422

    db.session.commit()
    current_app.logger.info(
        "copy-to-predictions: user=%s strategy=%s ticker=%s saved=%d group=%d",
        buyer_id, strategy_id, ticker, saved, group_id,
    )
    return jsonify({
        "message": f"Predicciones ML generadas correctamente. {saved} puntos guardados.",
        "ticker": ticker,
        "group_id": group_id,
        "saved": saved,
        "models_used": requested_models,
        "horizon_days": horizon_days,
        "disclaimer": "Estas predicciones son generadas por modelos ML (Prophet/ARIMA/SMA). No constituyen asesoramiento financiero.",
    }), 201


@strategies_bp.route("/<int:strategy_id>/copy-to-investments", methods=["POST"])
@jwt_required()
def copy_strategy_to_investments(strategy_id):
    """
    Copia una estrategia desbloqueada a la cartera virtual del usuario.
    """
    from datetime import date as _date

    from app import db
    from app.models.portfolio import PortfolioPosition, VirtualPortfolio
    from app.models.strategy import Strategy, StrategyPurchase
    from app.services.data_service import DataService
    from app.utils.helpers import validate_ticker

    buyer_id = int(get_jwt_identity())
    strategy = Strategy.query.get(strategy_id)
    if not strategy:
        return jsonify({"error": "NOT_FOUND", "message": "Estrategia no encontrada"}), 404

    if strategy.is_paid and strategy.user_id != buyer_id:
        purchase = StrategyPurchase.query.filter_by(
            strategy_id=strategy_id,
            buyer_id=buyer_id,
            payment_status="completed",
        ).first()
        if not purchase:
            return jsonify({
                "error": "FORBIDDEN",
                "message": "Debes comprar la estrategia antes de añadirla a tus inversiones.",
            }), 403

    data = request.get_json(silent=True) or {}
    default_ticker = ((strategy.target_tickers or "").split(",")[0] or "AAPL").strip().upper()
    ticker = (data.get("ticker") or default_ticker).strip().upper()
    if not validate_ticker(ticker):
        return jsonify({"error": "BAD_REQUEST", "message": "Ticker inválido"}), 400

    try:
        quantity = float(data.get("quantity", 1))
    except (TypeError, ValueError):
        quantity = 1.0
    if quantity <= 0:
        return jsonify({"error": "BAD_REQUEST", "message": "La cantidad debe ser positiva"}), 400

    portfolio = None
    portfolio_id = data.get("portfolio_id")
    if portfolio_id:
        portfolio = VirtualPortfolio.query.filter_by(id=int(portfolio_id), user_id=buyer_id).first()
        if not portfolio:
            return jsonify({"error": "NOT_FOUND", "message": "Portfolio no encontrado"}), 404
        if portfolio.is_investment_wallet:
            return jsonify({
                "error": "BAD_REQUEST",
                "message": "Selecciona una cartera virtual para copiar esta predicción.",
            }), 400
    if not portfolio:
        portfolio = (
            VirtualPortfolio.query
            .filter(VirtualPortfolio.user_id == buyer_id)
            .filter(db.func.lower(VirtualPortfolio.name).in_(["cartera virtual", "mis inversiones", "portfolio " + "demo"]))
            .first()
        )
    if not portfolio:
        portfolio = VirtualPortfolio(
            user_id=buyer_id,
            name="Cartera virtual",
            initial_capital=100000,
            current_value=100000,
            total_return=0,
        )
        db.session.add(portfolio)
        db.session.flush()
    elif float(portfolio.initial_capital or 0) <= 0:
        portfolio.initial_capital = 100000

    buy_price = data.get("buy_price")
    try:
        buy_price = float(buy_price) if buy_price is not None else None
    except (TypeError, ValueError):
        buy_price = None
    current_price = buy_price

    if not current_price:
        try:
            stock = DataService.get_stock_data(ticker, days=5)
            current_price = float(stock.get("last_price") or stock.get("current_price") or 0)
        except Exception as exc:
            current_app.logger.warning("copy-to-investments price fallback ticker=%s: %s", ticker, exc)
            current_price = 0
    if current_price <= 0:
        current_price = 1.0
    if buy_price is None:
        buy_price = current_price

    position = PortfolioPosition(
        portfolio_id=portfolio.id,
        ticker=ticker,
        quantity=quantity,
        buy_price=buy_price,
        buy_date=_date.today(),
        current_price=current_price,
        source_type="strategy",
        source_id=strategy.id,
        source_label=f"Estrategia {strategy.name}",
        source_note=f"Compra aplicada desde marketplace: {strategy.name}",
    )
    position.recalculate()
    db.session.add(position)
    db.session.flush()

    positions = list(portfolio.positions)
    invested = sum(float(p.buy_price or 0) * float(p.quantity or 0) for p in positions)
    total_current = sum(float(p.current_price or p.buy_price or 0) * float(p.quantity or 0) for p in positions)
    cash = float(portfolio.initial_capital or 0) - invested
    portfolio.current_value = total_current + max(0, cash)
    initial_capital = float(portfolio.initial_capital or 1)
    portfolio.total_return = ((float(portfolio.current_value or 0) - initial_capital) / initial_capital)

    try:
        from app.services.gamification_service import GamificationService
        GamificationService.track_activity(buyer_id, "portfolio_updated", "strategy", strategy_id)
    except Exception:
        pass

    db.session.commit()
    return jsonify({
        "message": "Predicción copiada a la cartera virtual.",
        "portfolio": portfolio.to_dict(include_positions=True),
        "position": position.to_dict(),
    }), 201


@strategies_bp.route("/<int:strategy_id>/reviews", methods=["GET"])
def list_strategy_reviews(strategy_id):
    from app.models.strategy import Strategy, StrategyReview

    strategy = Strategy.query.get(strategy_id)
    if not strategy:
        return jsonify({"error": "NOT_FOUND", "message": "Estrategia no encontrada"}), 404

    reviews = (
        StrategyReview.query
        .filter_by(strategy_id=strategy_id)
        .order_by(StrategyReview.created_at.desc())
        .all()
    )
    return jsonify([r.to_dict() for r in reviews]), 200


@strategies_bp.route("/<int:strategy_id>/reviews", methods=["POST"])
@jwt_required()
def create_strategy_review(strategy_id):
    from sqlalchemy.exc import IntegrityError

    from app import db
    from app.models.strategy import Strategy, StrategyPurchase, StrategyReview

    user_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}
    strategy = Strategy.query.get(strategy_id)
    if not strategy:
        return jsonify({"error": "NOT_FOUND", "message": "Estrategia no encontrada"}), 404
    if strategy.user_id == user_id:
        return jsonify({"error": "FORBIDDEN", "message": "No puedes valorar tu propia estrategia"}), 403

    purchase = StrategyPurchase.query.filter_by(
        strategy_id=strategy_id,
        buyer_id=user_id,
        payment_status="completed",
    ).first()
    if strategy.is_paid and not purchase:
        return jsonify({"error": "FORBIDDEN", "message": "Debes comprar la estrategia antes de publicar una review"}), 403

    try:
        rating = int(data.get("rating"))
    except (TypeError, ValueError):
        rating = 0
    if rating < 1 or rating > 5:
        return jsonify({"error": "BAD_REQUEST", "message": "La valoración debe estar entre 1 y 5"}), 400

    comment = (data.get("comment") or "").strip()
    review = StrategyReview.query.filter_by(strategy_id=strategy_id, user_id=user_id).first()
    if review:
        review.rating = rating
        review.comment = comment
    else:
        review = StrategyReview(
            strategy_id=strategy_id,
            user_id=user_id,
            rating=rating,
            comment=comment,
        )
        db.session.add(review)

    try:
        db.session.flush()
        _recalculate_strategy_rating(strategy)
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({"error": "CONFLICT", "message": "Ya existe una review para esta estrategia"}), 409

    return jsonify(review.to_dict()), 201


@strategies_bp.route("/<int:strategy_id>/reviews/<int:review_id>", methods=["PATCH"])
@jwt_required()
def update_strategy_review(strategy_id, review_id):
    from app import db
    from app.models.strategy import Strategy, StrategyReview

    user_id = int(get_jwt_identity())
    strategy = Strategy.query.get(strategy_id)
    review = StrategyReview.query.filter_by(id=review_id, strategy_id=strategy_id).first()
    if not strategy or not review:
        return jsonify({"error": "NOT_FOUND", "message": "Review no encontrada"}), 404
    if review.user_id != user_id:
        return jsonify({"error": "FORBIDDEN", "message": "No puedes editar esta review"}), 403

    data = request.get_json(silent=True) or {}
    if "rating" in data:
        try:
            rating = int(data.get("rating"))
        except (TypeError, ValueError):
            rating = 0
        if rating < 1 or rating > 5:
            return jsonify({"error": "BAD_REQUEST", "message": "La valoración debe estar entre 1 y 5"}), 400
        review.rating = rating
    if "comment" in data:
        review.comment = (data.get("comment") or "").strip()

    _recalculate_strategy_rating(strategy)
    db.session.commit()
    return jsonify(review.to_dict()), 200


@strategies_bp.route("/<int:strategy_id>/reviews/<int:review_id>", methods=["DELETE"])
@jwt_required()
def delete_strategy_review(strategy_id, review_id):
    from app import db
    from app.models.strategy import Strategy, StrategyReview

    user_id = int(get_jwt_identity())
    strategy = Strategy.query.get(strategy_id)
    review = StrategyReview.query.filter_by(id=review_id, strategy_id=strategy_id).first()
    if not strategy or not review:
        return jsonify({"error": "NOT_FOUND", "message": "Review no encontrada"}), 404
    if review.user_id != user_id:
        return jsonify({"error": "FORBIDDEN", "message": "No puedes borrar esta review"}), 403

    db.session.delete(review)
    db.session.flush()
    _recalculate_strategy_rating(strategy)
    db.session.commit()
    return jsonify({"message": "Review eliminada"}), 200


def _recalculate_strategy_rating(strategy) -> None:
    from sqlalchemy import func

    from app import db
    from app.models.strategy import StrategyReview

    avg_rating, count = (
        db.session.query(func.avg(StrategyReview.rating), func.count(StrategyReview.id))
        .filter(StrategyReview.strategy_id == strategy.id)
        .one()
    )
    strategy.average_rating = round(float(avg_rating), 2) if avg_rating is not None else None
    strategy.reviews_count = int(count or 0)
