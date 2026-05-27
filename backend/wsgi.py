"""
Punto de entrada WSGI para producción (Gunicorn, uWSGI, etc.)
Uso:
    gunicorn "wsgi:app" --workers 4 --bind 0.0.0.0:5000
"""
import os

os.environ.setdefault("FLASK_ENV", "production")

from app import create_app
from app.tasks.celery_app import init_celery

app = create_app(os.environ["FLASK_ENV"])
celery = init_celery(app)
