from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
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

    # `/health` stays at the root. It is a liveness check for whatever is
    # watching the process, not something the client calls, and probes expect
    # to find it at `/health`.
    app.include_router(health.router)

    # Everything the client calls lives under `/api`, and the prefix is written
    # here once rather than on each of the six `include_router` calls.
    #
    # This exists to keep client routes and endpoints apart. The client uses
    # real URLs, so reloading the page at `/shelves` asks *this server* for
    # `/shelves` — which, before this prefix, was the endpoint returning the
    # shelf list, and the reader got JSON instead of the app. `/books/5` was
    # the same. Renaming the two colliding client routes would have worked
    # today and left a rule to remember forever, while Phase 2 and Phase 3 are
    # still to add endpoints of their own. A prefix ends the whole class.
    api = APIRouter(prefix="/api")
    api.include_router(auth.router)
    api.include_router(users.router)
    api.include_router(shelves.router)
    api.include_router(tags.router)
    api.include_router(books.router)
    api.include_router(notes.router)
    app.include_router(api)

    # Mounted last, and only last: Starlette matches routes in order, so the
    # API keeps every path it declares and this catches what is left. Mounting
    # it earlier would shadow the whole API with the single-page app.
    #
    # `html=True` serves index.html for `/`. It does *not* fall back to
    # index.html for unknown paths.
    #
    # A client using real URLs does need that fallback, so that a reload at
    # `/books/5` returns the app rather than a 404. Adding it is safe now that
    # the API sits under `/api`, where a mistyped endpoint still 404s instead
    # of quietly returning a page. It is not added yet, because there is no
    # client to serve — see docs/specs/client-stack.md.
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
