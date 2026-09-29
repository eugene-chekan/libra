# syntax=docker/dockerfile:1
#
# The context is the repository root, because the client is built from web/:
#
#   docker build -f backend/Dockerfile .
#
# scripts/docker-compose.yml does this for you.
#
# Four stages. The image gets the same wheel that scripts/run.sh builds, so a
# file missing from the wheel fails here as well.

ARG PYTHON_VERSION=3.12
ARG UV_VERSION=0.12.20

# 1. The client. It runs on the CPU of the build machine, not the target's, so
#    an arm64 image does not run npm under emulation.
FROM --platform=$BUILDPLATFORM node:22-slim AS client
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# 2. The wheel. It is plain Python, so the build machine builds it too. The
#    client goes into app/web, where the wheel picks it up.
FROM --platform=$BUILDPLATFORM python:${PYTHON_VERSION}-slim AS wheel
ARG UV_VERSION
RUN pip install --no-cache-dir uv==${UV_VERSION}
WORKDIR /src
COPY backend/pyproject.toml backend/alembic.ini ./
COPY backend/alembic ./alembic
COPY backend/app ./app
COPY backend/rag ./rag
COPY backend/agent ./agent
COPY --from=client /web/dist ./app/web
RUN uv build --wheel --out-dir /dist

# 3. The virtual environment, on the target CPU, because some dependencies ship
#    compiled code. Versions come from uv.lock. That layer comes before the
#    wheel, so a code change does not reinstall the dependencies.
FROM python:${PYTHON_VERSION}-slim AS venv
ARG UV_VERSION
RUN pip install --no-cache-dir uv==${UV_VERSION}
ENV UV_PROJECT_ENVIRONMENT=/opt/venv \
    UV_PYTHON_DOWNLOADS=never \
    UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1
WORKDIR /src
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY --from=wheel /dist /dist
RUN uv pip install --python /opt/venv/bin/python --no-deps /dist/*.whl

# 4. What runs. No uv, no Node and no source tree.
FROM python:${PYTHON_VERSION}-slim
COPY --from=venv /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
WORKDIR /app

# Which commit this image was built from, for /health to report. The build
# context has no repository (.dockerignore leaves .git out), so it has to be
# handed in: `docker build --build-arg LIBRA_BUILD=$(git rev-parse --short HEAD)`.
# Empty when nobody passes it, which is why nothing may assume it is there.
ARG LIBRA_BUILD=""
ENV LIBRA_BUILD=$LIBRA_BUILD

EXPOSE 8000

# The slim image has no curl, so Python makes the request.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)"]

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
