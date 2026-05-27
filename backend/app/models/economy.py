"""Modelos de economia interna, marketplace y trabajos ML."""
from datetime import datetime, timezone

from app import db


def utcnow():
    return datetime.now(timezone.utc)


class CoinTransaction(db.Model):
    __tablename__ = "coin_transactions"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    amount = db.Column(db.Integer, nullable=False)
    type = db.Column(db.String(10), nullable=False)
    reason = db.Column(db.String(40), nullable=False)
    reference_type = db.Column(db.String(50))
    reference_id = db.Column(db.Integer)
    balance_after = db.Column(db.Integer, nullable=False)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "amount": self.amount,
            "type": self.type,
            "reason": self.reason,
            "reference_type": self.reference_type,
            "reference_id": self.reference_id,
            "balance_after": self.balance_after,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class CoinPackage(db.Model):
    __tablename__ = "coin_packages"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), nullable=False)
    coins = db.Column(db.Integer, nullable=False)
    price_cents = db.Column(db.Integer, nullable=False)
    currency = db.Column(db.String(3), nullable=False, default="EUR")
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    stripe_price_id = db.Column(db.String(120))
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "coins": self.coins,
            "price_cents": self.price_cents,
            "price": round(self.price_cents / 100, 2),
            "currency": self.currency,
            "is_active": self.is_active,
            "stripe_price_id": self.stripe_price_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class CoinPurchase(db.Model):
    __tablename__ = "coin_purchases"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    package_id = db.Column(db.Integer, db.ForeignKey("coin_packages.id", ondelete="SET NULL"))
    coins = db.Column(db.Integer, nullable=False)
    amount_cents = db.Column(db.Integer, nullable=False)
    currency = db.Column(db.String(3), nullable=False, default="EUR")
    status = db.Column(db.String(20), nullable=False, default="pending", index=True)
    stripe_checkout_session_id = db.Column(db.String(200), unique=True)
    stripe_payment_intent_id = db.Column(db.String(200))
    stripe_customer_id = db.Column(db.String(200))
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)
    paid_at = db.Column(db.DateTime)
    failed_at = db.Column(db.DateTime)
    error_message = db.Column(db.Text)

    package = db.relationship("CoinPackage")

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "package_id": self.package_id,
            "package": self.package.to_dict() if self.package else None,
            "coins": self.coins,
            "amount_cents": self.amount_cents,
            "currency": self.currency,
            "status": self.status,
            "stripe_checkout_session_id": self.stripe_checkout_session_id,
            "stripe_payment_intent_id": self.stripe_payment_intent_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "paid_at": self.paid_at.isoformat() if self.paid_at else None,
            "failed_at": self.failed_at.isoformat() if self.failed_at else None,
            "error_message": self.error_message,
        }


