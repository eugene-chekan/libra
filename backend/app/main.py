from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import get_settings
from app.db import init_db
from app.logging_config import configure_logging, get_logger
from app.routers import auth, books, health, notes, shelves, tags, users

log = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    # Before anything else, so a failure during startup — migrations in
    # particular — is reported rather than swallowed.
    configure_logging(settings.log_level)

    app = FastAPI(title="libra", lifespan=lifespan)

    # allow_credentials is required for the session cookie to be sent
    # cross-origin, and the CORS spec forbids combining it with a "*"
    # origin — browsers reject the response outright. So origins are always
    # an explicit list, empty by default.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(users.router)
    app.include_router(shelves.router)
    app.include_router(tags.router)
    app.include_router(books.router)
    app.include_router(notes.router)

    # Mounted last, and only last: Starlette matches routes in order, so the
    # API keeps every path it declares and this catches what is left. Mounting
    # it earlier would shadow the whole API with the single-page app.
    #
    # `html=True` serves index.html for `/`. It does *not* fall back to
    # index.html for unknown paths, so a mistyped API path still 404s instead
    # of quietly returning a page — the client routes on the URL fragment, so
    # it never asks the server for a route in the first place.
    if settings.web_dir.is_dir():
        app.mount(
            "/",
            StaticFiles(directory=settings.web_dir, html=True),
            name="web",
        )
        log.info("Serving the client from %s", settings.web_dir)
    else:
        # Not an error: the API is perfectly usable on its own, and this is the
        # normal state of a checkout that has never run scripts/run.sh.
        log.info("No client build at %s; serving the API only", settings.web_dir)

    return app


app = create_app()
