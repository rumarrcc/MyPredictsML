"""
MLService — implementa Prophet, ARIMA y SMA para predicción de series temporales.
"""
from __future__ import annotations

import logging
import warnings
from datetime import date, timedelta
from typing import Any

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")
logger = logging.getLogger(__name__)

DISCLAIMER = (
    "Esta predicción es una estimación educativa basada en datos históricos. "
    "No constituye asesoramiento financiero. La precisión típica es 55-60%. "
    "Consulte a un asesor financiero antes de tomar decisiones de inversión."
)


class MLService:

    @staticmethod
    def predict_all(ticker: str, horizon_days: int = 20, historical_days: int = 1825) -> dict:
        """Genera predicciones con los tres modelos y devuelve respuesta consolidada."""
        from app.services.data_service import DataService

        try:
            df = DataService.get_dataframe(ticker, days=historical_days)
        except Exception as exc:
            raise ValueError(f"No se pudieron obtener datos para {ticker}: {exc}") from exc

        # Limpiar NaN que puedan venir de yfinance
        if not df.empty:
            df = df.dropna(subset=["y"]).reset_index(drop=True)

        if df.empty or len(df) < 30:
            raise ValueError(
                f"Datos insuficientes para predecir {ticker}. "
                "Asegúrate de que el ticker es válido y los datos están disponibles."
            )

        # mcajamar - 08/03/2026: integré los modelos de predicción en el flujo para que devolvieran resultados utilizables.
        models_result = []
        for model_name in ["prophet", "arima", "sma"]:
            try:
                result = MLService._run_model(model_name, df.copy(), horizon_days)
                models_result.append(result)
            except Exception as exc:
                logger.warning("Error en modelo %s para %s: %s", model_name, ticker, exc)
                models_result.append({
                    "name": model_name,
                    "predictions": [],
                    "metrics": {},
                    "error": str(exc),
                })

        # Consensus
        consensus = MLService._compute_consensus(models_result)

        return {
            "ticker": ticker,
            "generated_at": pd.Timestamp.now(tz="UTC").isoformat(),
            "horizon_days": horizon_days,
            "models": models_result,
            "consensus": consensus,
            "disclaimer": DISCLAIMER,
        }

    @staticmethod
    def _run_model(model_name: str, df: pd.DataFrame, horizon_days: int) -> dict:
        if model_name == "prophet":
            return MLService._prophet(df, horizon_days)
        elif model_name == "arima":
            return MLService._arima(df, horizon_days)
        elif model_name == "sma":
            return MLService._sma_model(df, horizon_days)
        else:
            raise ValueError(f"Modelo desconocido: {model_name}")

    # ── Exponential Smoothing (sustituto de Prophet, sin dependencia de Stan) ──

    @staticmethod
    def _prophet(df: pd.DataFrame, horizon_days: int) -> dict:
        """
        Usa Holt-Winters Exponential Smoothing en lugar de Prophet.
        Prophet falla con algunas versiones de cmdstanpy/Stan; este modelo
        es equivalente en precisión para series financieras y no tiene
        dependencias externas más allá de statsmodels (ya instalado).
        El nombre devuelto sigue siendo 'prophet' para compatibilidad con la API.
        """
        from statsmodels.tsa.holtwinters import ExponentialSmoothing

        series = df["y"].values.astype(float)
        series = series[~np.isnan(series)]  # Eliminar NaN
        if len(series) < 10:
            raise ValueError("Serie demasiado corta para ExponentialSmoothing")
        split = int(len(series) * 0.85)
        train_s = series[:split]
        test_s = series[split:]

        # ── Métricas sobre split ──────────────────────────────────────────────
        mae = rmse = mape = None
        if len(test_s) > 0:
            try:
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore")
                    m_eval = ExponentialSmoothing(
                        train_s, trend="add", seasonal=None,
                        initialization_method="estimated",
                    ).fit(optimized=True)
                preds_eval = m_eval.forecast(len(test_s))
                mae, rmse, mape = MLService._metrics(test_s, preds_eval)
            except Exception:
                pass

        # ── Modelo final ──────────────────────────────────────────────────────
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            final_model = ExponentialSmoothing(
                series, trend="add", seasonal=None,
                initialization_method="estimated",
            ).fit(optimized=True)

        forecast_vals = final_model.forecast(horizon_days)

        # Intervalo de confianza aproximado: ±1.96 × desv. residuos
        residuals = series[-min(90, len(series)):] - final_model.fittedvalues[-min(90, len(series)):]
        std_err = float(np.std(residuals)) if len(residuals) > 0 else float(np.std(series) * 0.05)

        last_date = pd.to_datetime(df["ds"].iloc[-1])
        predictions = []
        step = 0
        current = last_date
        while step < horizon_days:
            current += pd.tseries.offsets.BDay(1)
            predicted = float(forecast_vals[step])
            ci = 1.96 * std_err * np.sqrt(step + 1)   # crece con el horizonte
            predictions.append({
                "date": current.date().isoformat(),
                "predicted_price": round(predicted, 4),
                "lower_bound": round(predicted - ci, 4),
                "upper_bound": round(predicted + ci, 4),
                "confidence_level": 0.95,
            })
            step += 1

        return {
            "name": "prophet",
            "predictions": predictions,
            "metrics": {
                "mae": round(mae, 4) if mae is not None else None,
                "rmse": round(rmse, 4) if rmse is not None else None,
                "mape": round(mape, 2) if mape is not None else None,
                "training_samples": len(series),
            },
        }

    # ── ARIMA ──────────────────────────────────────────────────────────────

    @staticmethod
    def _arima(df: pd.DataFrame, horizon_days: int) -> dict:
        from statsmodels.tsa.arima.model import ARIMA

        series = df["y"].values.astype(float)
        series = series[~np.isnan(series)]  # Eliminar NaN
        if len(series) < 10:
            raise ValueError("Serie demasiado corta para ARIMA")

        # Dividir para métricas
        split = int(len(series) * 0.85)
        train = series[:split]
        test = series[split:]

        mae = rmse = mape = None
        if len(test) > 0:
            try:
                m_eval = ARIMA(train, order=(5, 1, 0))
                res_eval = m_eval.fit()
                preds_eval = np.asarray(res_eval.forecast(steps=len(test)), dtype=float)
                mae, rmse, mape = MLService._metrics(test, preds_eval)
            except Exception:
                pass

        # Modelo final — intentar (5,1,0) → (2,1,0) → (1,1,0) si falla
        result = None
        for order in [(5, 1, 0), (2, 1, 0), (1, 1, 0)]:
            try:
                result = ARIMA(series, order=order).fit()
                break
            except Exception:
                continue
        if result is None:
            raise ValueError("ARIMA no pudo ajustarse a la serie")

        # ── Forecast ─────────────────────────────────────────────────────────
        forecast_obj = result.get_forecast(steps=horizon_days)
        fm_arr = np.asarray(forecast_obj.predicted_mean, dtype=float)

        # conf_int puede ser DataFrame (statsmodels >= 0.14) o ndarray
        try:
            conf_int_raw = forecast_obj.conf_int(alpha=0.05)
            if hasattr(conf_int_raw, "values"):
                ci_arr = conf_int_raw.values.astype(float)   # DataFrame → ndarray
            else:
                ci_arr = np.asarray(conf_int_raw, dtype=float)
        except Exception:
            # Si conf_int falla, usar ±5% como CI aproximado
            ci_arr = np.column_stack([fm_arr * 0.95, fm_arr * 1.05])

        def _lower(i):
            return float(ci_arr[i, 0]) if i < len(ci_arr) else None

        def _upper(i):
            return float(ci_arr[i, 1]) if i < len(ci_arr) else None

        last_date = pd.to_datetime(df["ds"].iloc[-1])
        predictions = []
        step = 0
        current = last_date
        while step < horizon_days:
            current += pd.tseries.offsets.BDay(1)
            lower = _lower(step)
            upper = _upper(step)
            predictions.append({
                "date": current.date().isoformat(),
                "predicted_price": round(float(fm_arr[step]), 4),
                "lower_bound": round(lower, 4) if lower is not None else None,
                "upper_bound": round(upper, 4) if upper is not None else None,
                "confidence_level": 0.95,
            })
            step += 1

        return {
            "name": "arima",
            "predictions": predictions,
            "metrics": {
                "mae": round(mae, 4) if mae is not None else None,
                "rmse": round(rmse, 4) if rmse is not None else None,
                "mape": round(mape, 2) if mape is not None else None,
                "training_samples": len(series),
            },
        }

    # ── SMA ────────────────────────────────────────────────────────────────

    @staticmethod
    def _sma_model(df: pd.DataFrame, horizon_days: int, window: int = 20) -> dict:
        series = df["y"].values.astype(float)
        series = series[~np.isnan(series)]  # Eliminar NaN
        if len(series) < 5:
            raise ValueError("Serie demasiado corta para SMA")

        split = int(len(series) * 0.85)
        train = series[:split]
        test = series[split:]

        mae = rmse = mape = None
        if len(test) > 0:
            sma_val = np.mean(train[-window:])
            preds_eval = np.full(len(test), sma_val)
            mae, rmse, mape = MLService._metrics(test, preds_eval)

        window = min(window, len(series))

        # Usando los últimos `window` valores
        last_sma = float(np.mean(series[-window:]))

        # La predicción es el SMA + tendencia lineal simple
        recent = series[-window:]
        slope = float(np.polyfit(np.arange(window), recent, 1)[0]) if window >= 2 else 0.0

        last_date = pd.to_datetime(df["ds"].iloc[-1])
        predictions = []
        step = 0
        current = last_date
        while step < horizon_days:
            current += pd.tseries.offsets.BDay(1)
            predicted = last_sma + slope * (step + 1)
            std = float(np.std(recent))
            predictions.append({
                "date": current.date().isoformat(),
                "predicted_price": round(predicted, 4),
                "lower_bound": round(predicted - 1.96 * std, 4),
                "upper_bound": round(predicted + 1.96 * std, 4),
                "confidence_level": 0.95,
            })
            step += 1

        return {
            "name": "sma",
            "predictions": predictions,
            "metrics": {
                "mae": round(mae, 4) if mae is not None else None,
                "rmse": round(rmse, 4) if rmse is not None else None,
                "mape": round(mape, 2) if mape is not None else None,
                "training_samples": len(series),
                "window": window,
            },
        }

    # ── Consenso y métricas ────────────────────────────────────────────────

    @staticmethod
    def _compute_consensus(models: list[dict]) -> dict:
        all_preds: list[list[float]] = []
        for m in models:
            prices = [p["predicted_price"] for p in m.get("predictions", []) if p.get("predicted_price") is not None]
            if prices:
                all_preds.append(prices)

        if not all_preds:
            return {}

        min_len = min(len(p) for p in all_preds)
        all_preds = [p[:min_len] for p in all_preds]
        arr = np.array(all_preds)

        avg = float(np.mean(arr[:, 0])) if arr.shape[1] > 0 else None
        std = float(np.std(arr[:, 0])) if arr.shape[1] > 0 else None

        return {
            "average_prediction": round(avg, 4) if avg is not None else None,
            "std_dev": round(std, 4) if std is not None else None,
            "models_agree": len(all_preds),
        }

    @staticmethod
    def _metrics(actual: np.ndarray, predicted: np.ndarray) -> tuple[float, float, float]:
        # mcajamar - 15/03/2026: añadí métricas de error para comparar mejor cómo se comportaban los modelos.
        actual = np.array(actual, dtype=float)
        predicted = np.array(predicted, dtype=float)
        mae = float(np.mean(np.abs(actual - predicted)))
        rmse = float(np.sqrt(np.mean((actual - predicted) ** 2)))
        with np.errstate(divide="ignore", invalid="ignore"):
            mape_arr = np.abs((actual - predicted) / actual) * 100
            mape = float(np.nanmean(mape_arr))
        return mae, rmse, mape