class MarketplacePrediction(db.Model):
    __tablename__ = "marketplace_predictions"

    id = db.Column(db.Integer, primary_key=True)
    author_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    ticker_id = db.Column(db.Integer, db.ForeignKey("tickers.id", ondelete="RESTRICT"), nullable=False)
    linked_prediction_id = db.Column(db.Integer)
    title = db.Column(db.String(140), nullable=False)
    preview = db.Column(db.Text)
    description = db.Column(db.Text)
    content = db.Column(db.Text, nullable=False)
    price_coins = db.Column(db.Integer, nullable=False, default=50)
    status = db.Column(db.String(20), nullable=False, default="active", index=True)
    purchases_count = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow)

    author = db.relationship("User")
    ticker = db.relationship("Ticker")

    def to_dict(self, has_access=False):
        return {
            "id": self.id,
            "author_id": self.author_id,
            "author": self.author.username if self.author else None,
            "ticker_id": self.ticker_id,
            "ticker": self.ticker.symbol if self.ticker else None,
            "linked_prediction_id": self.linked_prediction_id,
            "title": self.title,
            "description": self.description,
            "content": self.content if has_access else None,
            "preview": self.preview or self.description or ((self.content or "")[:180] if has_access else None),
            "locked": not has_access,
            "price_coins": self.price_coins,
            "status": self.status,
            "purchases_count": self.purchases_count,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class MarketplacePurchase(db.Model):
    __tablename__ = "marketplace_purchases"
    __table_args__ = (db.UniqueConstraint("marketplace_prediction_id", "buyer_id", name="uq_marketplace_prediction_buyer"),)

    id = db.Column(db.Integer, primary_key=True)
    marketplace_prediction_id = db.Column(db.Integer, db.ForeignKey("marketplace_predictions.id", ondelete="CASCADE"), nullable=False)
    buyer_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    seller_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    price_coins = db.Column(db.Integer, nullable=False)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    prediction = db.relationship("MarketplacePrediction")

    def to_dict(self):
        return {
            "id": self.id,
            "marketplace_prediction_id": self.marketplace_prediction_id,
            "buyer_id": self.buyer_id,
            "seller_id": self.seller_id,
            "price_coins": self.price_coins,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class RouletteSpin(db.Model):
    __tablename__ = "roulette_spins"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    prize_coins = db.Column(db.Integer, nullable=False)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "prize_coins": self.prize_coins,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class MLModelRun(db.Model):
    __tablename__ = "ml_model_runs"

    id = db.Column(db.Integer, primary_key=True)
    ticker_id = db.Column(db.Integer, db.ForeignKey("tickers.id", ondelete="SET NULL"))
    model_name = db.Column(db.String(80), nullable=False)
    status = db.Column(db.String(20), nullable=False, default="pending")
    input_window = db.Column(db.Integer)
    prediction_value = db.Column(db.Numeric(14, 4))
    prediction_direction = db.Column(db.String(10))
    mae = db.Column(db.Numeric(14, 6))
    rmse = db.Column(db.Numeric(14, 6))
    mape = db.Column(db.Numeric(10, 4))
    directional_accuracy = db.Column(db.Numeric(8, 4))
    started_at = db.Column(db.DateTime, default=utcnow, nullable=False)
    finished_at = db.Column(db.DateTime)
    error_message = db.Column(db.Text)
    metadata_json = db.Column(db.JSON)

    ticker = db.relationship("Ticker")

    def to_dict(self):
        return {
            "id": self.id,
            "ticker_id": self.ticker_id,
            "ticker": self.ticker.symbol if self.ticker else None,
            "model_name": self.model_name,
            "status": self.status,
            "input_window": self.input_window,
            "prediction_value": float(self.prediction_value) if self.prediction_value is not None else None,
            "prediction_direction": self.prediction_direction,
            "mae": float(self.mae) if self.mae is not None else None,
            "rmse": float(self.rmse) if self.rmse is not None else None,
            "mape": float(self.mape) if self.mape is not None else None,
            "directional_accuracy": float(self.directional_accuracy) if self.directional_accuracy is not None else None,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "finished_at": self.finished_at.isoformat() if self.finished_at else None,
            "error_message": self.error_message,
            "metadata": self.metadata_json,
        }


class AdminJob(db.Model):
    __tablename__ = "admin_jobs"

    id = db.Column(db.Integer, primary_key=True)
    type = db.Column(db.String(60), nullable=False, index=True)
    status = db.Column(db.String(20), nullable=False, default="pending", index=True)
    ticker_id = db.Column(db.Integer, db.ForeignKey("tickers.id", ondelete="SET NULL"))
    started_at = db.Column(db.DateTime)
    finished_at = db.Column(db.DateTime)
    progress = db.Column(db.Integer, nullable=False, default=0)
    result_json = db.Column(db.JSON)
    error_message = db.Column(db.Text)
    created_by_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"))
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "type": self.type,
            "status": self.status,
            "ticker_id": self.ticker_id,
            "progress": self.progress,
            "result": self.result_json,
            "error_message": self.error_message,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "finished_at": self.finished_at.isoformat() if self.finished_at else None,
            "created_by_id": self.created_by_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
