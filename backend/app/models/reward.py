"""
Modelos de ruleta diaria, recompensas y cupones.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

from app import db


class RewardGrant(db.Model):
    __tablename__ = "reward_grants"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    reward_type = db.Column(db.String(40), nullable=False, index=True)
    reward_value = db.Column(db.String(80))
    source = db.Column(db.String(20), default="wheel", nullable=False)
    status = db.Column(db.String(20), default="active", nullable=False, index=True)
    granted_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    expires_at = db.Column(db.DateTime, index=True)
    metadata_json = db.Column("metadata", db.Text)

    user = db.relationship("User", backref=db.backref("reward_grants", lazy="dynamic", cascade="all, delete-orphan"))

    def get_metadata(self) -> dict:
        if not self.metadata_json:
            return {}
        try:
            return json.loads(self.metadata_json)
        except Exception:
            return {}

    def set_metadata(self, data: dict | None) -> None:
        self.metadata_json = json.dumps(data or {})

    @property
    def is_active_now(self) -> bool:
        now = datetime.now(timezone.utc)
        expires = self.expires_at
        if expires and expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        return self.status == "active" and (expires is None or expires > now)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "reward_type": self.reward_type,
            "reward_value": self.reward_value,
            "source": self.source,
            "status": self.status,
            "granted_at": self.granted_at.isoformat() if self.granted_at else None,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "metadata": self.get_metadata(),
            "is_active": self.is_active_now,
        }


class WheelSpin(db.Model):
    __tablename__ = "wheel_spins"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    spin_date = db.Column(db.Date, nullable=False, index=True)
    spin_number = db.Column(db.Integer, default=1, nullable=False)
    reward_type = db.Column(db.String(40), nullable=False)
    reward_value = db.Column(db.String(80))
    reward_grant_id = db.Column(db.Integer, db.ForeignKey("reward_grants.id", ondelete="SET NULL"))
    is_bonus_spin = db.Column(db.Boolean, default=False, nullable=False)
    probability_snapshot = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), index=True)

    user = db.relationship("User", backref=db.backref("wheel_spins", lazy="dynamic", cascade="all, delete-orphan"))
    reward_grant = db.relationship("RewardGrant")

    __table_args__ = (
        db.UniqueConstraint("user_id", "spin_date", "spin_number", name="uq_wheel_user_date_spin"),
        db.Index("ix_wheel_user_date", "user_id", "spin_date"),
    )

    def get_probability_snapshot(self) -> dict:
        if not self.probability_snapshot:
            return {}
        try:
            return json.loads(self.probability_snapshot)
        except Exception:
            return {}

    def set_probability_snapshot(self, data: dict | None) -> None:
        self.probability_snapshot = json.dumps(data or {})

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "spin_date": self.spin_date.isoformat() if self.spin_date else None,
            "spin_number": self.spin_number,
            "reward_type": self.reward_type,
            "reward_value": self.reward_value,
            "reward_grant_id": self.reward_grant_id,
            "is_bonus_spin": self.is_bonus_spin,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class DiscountCoupon(db.Model):
    __tablename__ = "discount_coupons"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    code = db.Column(db.String(40), unique=True, nullable=False, index=True)
    discount_percent = db.Column(db.Integer, nullable=False)
    source = db.Column(db.String(20), default="wheel", nullable=False)
    is_used = db.Column(db.Boolean, default=False, nullable=False, index=True)
    expires_at = db.Column(db.DateTime, nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), index=True)

    user = db.relationship("User", backref=db.backref("discount_coupons", lazy="dynamic", cascade="all, delete-orphan"))

    @property
    def is_active(self) -> bool:
        expires = self.expires_at
        if expires and expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        return not self.is_used and expires > datetime.now(timezone.utc)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "code": self.code,
            "discount_percent": self.discount_percent,
            "source": self.source,
            "is_used": self.is_used,
            "is_active": self.is_active,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
