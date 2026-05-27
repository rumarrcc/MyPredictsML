"""
Punto de entrada principal - MyPredicts Backend.
Ejecutar con:
    py run.py
"""
import os
import sys
import logging


console_handler = logging.StreamHandler(sys.stdout)
console_handler.setLevel(logging.DEBUG)
console_handler.setFormatter(
    logging.Formatter(
        "%(asctime)s [%(levelname)s] %(name)s - %(message)s",
        datefmt="%H:%M:%S",
    )
)

root_logger = logging.getLogger()
root_logger.setLevel(logging.DEBUG)
root_logger.addHandler(console_handler)

logging.getLogger("werkzeug").setLevel(logging.INFO)
logging.getLogger("sqlalchemy.engine").setLevel(logging.INFO)
logging.getLogger("sqlalchemy.pool").setLevel(logging.WARNING)
logging.getLogger("urllib3").setLevel(logging.WARNING)
logging.getLogger("yfinance").setLevel(logging.INFO)
logging.getLogger("peewee").setLevel(logging.WARNING)
logging.getLogger("celery").setLevel(logging.INFO)

from app import create_app
from app.tasks.celery_app import init_celery


app = create_app(os.environ.get("FLASK_ENV", "development"))
celery = init_celery(app)


if __name__ == "__main__":
    host = os.environ.get("FLASK_HOST", "0.0.0.0")
    port = int(os.environ.get("FLASK_PORT", 5000))
    debug = os.environ.get("FLASK_ENV", "development") == "development"

    print(f"MyPredicts API corriendo en http://{host}:{port}")
    print(f"   Entorno: {os.environ.get('FLASK_ENV', 'development')}")
    print(f"   Debug: {debug}")
    print("   BD: usa 'py manage_db.py init' o 'py manage_db.py reset --yes' para preparar el esquema")

    app.run(host=host, port=port, debug=debug)
