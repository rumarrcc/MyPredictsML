"""
Configuración de Celery para MyPredicts.
Uso:
    celery -A app.tasks.celery_app worker --loglevel=info
    celery -A app.tasks.celery_app beat --loglevel=info      (scheduler)
    celery -A app.tasks.celery_app flower                    (monitor web)
"""
import os
from celery import Celery
from celery.schedules import crontab

# ── Crear instancia Celery (sin app Flask aún) ─────────────────────────────
celery_app = Celery("stockpredictor", include=["app.tasks.scheduled_tasks"])

celery_app.conf.update(
    broker_url=os.environ.get("CELERY_BROKER_URL", "redis://localhost:6379/0"),
    result_backend=os.environ.get("CELERY_RESULT_BACKEND", "redis://localhost:6379/0"),
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    # Reintentos por defecto
    task_max_retries=3,
    task_default_retry_delay=60,
    # Rutas de tareas
    task_routes={
        "app.tasks.scheduled_tasks.check_alerts_task": {"queue": "alerts"},
        "app.tasks.scheduled_tasks.update_stock_data_task": {"queue": "data"},
        "app.tasks.scheduled_tasks.update_portfolio_prices_task": {"queue": "data"},
    },
)

# ── Programación periódica (Celery Beat) ──────────────────────────────────
celery_app.conf.beat_schedule = {
    # Verificar alertas cada 15 minutos durante horas de mercado
    "check-alerts-every-15-min": {
        "task": "app.tasks.scheduled_tasks.check_alerts_task",
        "schedule": crontab(minute="*/15", hour="14-21"),   # UTC: 9:30-16:00 EST
    },
    # Actualizar precios de portafolios cada hora
    "update-portfolios-hourly": {
        "task": "app.tasks.scheduled_tasks.update_portfolio_prices_task",
        "schedule": crontab(minute=0, hour="14-21"),
    },
    # Refrescar datos bursátiles populares cada día a las 22:00 UTC
    "refresh-popular-stocks-daily": {
        "task": "app.tasks.scheduled_tasks.update_stock_data_task",
        "schedule": crontab(minute=0, hour=22),
    },
    # Calcular indicadores técnicos cada noche
    "calculate-indicators-nightly": {
        "task": "app.tasks.scheduled_tasks.calculate_all_indicators_task",
        "schedule": crontab(minute=30, hour=22),
    },
    # Expirar recompensas temporales vencidas cada madrugada
    "cleanup-rewards-nightly": {
        "task": "app.tasks.scheduled_tasks.cleanup_rewards_task",
        "schedule": crontab(minute=15, hour=2),
    },
}


def init_celery(app) -> Celery:
    """Vincula Celery al contexto de la app Flask (para acceso a BD, config, etc.)."""

    class FlaskTask(celery_app.Task):
        def __call__(self, *args, **kwargs):
            with app.app_context():
                return self.run(*args, **kwargs)

    celery_app.Task = FlaskTask
    celery_app.conf.update(app.config)
    return celery_app

