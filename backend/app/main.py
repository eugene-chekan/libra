import mimetypes
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException
from starlette.responses import Response
from starlette.types import Scope

from app.config import get_settings
from app.db import init_db
from app.logging_config import configure_logging, get_logger
from app.routers import auth, books, health, librarian, notes, shelves, tags, users
from app.version import VERSION

log = get_logger(__name__)

# Python's mimetypes table predates woff2 on most systems, so StaticFiles would
# guess `application/octet-stream` for every font the client ships. Browsers
# mostly sniff their way past that, which is exactly what makes it worth
# fixing: it works until something with a strict font or CSP policy declines to
# guess, and then a page renders in Times New Roman for no visible reason.
mimetypes.add_type("font/woff2", ".woff2")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


def is_client_route(path: str) -> bool:
    """Whether a path that matched no file should be answered with the app.

    Args:
        path: As `StaticFiles` gives it, which on Windows uses backslashes —
            hence the normalisation, without which the `api/` check never fires.
    """
    url_path = path.replace("\\", "/").lstrip("/")
    if url_path.startswith("api/"):
        return False
    return "." not in url_path.rsplit("/", 1)[-1]


class SpaStaticFiles(StaticFiles):
    """Serves the built client, and serves it again for client-side routes."""

    async def get_response(self, path: str, scope: Scope) -> Response:
        try:
            return await super().get_response(path, scope)
        except HTTPException as exc:
            if exc.status_code != 404 or not is_client_route(path):
                raise
            return await super().get_response("index.html", scope)


def create_app() -> FastAPI:
    """Build the application: middleware, routes, and the client in front."""
    settings = get_settings()
    configure_logging(settings.log_level)

    app = FastAPI(title="libra", version=VERSION, lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router)

    api = APIRouter(prefix="/api")
    api.include_router(auth.router)
    api.include_router(users.router)
    api.include_router(shelves.router)
    api.include_router(tags.router)
    api.include_router(books.router)
    api.include_router(notes.router)
    api.include_router(librarian.router)
    app.include_router(api)

    if settings.web_dir.is_dir():
        app.mount(
            "/",
            SpaStaticFiles(directory=settings.web_dir, html=True),
            name="web",
        )
        log.info("Serving the client from %s", settings.web_dir)
    else:
        log.info("No client build at %s; serving the API only", settings.web_dir)

    return app


app = create_app()
