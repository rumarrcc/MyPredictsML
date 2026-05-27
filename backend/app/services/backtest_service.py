"""
BacktestService — simula estrategias de trading usando predicciones históricas.
"""
from __future__ import annotations

import logging
import time
from datetime import date, timedelta
from typing import Any

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)


class BacktestService:

    @staticmethod
    def run(
        ticker: str,
        start_date: date,
        end_date: date,
        models: list[str],
        initial_capital: float = 10000.0,
        trade_type: str = "long",
        position_size_percent: float = 100.0,
    ) -> dict:
        """
        Ejecuta backtesting para múltiples modelos.
        Estrategia: si predicción siguiente día > precio actual → comprar (long).
        """
        from app.services.data_service import DataService
        t_start = time.time()

        # mcajamar - 22/03/2026: monté la lógica del backtesting para simular operaciones y calcular resultados.
        # Obtener datos historicos del periodo + margen de entrenamiento.
        # mcajamar: el backtest prepara su propio historico para no depender de una prediccion previa.
        extra_days = 365  # Para entrenar modelos
        train_start = start_date - timedelta(days=extra_days)

        df = DataService.get_dataframe_range(
            ticker=ticker,
            start_date=train_start,
            end_date=end_date,
            min_rows=40,
        )
        if df.empty:
            raise ValueError(
                f"No hay datos historicos para {ticker}. "
                "Revisa el ticker o intenta de nuevo si el proveedor de mercado esta limitado."
            )

        df = df.sort_values("ds").reset_index(drop=True)
        data_start = df["ds"].dt.date.min()
        data_end = df["ds"].dt.date.max()

        # Filtrar período de backtest
        bt_mask = (df["ds"].dt.date >= start_date) & (df["ds"].dt.date <= end_date)
        bt_df = df[bt_mask].reset_index(drop=True)

        if len(bt_df) < 10:
            raise ValueError(
                f"Insuficientes datos de trading para el periodo {start_date} - {end_date}. "
                f"El backend preparo datos de {data_start} a {data_end}, pero no hay suficientes sesiones "
                "dentro del rango elegido."
            )

        results = {}
        equity_curve: dict[str, list] = {}

        for model_name in models:
            try:
                model_result = BacktestService._simulate_model(
                    model_name=model_name,
                    full_df=df,
                    bt_df=bt_df,
                    initial_capital=initial_capital,
                    trade_type=trade_type,
                    position_size_percent=position_size_percent,
                )
                equity_curve[model_name] = model_result.pop("equity_curve_values", [])
                # Separar pred_vs_actual del bloque principal para no duplicar en results
                model_result.pop("pred_vs_actual", None)
                results[model_name] = model_result
            except Exception as exc:
                logger.warning("Backtest error modelo %s: %s", model_name, exc)
                results[model_name] = {"error": str(exc)}

        # Curva de equity combinada
        combined_equity = BacktestService._merge_equity_curves(bt_df, equity_curve)

        # Comparativa
        comparison = BacktestService._compare_models(results)

        t_end = time.time()

        return BacktestService._json_safe({
            "ticker": ticker,
            "period": f"{start_date} to {end_date} ({len(bt_df)} trading days)",
            "results": results,
            "comparison": comparison,
            "equity_curve": combined_equity,
            "metadata": {
                "computation_time_seconds": round(t_end - t_start, 2),
                "completed_at": pd.Timestamp.now(tz="UTC").isoformat(),
                "initial_capital": initial_capital,
                "trade_type": trade_type,
                "market_data_rows": int(len(df)),
                "market_data_range": f"{data_start} to {data_end}",
                "market_data_prepared": True,
            },
        })

    @staticmethod
    def _simulate_model(
        model_name: str,
        full_df: pd.DataFrame,
        bt_df: pd.DataFrame,
        initial_capital: float,
        trade_type: str,
        position_size_percent: float,
    ) -> dict:
        """Simula la estrategia día a día para un modelo."""
        from app.services.ml_service import MLService

        capital = initial_capital
        position = 0.0  # Unidades en cartera
        entry_price = 0.0
        trades: list[dict] = []
        equity_values = [capital]
        wins = losses = 0
        max_capital = capital
        max_drawdown = 0.0

        # ── Recolección de predicciones para métricas de precisión ────────
        pred_records: list[dict] = []   # {date, predicted, actual, current}

        prices = bt_df["y"].values
        dates = bt_df["ds"].dt.date.tolist()

        for i in range(len(bt_df) - 1):
            current_price = prices[i]
            next_price = prices[i + 1]

            # Entrenar con datos anteriores al día actual (walk-forward)
            train_df = full_df[full_df["ds"].dt.date < dates[i]].tail(500)
            if len(train_df) < 30:
                equity_values.append(capital + position * current_price if position else capital)
                continue

            # Predicción para mañana
            try:
                pred_price = BacktestService._quick_predict(model_name, train_df)
            except Exception:
                equity_values.append(capital + position * current_price if position else capital)
                continue

            # Guardar par predicción / real para métricas de precisión
            pred_records.append({
                "date":      dates[i + 1].isoformat(),
                "predicted": round(float(pred_price), 4),
                "actual":    round(float(next_price), 4),
                "current":   round(float(current_price), 4),
            })

            # ── Lógica de trading ──────────────────────────────────────────
            position_size = capital * (position_size_percent / 100)

            if trade_type in ("long", "both"):
                if pred_price > current_price and position == 0:
                    # Comprar
                    units = position_size / current_price
                    position = units
                    entry_price = current_price
                    capital -= units * current_price
                elif pred_price <= current_price and position > 0:
                    # Vender
                    pnl = position * (next_price - entry_price)
                    capital += position * next_price
                    won = pnl > 0
                    trades.append({
                        "entry": entry_price,
                        "exit": next_price,
                        "pnl": round(pnl, 2),
                        "won": won,
                    })
                    if won:
                        wins += 1
                    else:
                        losses += 1
                    position = 0.0

            total_value = capital + (position * next_price if position else 0)
            equity_values.append(round(total_value, 2))

            if total_value > max_capital:
                max_capital = total_value
            drawdown = (max_capital - total_value) / max_capital if max_capital > 0 else 0
            if drawdown > max_drawdown:
                max_drawdown = drawdown

        # Cerrar posición abierta al final
        if position > 0:
            last_price = prices[-1]
            pnl = position * (last_price - entry_price)
            capital += position * last_price
            won = pnl > 0
            trades.append({"entry": entry_price, "exit": last_price, "pnl": round(pnl, 2), "won": won})
            if won:
                wins += 1
            else:
                losses += 1
            equity_values.append(round(capital, 2))

        final_capital = equity_values[-1] if equity_values else initial_capital
        total_return = (final_capital - initial_capital) / initial_capital if initial_capital else 0
        num_trades = wins + losses
        win_rate = wins / num_trades if num_trades else 0

        win_pnls = [t["pnl"] for t in trades if t["won"]]
        loss_pnls = [t["pnl"] for t in trades if not t["won"]]
        avg_win = float(np.mean(win_pnls)) if win_pnls else 0
        avg_loss = float(np.mean(loss_pnls)) if loss_pnls else 0
        profit_factor = abs(sum(win_pnls) / sum(loss_pnls)) if loss_pnls and sum(loss_pnls) != 0 else 0

        # Sharpe y Sortino (diarios)
        returns = np.diff(equity_values) / np.array(equity_values[:-1]) if len(equity_values) > 1 else []
        sharpe = (np.mean(returns) / np.std(returns) * np.sqrt(252)) if len(returns) > 1 and np.std(returns) > 0 else 0
        neg_returns = returns[returns < 0] if len(returns) > 0 else []
        sortino = (np.mean(returns) / np.std(neg_returns) * np.sqrt(252)) if len(neg_returns) > 0 else 0

        # Racha máxima
        streak = 0
        max_w = max_l = 0
        prev = None
        for t in trades:
            if t["won"]:
                if prev == "win":
                    streak += 1
                else:
                    streak = 1
                max_w = max(max_w, streak)
                prev = "win"
            else:
                if prev == "loss":
                    streak += 1
                else:
                    streak = 1
                max_l = max(max_l, streak)
                prev = "loss"

        # ── Métricas de precisión predictiva ─────────────────────────────
        accuracy_metrics = BacktestService._compute_accuracy_metrics(pred_records)

        return {
            "total_return": round(total_return, 4),
            "win_rate": round(win_rate, 4),
            "num_trades": num_trades,
            "winning_trades": wins,
            "losing_trades": losses,
            "max_consecutive_wins": max_w,
            "max_consecutive_losses": max_l,
            "max_drawdown": round(-max_drawdown, 4),
            "sharpe_ratio": round(float(sharpe), 4),
            "sortino_ratio": round(float(sortino), 4),
            "profit_factor": round(profit_factor, 4),
            "average_win": round(avg_win, 2),
            "average_loss": round(avg_loss, 2),
            "final_capital": round(final_capital, 2),
            "equity_curve_values": equity_values,
            # Precisión predictiva
            "accuracy_metrics": accuracy_metrics,
            "pred_vs_actual": pred_records,   # muestreado para no sobrecargar
        }

    @staticmethod
    def _quick_predict(model_name: str, df: pd.DataFrame) -> float:
        """Predicción rápida de un paso para walk-forward."""
        series = df["y"].values.astype(float)
        # Filtrar NaN — pueden aparecer si yfinance devolvió valores vacíos
        series = series[~np.isnan(series)]
        if len(series) < 5:
            raise ValueError("Serie demasiado corta tras filtrar NaN")

        if model_name == "sma":
            window = min(20, len(series))
            recent = series[-window:]
            if window >= 2:
                slope = float(np.polyfit(np.arange(window), recent, 1)[0])
            else:
                slope = 0.0
            return float(np.mean(recent)) + slope

        elif model_name == "arima":
            from statsmodels.tsa.arima.model import ARIMA
            try:
                m = ARIMA(series[-100:], order=(2, 1, 0))
                res = m.fit()
                return float(res.forecast(steps=1)[0])
            except Exception:
                return float(series[-1])

        elif model_name == "prophet":
            # Usa ExponentialSmoothing en lugar de Prophet para evitar errores de Stan
            from statsmodels.tsa.holtwinters import ExponentialSmoothing
            import warnings
            s = series[-200:]
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                m = ExponentialSmoothing(s, trend="add", seasonal=None,
                                         initialization_method="estimated").fit(optimized=True)
            fc = m.forecast(1)
            return float(fc[0])

        return float(series[-1])

    @staticmethod
    def _compute_accuracy_metrics(pred_records: list[dict]) -> dict:
        """
        Calcula MAE, RMSE, MAPE y Directional Accuracy a partir de los pares
        (predicted, actual) recopilados durante el walk-forward.
        """
        _empty = {
            "mae": None, "rmse": None, "mape": None,
            "directional_accuracy": None, "n_predictions": 0, "sampled_curve": [],
        }
        if not pred_records:
            return _empty

        predicted = np.array([r["predicted"] for r in pred_records], dtype=float)
        actual    = np.array([r["actual"]    for r in pred_records], dtype=float)
        current   = np.array([r["current"]   for r in pred_records], dtype=float)

        errors     = predicted - actual
        abs_errors = np.abs(errors)

        mae  = float(np.mean(abs_errors))
        rmse = float(np.sqrt(np.mean(errors ** 2)))

        # MAPE — evitar división por 0
        nonzero_mask = actual != 0
        mape = float(np.mean(abs_errors[nonzero_mask] / np.abs(actual[nonzero_mask])) * 100) if nonzero_mask.any() else 0.0

        # Directional accuracy: ¿acertó el modelo la dirección del movimiento?
        pred_dir   = np.sign(predicted - current)   # +1 predijo subida, -1 bajada
        actual_dir = np.sign(actual    - current)   # +1 real subida,    -1 bajada
        # Sólo contar los días donde hubo movimiento real
        has_movement = actual_dir != 0
        if has_movement.any():
            dir_accuracy = float(np.mean(pred_dir[has_movement] == actual_dir[has_movement]) * 100)
        else:
            dir_accuracy = 0.0

        # Muestreo para el gráfico: máximo 120 puntos (evitar payloads enormes)
        step = max(1, len(pred_records) // 120)
        sampled = pred_records[::step]

        return {
            "mae":                  round(mae,          4),
            "rmse":                 round(rmse,         4),
            "mape":                 round(mape,         2),
            "directional_accuracy": round(dir_accuracy, 2),
            "n_predictions":        len(pred_records),
            "sampled_curve":        sampled,          # array para el gráfico pred vs real
        }

    @staticmethod
    def _merge_equity_curves(bt_df: pd.DataFrame, equity_curve: dict) -> list[dict]:
        dates = bt_df["ds"].dt.date.tolist()
        result = []
        for i, d in enumerate(dates):
            row: dict[str, Any] = {"date": d.isoformat()}
            for model_name, values in equity_curve.items():
                if i < len(values):
                    row[model_name] = values[i]
            result.append(row)
        return result

    @staticmethod
    def _compare_models(results: dict) -> dict:
        valid = {k: v for k, v in results.items() if "total_return" in v}
        if not valid:
            return {}
        best = max(valid, key=lambda k: valid[k]["total_return"])
        worst = min(valid, key=lambda k: valid[k]["total_return"])
        return {
            "best_model": best,
            "best_return": valid[best]["total_return"],
            "worst_model": worst,
            "worst_return": valid[worst]["total_return"],
        }

    @staticmethod
    def _json_safe(value):
        """Convierte tipos numpy/pandas a tipos nativos antes de jsonify/JSON DB."""
        if isinstance(value, dict):
            return {k: BacktestService._json_safe(v) for k, v in value.items()}
        if isinstance(value, list):
            return [BacktestService._json_safe(v) for v in value]
        if isinstance(value, tuple):
            return [BacktestService._json_safe(v) for v in value]
        if isinstance(value, np.generic):
            return value.item()
        if isinstance(value, pd.Timestamp):
            return value.isoformat()
        return value
