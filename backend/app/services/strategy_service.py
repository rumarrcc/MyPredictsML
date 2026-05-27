"""
StrategyService — lógica de negocio del Marketplace de Estrategias.

Responsabilidades:
  - Crear / editar / publicar / archivar estrategias
  - Catálogo público con filtros, caché Redis y paginación
  - Compra/desbloqueo con cálculo de comisión (backend authoritative)
  - Reviews con restricciones de elegibilidad
  - Integración con GamificationService
  - Caché Redis (con fallback en memoria) para el marketplace

Reglas de negocio:
  - Solo usuarios PRO pueden publicar en marketplace con precio > 0
  - Usuarios FREE pueden ver catálogo limitado (sin reglas completas)
  - No se puede comprar la propia estrategia
  - No se puede comprar dos veces la misma estrategia
  - Solo compradores pueden escribir reseñas
  - 1 reseña por usuario por estrategia
  - Comisión: 20% plataforma (PLATFORM_FEE_PCT)
"""
from __future__ import annotations

import json
import logging
import re
import time
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

# ── Caché ─────────────────────────────────────────────────────────────────────
_mem_cache: dict[str, tuple[float, str]] = {}
CACHE_TTL  = 300          # 5 min
_MKTPLACE_KEY = "marketplace:catalog:{page}:{filters_hash}"
_FEATURED_KEY = "marketplace:featured"
_TOP_KEY      = "marketplace:top_sales"


def _hash_filters(d: dict) -> str:
    return str(hash(json.dumps(d, sort_keys=True)))


def _cache_get(key: str) -> Optional[str]:
    try:
        from app import redis_client
        if redis_client:
            return redis_client.get(key)
    except Exception:
        pass
    entry = _mem_cache.get(key)
    if entry and entry[0] > time.time():
        return entry[1]
    _mem_cache.pop(key, None)
    return None


def _cache_set(key: str, value: str, ttl: int = CACHE_TTL) -> None:
    try:
        from app import redis_client
        if redis_client:
            redis_client.setex(key, ttl, value)
            return
    except Exception:
        pass
    _mem_cache[key] = (time.time() + ttl, value)


def _cache_del(pattern: str) -> None:
    try:
        from app import redis_client
        if redis_client:
            keys = redis_client.keys(pattern)
            if keys:
                redis_client.delete(*keys)
            return
    except Exception:
        pass
    prefix = pattern.replace("*", "")
    for k in list(_mem_cache.keys()):
        if k.startswith(prefix):
            _mem_cache.pop(k, None)


def _invalidate_marketplace():
    """Invalida todo el caché del marketplace."""
    _cache_del("marketplace:*")


# ── Helpers ───────────────────────────────────────────────────────────────────

def _slugify(text: str, strategy_id: int | None = None) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_-]+", "-", text)
    slug = text[:80]
    if strategy_id:
        slug = f"{slug}-{strategy_id}"
    return slug


def _validate_rules_json(rules: dict) -> tuple[bool, str]:
    """
    Valida la estructura de rules_json.
    Devuelve (True, "") si válido o (False, mensaje_error).
    """
    required = ["entry_rules", "exit_rules", "timeframe"]
    for field in required:
        if field not in rules:
            return False, f"rules_json debe contener el campo '{field}'"

    entry = rules.get("entry_rules", [])
    exit_ = rules.get("exit_rules", [])
    if not isinstance(entry, list) or len(entry) == 0:
        return False, "entry_rules debe ser una lista con al menos 1 regla"
    if not isinstance(exit_, list) or len(exit_) == 0:
        return False, "exit_rules debe ser una lista con al menos 1 regla"

    valid_timeframes = ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w", "1M"]
    if rules.get("timeframe") not in valid_timeframes:
        return False, f"timeframe debe ser uno de: {', '.join(valid_timeframes)}"

    return True, ""


# ── Servicio principal ─────────────────────────────────────────────────────────

