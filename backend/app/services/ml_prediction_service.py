"""Small ML facade that records admin-triggered model runs."""
from datetime import datetime, timezone

from app import db
from app.models.economy import MLModelRun
from app.models.ticker import Ticker


def utcnow():
    return datetime.now(timezone.utc)


class MLPredictionService:
    @staticmethod
    def run_prediction(ticker_id: int):
        ticker = Ticker.query.get(ticker_id)
        if not ticker:
            raise ValueError("Ticker no encontrado")
        run = MLModelRun(ticker_id=ticker.id, model_name="existing-ml-service", status="running", input_window=365)
        db.session.add(run)
        db.session.flush()
        try:
            from app.services.ml_service import MLService
            result = MLService.predict_all(ticker.symbol)
            predictions = result.get("predictions") or result.get("items") or []
            first = predictions[0] if predictions else result
            prediction_value = first.get("predicted_price") or first.get("prediction")
            current = float(ticker.last_price or 0)
            run.prediction_value = prediction_value
            if prediction_value and current:
                run.prediction_direction = "up" if float(prediction_value) >= current else "down"
            run.mae = result.get("mae")
            run.rmse = result.get("rmse")
            run.mape = result.get("mape")
            run.directional_accuracy = result.get("directional_accuracy")
            run.metadata_json = result
            run.status = "completed"
        except Exception as exc:
            run.status = "failed"
            run.error_message = str(exc)
        run.finished_at = utcnow()
        db.session.commit()
        return run

    @staticmethod
    def store_model_run(data: dict):
        run = MLModelRun(**data)
        db.session.add(run)
        db.session.commit()
        return run
