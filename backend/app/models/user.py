"""
Modelos: User y FavoriteTicker
"""
from datetime import datetime, timedelta, timezone
from hashlib import sha256
from secrets import token_urlsafe
from werkzeug.security import generate_password_hash, check_password_hash
from app import db


class User(db.Model):
    __tablename__ = "users"

    id            = db.Column(db.Integer, primary_key=True)
    username      = db.Column(db.String(50), unique=True, nullable=False, index=True)
    email         = db.Column(db.String(120), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    full_name     = db.Column(db.String(120))
    avatar_url    = db.Column(db.Text)
    bio           = db.Column(db.Text)
    headline      = db.Column(db.String(160))
    location      = db.Column(db.String(120))
    website       = db.Column(db.String(255))
    trading_style = db.Column(db.String(80))
    settings      = db.Column(db.JSON, default=dict)
    is_active     = db.Column(db.Boolean, default=True, nullable=False)
    email_verified = db.Column(db.Boolean, default=False, nullable=False)
    email_verification_token_hash = db.Column(db.String(128))
    email_verification_sent_at = db.Column(db.DateTime)
    password_reset_token_hash = db.Column(db.String(128))
    password_reset_sent_at = db.Column(db.DateTime)

    # ── Roles y control de acceso ──────────────────────────────────────────
    # rumarrcc: admin se mantiene como alias global usado por panel y scripts.
    # rumarrcc: subscription queda como cache historica; el saldo real vive en internal_coins.
    role          = db.Column(db.String(20), default="user",  nullable=False)
    subscription  = db.Column(db.String(10), default="free",  nullable=False)
    subscription_status = db.Column(db.String(20), default="inactive", nullable=False)
    internal_coins = db.Column(db.Integer, default=0, nullable=False)
    is_blocked    = db.Column(db.Boolean,    default=False,   nullable=False)
    last_login    = db.Column(db.DateTime)

    created_at    = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at    = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # ── Relaciones ─────────────────────────────────────────────────────────
    predictions    = db.relationship("Prediction",     back_populates="user", lazy="dynamic", cascade="all, delete-orphan")
    alerts         = db.relationship("Alert",          back_populates="user", lazy="dynamic", cascade="all, delete-orphan")
    backtest_results = db.relationship("BacktestResult", back_populates="user", lazy="dynamic", cascade="all, delete-orphan")
    portfolios     = db.relationship("VirtualPortfolio", back_populates="user", lazy="dynamic", cascade="all, delete-orphan")
    shared_analyses = db.relationship("SharedAnalysis", back_populates="user", lazy="dynamic", cascade="all, delete-orphan")
    comments       = db.relationship("AnalysisComment", back_populates="user", lazy="dynamic", cascade="all, delete-orphan")
    likes          = db.relationship("AnalysisLike",   back_populates="user", lazy="dynamic", cascade="all, delete-orphan")
    favorite_tickers = db.relationship("FavoriteTicker", back_populates="user", lazy="dynamic", cascade="all, delete-orphan")
    search_history = db.relationship("SearchHistory",  back_populates="user", lazy="dynamic", cascade="all, delete-orphan")
    app_review     = db.relationship("AppReview", back_populates="user", uselist=False, cascade="all, delete-orphan")

    # ── Métodos de contraseña ──────────────────────────────────────────────
    def set_password(self, password: str) -> None:
        self.password_hash = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        return check_password_hash(self.password_hash, password)

    @staticmethod
    def _hash_token(token: str) -> str:
        return sha256(token.encode("utf-8")).hexdigest()

    @staticmethod
    def _utc_now() -> datetime:
        return datetime.now(timezone.utc)

    @staticmethod
    def _as_utc(value: datetime | None) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

    def create_email_verification_token(self) -> str:
        token = token_urlsafe(40)
        self.email_verification_token_hash = self._hash_token(token)
        self.email_verification_sent_at = self._utc_now()
        return token

    def verify_email_token(self, token: str, max_age_hours: int = 24) -> bool:
        if not token or not self.email_verification_token_hash:
            return False
        if self._hash_token(token) != self.email_verification_token_hash:
            return False
        sent_at = self._as_utc(self.email_verification_sent_at)
        if sent_at and self._utc_now() - sent_at > timedelta(hours=max_age_hours):
            return False
        self.email_verified = True
        self.email_verification_token_hash = None
        self.email_verification_sent_at = None
        return True

    def create_password_reset_token(self) -> str:
        token = token_urlsafe(40)
        self.password_reset_token_hash = self._hash_token(token)
        self.password_reset_sent_at = self._utc_now()
        return token

    def verify_password_reset_token(self, token: str, max_age_minutes: int = 30) -> bool:
        if not token or not self.password_reset_token_hash:
            return False
        if self._hash_token(token) != self.password_reset_token_hash:
            return False
        sent_at = self._as_utc(self.password_reset_sent_at)
        if sent_at and self._utc_now() - sent_at > timedelta(minutes=max_age_minutes):
            return False
        return True

    def clear_password_reset_token(self) -> None:
        self.password_reset_token_hash = None
        self.password_reset_sent_at = None

    @property
    def is_admin(self) -> bool:
        return self.role in ("admin", "global_admin")

    @property
    def is_global_admin(self) -> bool:
        return self.role in ("admin", "global_admin")

    @property
    def is_league_admin(self) -> bool:
        return self.role in ("league_admin", "admin", "global_admin")

    def touch_login(self) -> None:
        """Actualiza last_login al momento actual."""
        self.last_login = datetime.now(timezone.utc)

    def to_dict(self, include_stats: bool = False) -> dict:
        data = {
            "id":         self.id,
            "username":   self.username,
            "email":      self.email,
            "full_name":  self.full_name,
            "avatar_url": self.avatar_url,
            "bio":        self.bio,
            "headline":   self.headline,
            "location":   self.location,
            "website":    self.website,
            "trading_style": self.trading_style,
            "settings": self.settings or {},
            "is_active":  self.is_active,
            "email_verified": self.email_verified,
            "role":         self.role,
            "subscription": self.subscription,
            "subscription_plan": self.subscription,
            "subscription_status": self.subscription_status,
            "internal_coins": int(self.internal_coins or 0),
            "is_blocked":   self.is_blocked,
            "last_login": self.last_login.isoformat() if self.last_login else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "joined_at":  self.created_at.date().isoformat() if self.created_at else None,
            "favorites":  [f.ticker for f in self.favorite_tickers],
        }
        if include_stats:
            data["stats"] = {
                "total_predictions": self.predictions.count(),
                "shared_analyses":   self.shared_analyses.count(),
                "portfolio_count":   self.portfolios.count(),
            }
        return data

    def __repr__(self) -> str:
        return f"<User {self.username} role={self.role}>"


class FavoriteTicker(db.Model):
    __tablename__ = "favorite_tickers"

    id      = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    ticker  = db.Column(db.String(10), nullable=False)
    name    = db.Column(db.String(255))
    sector  = db.Column(db.String(100))
    added_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (db.UniqueConstraint("user_id", "ticker", name="uq_user_ticker"),)

    user = db.relationship("User", back_populates="favorite_tickers")

    def to_dict(self) -> dict:
        return {
            "id":       self.id,
            "ticker":   self.ticker,
            "name":     self.name,
            "sector":   self.sector,
            "added_at": self.added_at.isoformat() if self.added_at else None,
        }

    def __repr__(self) -> str:
        return f"<FavoriteTicker {self.ticker} user={self.user_id}>"
