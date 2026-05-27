"""
Modelos: SharedAnalysis, AnalysisComment, AnalysisLike, SearchHistory
"""
from datetime import datetime, timezone
from app import db


class SharedAnalysis(db.Model):
    __tablename__ = "shared_analysis"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    ticker = db.Column(db.String(10), nullable=False, index=True)
    title = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text)
    models_compared = db.Column(db.JSON)            # lista de strings
    prediction_summary = db.Column(db.JSON)
    technical_summary = db.Column(db.Text)
    backtest_id = db.Column(db.Integer, db.ForeignKey("backtest_results.id"), nullable=True)
    likes_count = db.Column(db.Integer, default=0)
    views_count = db.Column(db.Integer, default=0)
    comments_count = db.Column(db.Integer, default=0)
    is_public = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    user = db.relationship("User", back_populates="shared_analyses")
    backtest_result = db.relationship("BacktestResult", back_populates="shared_analyses")
    comments = db.relationship(
        "AnalysisComment",
        back_populates="analysis",
        lazy="dynamic",
        cascade="all, delete-orphan",
    )
    likes = db.relationship(
        "AnalysisLike",
        back_populates="analysis",
        lazy="dynamic",
        cascade="all, delete-orphan",
    )

    def to_dict(self, include_user: bool = True) -> dict:
        data = {
            "id": self.id,
            "user_id": self.user_id,
            "ticker": self.ticker,
            "title": self.title,
            "description": self.description,
            "models_compared": self.models_compared,
            "prediction_summary": self.prediction_summary,
            "technical_summary": self.technical_summary,
            "backtest_id": self.backtest_id,
            "likes_count": self.likes_count,
            "views_count": self.views_count,
            "comments_count": self.comments_count,
            "is_public": self.is_public,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
        if include_user and self.user:
            data["user"] = {
                "id": self.user.id,
                "username": self.user.username,
                "full_name": self.user.full_name,
                "avatar_url": self.user.avatar_url,
            }
        return data

    def __repr__(self) -> str:
        return f"<SharedAnalysis {self.ticker} '{self.title}'>"


class AnalysisComment(db.Model):
    __tablename__ = "analysis_comments"

    id = db.Column(db.Integer, primary_key=True)
    analysis_id = db.Column(db.Integer, db.ForeignKey("shared_analysis.id", ondelete="CASCADE"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    comment = db.Column(db.Text, nullable=False)
    likes_count = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    analysis = db.relationship("SharedAnalysis", back_populates="comments")
    user = db.relationship("User", back_populates="comments")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "analysis_id": self.analysis_id,
            "user": {
                "id": self.user.id,
                "username": self.user.username,
            } if self.user else None,
            "comment": self.comment,
            "likes_count": self.likes_count,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class AnalysisLike(db.Model):
    __tablename__ = "analysis_likes"

    id = db.Column(db.Integer, primary_key=True)
    analysis_id = db.Column(db.Integer, db.ForeignKey("shared_analysis.id", ondelete="CASCADE"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (db.UniqueConstraint("analysis_id", "user_id", name="uq_analysis_user_like"),)

    analysis = db.relationship("SharedAnalysis", back_populates="likes")
    user = db.relationship("User", back_populates="likes")


class SearchHistory(db.Model):
    __tablename__ = "search_history"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    ticker = db.Column(db.String(10))
    search_type = db.Column(db.String(50))  # prediction | analysis | backtest
    searched_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    user = db.relationship("User", back_populates="search_history")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "ticker": self.ticker,
            "search_type": self.search_type,
            "searched_at": self.searched_at.isoformat() if self.searched_at else None,
        }