class StrategyService:

    # ──────────────────────────────────────────────────────────────────────────
    # CREAR / EDITAR
    # ──────────────────────────────────────────────────────────────────────────

    @staticmethod
    def create(user_id: int, data: dict) -> tuple[dict, str | None]:
        """
        Crea una estrategia en borrador.
        Devuelve (strategy_dict, error_msg).
        """
        from app import db
        from app.models.strategy import Strategy
        from app.models.user import User

        user = User.query.get(user_id)
        if not user:
            return {}, "Usuario no encontrado"

        name = (data.get("name") or "").strip()
        if not name:
            return {}, "El campo 'name' es obligatorio"
        if len(name) > 120:
            return {}, "El nombre no puede superar 120 caracteres"

        category = data.get("category", "other")
        from app.models.strategy import STRATEGY_CATEGORY
        if category not in STRATEGY_CATEGORY:
            category = "other"

        # Precio: solo PRO pueden cobrar
        is_paid = bool(data.get("is_paid", False))
        price   = float(data.get("price") or 0)
        if is_paid:
            from app.services.subscription_service import SubscriptionService
            if user.role != "admin" and not SubscriptionService.can_use_feature(user, "can_sell_strategies"):
                return {}, "Necesitas PRO para crear estrategias de pago"
        if is_paid and price <= 0:
            return {}, "El precio debe ser mayor que 0 para estrategias de pago"

        # rules_json — opcional en borrador, validar si viene
        rules_json_str = None
        if data.get("rules"):
            rules = data["rules"]
            if isinstance(rules, str):
                try:
                    rules = json.loads(rules)
                except Exception:
                    return {}, "rules_json contiene JSON inválido"
            ok, err = _validate_rules_json(rules)
            if not ok:
                return {}, err
            rules_json_str = json.dumps(rules)

        strategy = Strategy(
            user_id      = user_id,
            name         = name,
            slug         = _slugify(name),
            description  = (data.get("description") or "").strip() or None,
            short_desc   = (data.get("short_desc") or "").strip()[:280] or None,
            category     = category,
            rules_json   = rules_json_str,
            visibility   = "private",
            status       = "draft",
            is_paid      = is_paid,
            price        = round(price, 2),
            currency     = data.get("currency", "MYC"),
            target_tickers = data.get("target_tickers"),
        )
        db.session.add(strategy)
        db.session.flush()  # obtener ID

        # Fijar slug con ID para unicidad
        strategy.slug = _slugify(name, strategy.id)
        db.session.commit()

        # Gamificación
        try:
            from app.services.gamification_service import GamificationService
            GamificationService.track_activity(
                user_id, "strategy_created",
                reference_type="strategy", reference_id=strategy.id,
            )
        except Exception as e:
            logger.warning("Gamification error on strategy_created: %s", e)

        return strategy.to_dict(include_rules=True, viewer=user), None

    @staticmethod
    def update(strategy_id: int, user_id: int, data: dict) -> tuple[dict, str | None]:
        """Edita una estrategia propia. Solo el autor o admin puede hacerlo."""
        from app import db
        from app.models.strategy import Strategy
        from app.models.user import User

        strategy = Strategy.query.get(strategy_id)
        if not strategy:
            return {}, "Estrategia no encontrada"

        user = User.query.get(user_id)
        if not user:
            return {}, "Usuario no encontrado"

        if strategy.user_id != user_id and user.role != "admin":
            return {}, "Sin permisos para editar esta estrategia"

        if strategy.status == "archived":
            return {}, "No se puede editar una estrategia archivada"

        # Actualizar campos
        if "name" in data and data["name"]:
            strategy.name = data["name"].strip()[:120]
            strategy.slug = _slugify(strategy.name, strategy.id)

        if "description" in data:
            strategy.description = (data["description"] or "").strip() or None
        if "short_desc" in data:
            strategy.short_desc = (data["short_desc"] or "").strip()[:280] or None
        if "category" in data:
            from app.models.strategy import STRATEGY_CATEGORY
            strategy.category = data["category"] if data["category"] in STRATEGY_CATEGORY else "other"
        if "target_tickers" in data:
            strategy.target_tickers = data.get("target_tickers")

        # Precio
        if "is_paid" in data:
            is_paid = bool(data["is_paid"])
            price   = float(data.get("price") or strategy.price or 0)
            if is_paid:
                from app.services.subscription_service import SubscriptionService
                if user.role != "admin" and not SubscriptionService.can_use_feature(user, "can_sell_strategies"):
                    return {}, "Necesitas PRO para tener estrategias de pago"
            if is_paid and price <= 0:
                return {}, "El precio debe ser mayor que 0"
            strategy.is_paid = is_paid
            strategy.price   = round(price, 2)
        elif "price" in data:
            strategy.price = round(float(data["price"] or 0), 2)

        if "currency" in data:
            strategy.currency = data["currency"]

        # Reglas — validar si vienen
        if "rules" in data and data["rules"]:
            rules = data["rules"]
            if isinstance(rules, str):
                try:
                    rules = json.loads(rules)
                except Exception:
                    return {}, "rules_json contiene JSON inválido"
            ok, err = _validate_rules_json(rules)
            if not ok:
                return {}, err
            strategy.rules_json = json.dumps(rules)

        strategy.updated_at = datetime.now(timezone.utc)
        db.session.commit()
        _invalidate_marketplace()

        return strategy.to_dict(include_rules=True, viewer=user), None

    # ──────────────────────────────────────────────────────────────────────────
    # PUBLICAR / ARCHIVAR
    # ──────────────────────────────────────────────────────────────────────────

    @staticmethod
    def publish(strategy_id: int, user_id: int) -> tuple[dict, str | None]:
        """
        Publica la estrategia en el marketplace.
        Requisitos:
          - Autor (o admin)
          - Nombre, descripción, reglas y categoría presentes
          - Si es de pago: precio > 0 y usuario PRO
          - Status != archived
        """
        from app import db
        from app.models.strategy import Strategy
        from app.models.user import User

        strategy = Strategy.query.get(strategy_id)
        if not strategy:
            return {}, "Estrategia no encontrada"

        user = User.query.get(user_id)
        if not user:
            return {}, "Usuario no encontrado"

        if strategy.user_id != user_id and user.role != "admin":
            return {}, "Sin permisos"

        if strategy.status == "archived":
            return {}, "No se puede publicar una estrategia archivada"

        # Validaciones de publicación
        if not strategy.name:
            return {}, "La estrategia debe tener nombre"
        if not strategy.description:
            return {}, "La estrategia debe tener descripción"
        if not strategy.rules_json:
            return {}, "La estrategia debe tener reglas definidas"
        if strategy.is_paid:
            from app.services.subscription_service import SubscriptionService
            if user.role != "admin" and not SubscriptionService.can_use_feature(user, "can_sell_strategies"):
                return {}, "Necesitas PRO para publicar estrategias de pago"
            if float(strategy.price or 0) <= 0:
                return {}, "El precio debe ser mayor que 0"

        strategy.status      = "published"
        strategy.visibility  = "marketplace"
        strategy.published_at = datetime.now(timezone.utc)
        strategy.version     += 1
        db.session.commit()
        _invalidate_marketplace()

        # Gamificación
        try:
            from app.services.gamification_service import GamificationService
            GamificationService.track_activity(
                user_id, "strategy_published",
                reference_type="strategy", reference_id=strategy.id,
            )
        except Exception as e:
            logger.warning("Gamification error on strategy_published: %s", e)

        return strategy.to_dict(include_rules=True, viewer=user), None

    @staticmethod
    def archive(strategy_id: int, user_id: int) -> tuple[dict, str | None]:
        from app import db
        from app.models.strategy import Strategy
        from app.models.user import User

        strategy = Strategy.query.get(strategy_id)
        if not strategy:
            return {}, "Estrategia no encontrada"

        user = User.query.get(user_id)
        if strategy.user_id != user_id and user.role != "admin":
            return {}, "Sin permisos"

        strategy.status     = "archived"
        strategy.visibility = "private"
        db.session.commit()
        _invalidate_marketplace()

        return strategy.to_dict(), None

    # ──────────────────────────────────────────────────────────────────────────
    # CATÁLOGO MARKETPLACE
    # ──────────────────────────────────────────────────────────────────────────

    @staticmethod
    def get_marketplace(
        page: int = 1,
        per_page: int = 20,
        category: str | None = None,
        is_paid: bool | None = None,
        min_rating: float | None = None,
        max_price: float | None = None,
        search: str | None = None,
        sort: str = "recent",
        featured_only: bool = False,
        viewer=None,
    ) -> dict:
        """
        Catálogo público del marketplace con filtros y paginación.
        Cachea resultados en Redis / memoria.
        """
        filters_hash = _hash_filters({
            "cat": category, "paid": is_paid, "mr": min_rating,
            "mp": max_price, "q": search, "sort": sort, "feat": featured_only,
        })
        cache_key = f"marketplace:catalog:{page}:{per_page}:{filters_hash}"
        if viewer is None:
            cached = _cache_get(cache_key)
            if cached:
                try:
                    return json.loads(cached)
                except Exception:
                    pass

        from app.models.strategy import Strategy

        query = Strategy.query.filter(
            Strategy.status     == "published",
            Strategy.visibility == "marketplace",
        )

        if category:
            query = query.filter(Strategy.category == category)
        if is_paid is True:
            query = query.filter(Strategy.is_paid == True)
        elif is_paid is False:
            query = query.filter(Strategy.is_paid == False)
        if min_rating is not None:
            query = query.filter(Strategy.average_rating >= min_rating)
        if max_price is not None:
            query = query.filter(Strategy.price <= max_price)
        if featured_only:
            query = query.filter(Strategy.is_featured == True)
        if search:
            like = f"%{search}%"
            query = query.filter(
                Strategy.name.ilike(like) | Strategy.description.ilike(like)
            )

        # Ordenación
        if sort == "top_sales":
            query = query.order_by(Strategy.times_purchased.desc())
        elif sort == "best_rating":
            query = query.order_by(Strategy.average_rating.desc().nullslast())
        elif sort == "featured":
            query = query.order_by(Strategy.is_featured.desc(), Strategy.times_purchased.desc())
        elif sort == "best_return":
            from app.models.strategy import StrategyBacktestMetrics
            query = query.outerjoin(
                StrategyBacktestMetrics,
                Strategy.id == StrategyBacktestMetrics.strategy_id
            ).order_by(StrategyBacktestMetrics.total_return.desc().nullslast())
        elif sort == "price_asc":
            query = query.order_by(Strategy.price.asc())
        elif sort == "price_desc":
            query = query.order_by(Strategy.price.desc())
        else:  # recent
            query = query.order_by(Strategy.published_at.desc())

        paginated = query.paginate(page=page, per_page=per_page, error_out=False)

        result = {
            "items":      [
                s.to_dict(include_rules=bool(viewer and s.is_accessible_by(viewer)), viewer=viewer)
                for s in paginated.items
            ],
            "total":      paginated.total,
            "page":       page,
            "per_page":   per_page,
            "pages":      paginated.pages,
            "has_next":   paginated.has_next,
            "has_prev":   paginated.has_prev,
        }

        if viewer is None:
            _cache_set(cache_key, json.dumps(result))
        return result

    @staticmethod
    def get_strategy_public(strategy_id: int, viewer=None) -> tuple[dict, str | None]:
        """Detalle público de una estrategia. Incrementa views_count."""
        from app import db
        from app.models.strategy import Strategy

        strategy = Strategy.query.get(strategy_id)
        if not strategy:
            return {}, "Estrategia no encontrada"

        # Solo mostrar si está publicada o el viewer es el autor / admin
        is_author  = viewer and viewer.id == strategy.user_id
        is_admin   = viewer and viewer.role == "admin"
        is_visible = strategy.status == "published" and strategy.visibility == "marketplace"

        if not is_visible and not is_author and not is_admin:
            return {}, "Estrategia no disponible"

        # Incrementar vistas (no cachear esto)
        strategy.views_count = (strategy.views_count or 0) + 1
        db.session.commit()

        include_rules = strategy.is_accessible_by(viewer)
        return strategy.to_dict(include_rules=include_rules, viewer=viewer), None

    # ──────────────────────────────────────────────────────────────────────────
    # MIS ESTRATEGIAS
    # ──────────────────────────────────────────────────────────────────────────

    @staticmethod
    def get_mine(user_id: int, status: str | None = None) -> list[dict]:
        """Lista todas las estrategias creadas por el usuario."""
        from app.models.strategy import Strategy
        from app.models.user import User

        viewer = User.query.get(user_id)
        q = Strategy.query.filter_by(user_id=user_id)
        if status:
            q = q.filter_by(status=status)
        strategies = q.order_by(Strategy.created_at.desc()).all()
        return [s.to_dict(include_rules=True, viewer=viewer) for s in strategies]

    @staticmethod
    def get_purchased(user_id: int) -> list[dict]:
        """Lista las estrategias compradas por el usuario con acceso completo."""
        from app.models.strategy import Strategy, StrategyPurchase
        from app.models.user import User

        viewer = User.query.get(user_id)

        purchases = StrategyPurchase.query.filter_by(
            buyer_id=user_id,
            payment_status="completed",
        ).order_by(StrategyPurchase.created_at.desc()).all()

        result = []
        for p in purchases:
            s = Strategy.query.get(p.strategy_id)
            if s:
                d = s.to_dict(include_rules=True, viewer=viewer)
                d["purchase"] = p.to_dict()
                result.append(d)
        return result

    # ──────────────────────────────────────────────────────────────────────────
    # COMPRA / DESBLOQUEO
    # ──────────────────────────────────────────────────────────────────────────

    @staticmethod
    def purchase(strategy_id: int, buyer_id: int) -> tuple[dict, str | None]:
        """
        Registra la compra de una estrategia.

        Flujo:
          1. Validaciones (permisos, duplicado, propia estrategia)
          2. Cálculo de comisión (backend authoritative)
          3. Si es gratuita: payment_status='completed' inmediato
          4. Si es de pago: payment_status='pending' (listo para Stripe)
          5. Incrementa times_purchased si completed
          6. Gamificación

        Nota: La integración con pasarela de pago real se conectará
        actualizando payment_status a 'completed' desde un webhook.
        """
        from app import db
        from app.models.strategy import Strategy, StrategyPurchase, PLATFORM_FEE_PCT
        from app.models.user import User

        buyer    = User.query.get(buyer_id)
        strategy = Strategy.query.get(strategy_id)

        if not buyer:
            return {}, "Usuario no encontrado"
        if not strategy:
            return {}, "Estrategia no encontrada"
        if strategy.status != "published" or strategy.visibility != "marketplace":
            return {}, "Esta estrategia no está disponible en el marketplace"
        if strategy.user_id == buyer_id:
            return {}, "No puedes comprar tu propia estrategia"

        # Verificar compra duplicada
        existing = StrategyPurchase.query.filter_by(
            buyer_id=buyer_id,
            strategy_id=strategy_id,
        ).first()
        if existing:
            if existing.payment_status == "completed":
                return {}, "Ya tienes acceso a esta estrategia"
            # Si está pending, retornar el intento existente
            return existing.to_dict(), None

        # Cálculo de comisión desde backend (never trust frontend)
        price = float(strategy.price or 0)
        fees  = StrategyPurchase.calc_fees(price, PLATFORM_FEE_PCT)

        # Para estrategias gratuitas: completar inmediatamente
        is_free = not strategy.is_paid or price == 0
        payment_status = "completed" if is_free else "pending"

        purchase = StrategyPurchase(
            buyer_id         = buyer_id,
            strategy_id      = strategy_id,
            seller_id        = strategy.user_id,
            listed_price     = fees["listed_price"],
            platform_fee     = fees["platform_fee"],
            seller_amount    = fees["seller_amount"],
            fee_pct          = fees["fee_pct"],
            strategy_version = strategy.version,
            payment_status   = payment_status,
            payment_provider = "internal",
            paid_at          = datetime.now(timezone.utc) if is_free else None,
        )
        db.session.add(purchase)

        if is_free:
            strategy.times_purchased = (strategy.times_purchased or 0) + 1

        db.session.commit()
        _invalidate_marketplace()

        # Gamificación
        try:
            from app.services.gamification_service import GamificationService
            GamificationService.track_activity(
                buyer_id, "strategy_purchased",
                reference_type="strategy", reference_id=strategy_id,
            )
        except Exception as e:
            logger.warning("Gamification error on strategy_purchased: %s", e)

        return purchase.to_dict(), None

    @staticmethod
    def purchase_with_internal_coins(strategy_id: int, buyer_id: int) -> tuple[dict, str | None]:
        """Compra canonica de estrategias usando monedas internas."""
        from app import db
        from app.models.strategy import Strategy, StrategyPurchase
        from app.models.user import User
        from app.services.economy_services import CoinService, DomainError

        buyer = User.query.get(buyer_id)
        strategy = Strategy.query.get(strategy_id)
        if not buyer:
            return {}, "Usuario no encontrado"
        if not strategy:
            return {}, "Estrategia no encontrada"
        if strategy.status != "published" or strategy.visibility != "marketplace":
            return {}, "Esta estrategia no esta disponible en el marketplace"
        if strategy.user_id == buyer_id:
            return {}, "No puedes comprar tu propia estrategia"

        purchase = StrategyPurchase.query.filter_by(
            buyer_id=buyer_id,
            strategy_id=strategy_id,
        ).first()
        if purchase and purchase.payment_status == "completed":
            return {}, "Ya tienes acceso a esta estrategia"

        price_coins = int(getattr(strategy, "price_coins", 0) or 0)
        is_free = not strategy.is_paid or price_coins == 0
        fees = StrategyPurchase.calc_fees(float(price_coins), 0.0)
        seller_coins = price_coins

        try:
            if purchase is None:
                purchase = StrategyPurchase(
                    buyer_id=buyer_id,
                    strategy_id=strategy_id,
                    seller_id=strategy.user_id,
                    listed_price=fees["listed_price"],
                    platform_fee=fees["platform_fee"],
                    seller_amount=seller_coins,
                    fee_pct=fees["fee_pct"],
                    strategy_version=strategy.version,
                    payment_status="pending",
                    payment_provider="coins",
                )
                db.session.add(purchase)
                db.session.flush()
            else:
                purchase.listed_price = fees["listed_price"]
                purchase.platform_fee = fees["platform_fee"]
                purchase.seller_amount = seller_coins
                purchase.payment_provider = "coins"

            if not is_free:
                CoinService.debit(buyer_id, price_coins, "strategy_purchase", "StrategyPurchase", purchase.id)
                if seller_coins > 0:
                    CoinService.credit(strategy.user_id, seller_coins, "strategy_sale", "StrategyPurchase", purchase.id)

            purchase.payment_status = "completed"
            purchase.external_payment_id = f"coins-strategy-{strategy_id}-{buyer_id}-{purchase.id}"
            purchase.paid_at = datetime.now(timezone.utc)
            strategy.times_purchased = (strategy.times_purchased or 0) + 1
            db.session.commit()
            _invalidate_marketplace()
        except DomainError as exc:
            db.session.rollback()
            details = dict(getattr(exc, "details", {}) or {})
            details["error_code"] = exc.code
            return details, str(exc)
        except Exception:
            db.session.rollback()
            raise

        try:
            from app.services.gamification_service import GamificationService
            GamificationService.track_activity(
                buyer_id, "strategy_purchased",
                reference_type="strategy", reference_id=strategy_id,
            )
        except Exception as e:
            logger.warning("Gamification error on strategy_purchased: %s", e)

        return purchase.to_dict(), None

    @staticmethod
    def confirm_payment(
        strategy_id: int,
        buyer_id: int,
        external_payment_id: str,
        provider: str = "stripe",
    ) -> tuple[dict, str | None]:
        """
        Confirma el pago externo (llamado desde webhook de Stripe u otro).
        Actualiza payment_status a 'completed' y registra el external_payment_id.
        """
        from app import db
        from app.models.strategy import Strategy, StrategyPurchase

        purchase = StrategyPurchase.query.filter_by(
            buyer_id=buyer_id,
            strategy_id=strategy_id,
        ).first()
        if not purchase:
            return {}, "Compra no encontrada"
        if purchase.payment_status == "completed":
            return purchase.to_dict(), None

        purchase.payment_status     = "completed"
        purchase.payment_provider   = provider
        purchase.external_payment_id = external_payment_id
        purchase.paid_at            = datetime.now(timezone.utc)

        strategy = Strategy.query.get(strategy_id)
        if strategy:
            strategy.times_purchased = (strategy.times_purchased or 0) + 1

        db.session.commit()
        _invalidate_marketplace()
        return purchase.to_dict(), None

    # ──────────────────────────────────────────────────────────────────────────
    # REVIEWS
    # ──────────────────────────────────────────────────────────────────────────

    @staticmethod
    def add_review(
        strategy_id: int,
        user_id: int,
        rating: int,
        comment: str | None,
    ) -> tuple[dict, str | None]:
        """
        Añade o actualiza la reseña del usuario.
        Solo compradores (payment_status=completed) pueden valorar.
        """
        from app import db
        from app.models.strategy import Strategy, StrategyPurchase, StrategyReview

        strategy = Strategy.query.get(strategy_id)
        if not strategy:
            return {}, "Estrategia no encontrada"

        if strategy.user_id == user_id:
            return {}, "No puedes valorar tu propia estrategia"

        # Verificar que es comprador
        purchase = StrategyPurchase.query.filter_by(
            buyer_id=user_id,
            strategy_id=strategy_id,
            payment_status="completed",
        ).first()
        if not purchase:
            return {}, "Solo los compradores pueden valorar esta estrategia"

        if not (1 <= int(rating) <= 5):
            return {}, "El rating debe estar entre 1 y 5"

        review = StrategyReview.query.filter_by(
            user_id=user_id,
            strategy_id=strategy_id,
        ).first()

        if review:
            # Actualizar reseña existente
            review.rating    = rating
            review.comment   = comment
            review.updated_at = datetime.now(timezone.utc)
        else:
            review = StrategyReview(
                user_id=user_id, strategy_id=strategy_id,
                rating=rating, comment=comment,
            )
            db.session.add(review)

        db.session.flush()
        StrategyService._recalculate_rating(strategy_id)
        db.session.commit()
        _invalidate_marketplace()

        # Gamificación
        try:
            from app.services.gamification_service import GamificationService
            GamificationService.track_activity(
                user_id, "strategy_reviewed",
                reference_type="strategy", reference_id=strategy_id,
            )
        except Exception as e:
            logger.warning("Gamification error on strategy_reviewed: %s", e)

        return review.to_dict(), None

    @staticmethod
    def delete_review(strategy_id: int, user_id: int, review_id: int) -> tuple[bool, str | None]:
        from app import db
        from app.models.strategy import StrategyReview
        from app.models.user import User

        user   = User.query.get(user_id)
        review = StrategyReview.query.get(review_id)

        if not review or review.strategy_id != strategy_id:
            return False, "Reseña no encontrada"
        if review.user_id != user_id and user.role != "admin":
            return False, "Sin permisos"

        db.session.delete(review)
        StrategyService._recalculate_rating(strategy_id)
        db.session.commit()
        _invalidate_marketplace()
        return True, None

    @staticmethod
    def _recalculate_rating(strategy_id: int) -> None:
        """Recalcula average_rating y reviews_count en la estrategia."""
        from app import db
        from app.models.strategy import Strategy, StrategyReview
        from sqlalchemy import func

        result = db.session.query(
            func.avg(StrategyReview.rating).label("avg"),
            func.count(StrategyReview.id).label("cnt"),
        ).filter(StrategyReview.strategy_id == strategy_id).first()

        strategy = Strategy.query.get(strategy_id)
        if strategy:
            strategy.average_rating = round(float(result.avg), 2) if result.avg else None
            strategy.reviews_count  = result.cnt or 0

    @staticmethod
    def get_reviews(strategy_id: int) -> list[dict]:
        from app.models.strategy import StrategyReview
        reviews = StrategyReview.query.filter_by(
            strategy_id=strategy_id
        ).order_by(StrategyReview.created_at.desc()).all()
        return [r.to_dict() for r in reviews]

    # ──────────────────────────────────────────────────────────────────────────
    # BACKTEST METRICS
    # ──────────────────────────────────────────────────────────────────────────

    @staticmethod
    def upsert_metrics(strategy_id: int, user_id: int, data: dict) -> tuple[dict, str | None]:
        """
        Crea o actualiza las métricas de backtest de una estrategia.
        Si se proporciona backtest_result_id, enlaza con BacktestResult existente.
        """
        from app import db
        from app.models.strategy import Strategy, StrategyBacktestMetrics
        from app.models.backtest import BacktestResult
        from app.models.user import User

        strategy = Strategy.query.get(strategy_id)
        if not strategy:
            return {}, "Estrategia no encontrada"

        user = User.query.get(user_id)
        if strategy.user_id != user_id and user.role != "admin":
            return {}, "Sin permisos"

        backtest_result_id = data.get("backtest_result_id")
        if backtest_result_id:
            br = BacktestResult.query.get(backtest_result_id)
            if not br or br.user_id != user_id:
                return {}, "BacktestResult no encontrado o no pertenece al usuario"
            # Copiar métricas del BacktestResult existente
            data.setdefault("win_rate",     br.win_rate)
            data.setdefault("total_return", br.total_return)
            data.setdefault("max_drawdown", br.max_drawdown)
            data.setdefault("sharpe_ratio", br.sharpe_ratio)
            data.setdefault("sortino_ratio", br.sortino_ratio)
            data.setdefault("profit_factor", br.profit_factor)
            data.setdefault("trades_count",  br.trades_count)

        metrics = StrategyBacktestMetrics.query.filter_by(strategy_id=strategy_id).first()
        if not metrics:
            metrics = StrategyBacktestMetrics(strategy_id=strategy_id)
            db.session.add(metrics)

        for field in ["win_rate", "total_return", "max_drawdown", "sharpe_ratio",
                       "sortino_ratio", "profit_factor", "trades_count",
                       "avg_trade_days", "ticker_tested"]:
            if field in data and data[field] is not None:
                setattr(metrics, field, data[field])

        if backtest_result_id:
            metrics.backtest_result_id = backtest_result_id

        for date_field in ["backtest_from", "backtest_to"]:
            if data.get(date_field):
                try:
                    from datetime import date
                    metrics.__setattr__(date_field, date.fromisoformat(data[date_field]))
                except Exception:
                    pass

        metrics.last_backtest_at = datetime.now(timezone.utc)
        db.session.commit()
        _invalidate_marketplace()

        return metrics.to_dict(), None

    # ──────────────────────────────────────────────────────────────────────────
    # ADMIN
    # ──────────────────────────────────────────────────────────────────────────

    @staticmethod
    def admin_list(page: int = 1, per_page: int = 50, status: str | None = None) -> dict:
        from app.models.strategy import Strategy

        q = Strategy.query
        if status:
            q = q.filter_by(status=status)
        q = q.order_by(Strategy.created_at.desc())
        paginated = q.paginate(page=page, per_page=per_page, error_out=False)

        return {
            "items":    [s.to_dict() for s in paginated.items],
            "total":    paginated.total,
            "page":     page,
            "per_page": per_page,
            "pages":    paginated.pages,
        }

    @staticmethod
    def admin_feature(strategy_id: int, featured: bool) -> tuple[dict, str | None]:
        from app import db
        from app.models.strategy import Strategy

        strategy = Strategy.query.get(strategy_id)
        if not strategy:
            return {}, "Estrategia no encontrada"
        strategy.is_featured = featured
        db.session.commit()
        _invalidate_marketplace()
        return strategy.to_dict(), None

    @staticmethod
    def admin_moderate(strategy_id: int, action: str) -> tuple[dict, str | None]:
        """
        action: 'archive' | 'publish' | 'unpublish'
        """
        from app import db
        from app.models.strategy import Strategy

        strategy = Strategy.query.get(strategy_id)
        if not strategy:
            return {}, "Estrategia no encontrada"

        if action == "archive":
            strategy.status     = "archived"
            strategy.visibility = "private"
        elif action == "publish":
            strategy.status     = "published"
            strategy.visibility = "marketplace"
        elif action == "unpublish":
            strategy.status     = "draft"
            strategy.visibility = "private"
        else:
            return {}, f"Acción '{action}' no reconocida"

        db.session.commit()
        _invalidate_marketplace()
        return strategy.to_dict(), None

    @staticmethod
    def admin_stats() -> dict:
        from app.models.strategy import Strategy, StrategyPurchase, StrategyReview
        from sqlalchemy import func
        from app import db

        total       = Strategy.query.count()
        published   = Strategy.query.filter_by(status="published").count()
        draft       = Strategy.query.filter_by(status="draft").count()
        archived    = Strategy.query.filter_by(status="archived").count()
        paid        = Strategy.query.filter_by(is_paid=True).count()
        free        = Strategy.query.filter_by(is_paid=False).count()
        total_purchases = StrategyPurchase.query.filter_by(payment_status="completed").count()
        total_revenue   = db.session.query(func.sum(StrategyPurchase.listed_price)).filter_by(payment_status="completed").scalar() or 0
        platform_fees   = db.session.query(func.sum(StrategyPurchase.platform_fee)).filter_by(payment_status="completed").scalar() or 0
        total_reviews   = StrategyReview.query.count()

        return {
            "total_strategies": total,
            "published":        published,
            "draft":            draft,
            "archived":         archived,
            "paid":             paid,
            "free":             free,
            "total_purchases":  total_purchases,
            "total_revenue":    float(total_revenue),
            "platform_fees":    float(platform_fees),
            "total_reviews":    total_reviews,
        }
