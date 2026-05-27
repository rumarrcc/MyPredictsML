"""
Modelo: AppReview — valoraciones públicas de la plataforma (una por usuario).
"""
from datetime import datetime, timezone
from app import db


class AppReview(db.Model):
    __tablename__ = "app_reviews"

    id          = db.Column(db.Integer, primary_key=True)
    user_id     = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True)
    stars       = db.Column(db.Integer, nullable=False, default=5)
    role        = db.Column(db.String(80))
    text        = db.Column(db.Text, nullable=False)
    author_name = db.Column(db.String(100))
    created_at  = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at  = db.Column(db.DateTime, onupdate=lambda: datetime.now(timezone.utc))

    user = db.relationship("User", back_populates="app_review", foreign_keys=[user_id])

    def to_dict(self) -> dict:
        from app.models.user import User
        user = User.query.get(self.user_id)
        return {
            "id":          self.id,
            "user_id":     self.user_id,
            "stars":       self.stars,
            "role":        self.role,
            "text":        self.text,
            "author_name": self.author_name or (user.full_name or user.username if user else "Usuario"),
            "author_username": user.username if user else None,
            "verified":    True,
            "created_at":  self.created_at.isoformat() if self.created_at else None,
            "updated_at":  self.updated_at.isoformat() if self.updated_at else None,
        }

    def __repr__(self) -> str:
        return f"<AppReview user={self.user_id} stars={self.stars}>"
