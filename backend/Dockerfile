FROM python:3.12-slim

WORKDIR /app

RUN pip install --no-cache-dir uv

COPY pyproject.toml ./
COPY app ./app
COPY rag ./rag
COPY agent ./agent

# The app applies pending migrations on startup, so the image needs the
# revision scripts and their config, not just the package. Without these,
# a container starts and immediately fails resolving alembic.ini.
COPY alembic.ini ./
COPY alembic ./alembic

RUN uv pip install --system --no-cache .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
