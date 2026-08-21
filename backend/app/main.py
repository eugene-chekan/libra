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
from app.routers import auth, books, health, notes, shelves, tags, users

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

    Separated from the response handling so it can be tested directly on any
    platform, which matters more than it looks — see the separator note below.

    Narrow on purpose, because the broad version is a trap:

    - **Never under `/api`.** An endpoint that does not exist must stay a 404.
      Returning a page there turns a typo in a caller's URL into a 200 full of
      HTML, which is the most confusing possible way to find out.
    - **Never for a path with a file extension.** A missing `.js` or `.woff2`
      is a broken build and has to look like one. Answering it with HTML makes
      the browser report a syntax error in a script instead of a 404 for a
      missing one, and sends whoever is debugging a long way in the wrong
      direction.

    Anything else carrying no extension is a client route.

    **The separator is normalised first, and that is not defensive tidiness.**
    `StaticFiles` hands over an OS-native path, so on Windows this arrives as
    `api\\not-a-real-path` and a check for `api/` silently does not fire. That
    version of this function passed on Linux and failed on Windows — the worst
    shape a bug can have, because CI would have called it green.
    """
    url_path = path.replace("\\", "/").lstrip("/")
    if url_path.startswith("api/"):
        return False
    return "." not in url_path.rsplit("/", 1)[-1]


class SpaStaticFiles(StaticFiles):
    """Serves the built client, and serves it again for client-side routes.

    The client routes on real URLs, so `/shelves` and `/books/5` are addresses
    a reader can reload, bookmark and share. Those paths exist only inside the
    running app — there is no `shelves` file on disk — so a plain static mount
    404s on the reload, and the reader loses the page by refreshing it.

    Which paths get that treatment is {@link is_client_route}'s decision.

    Note that a miss arrives as a *raised* `HTTPException`, not as a response
    carrying a 404. Inspecting `response.status_code` therefore never fires,
    and the first version of this class did exactly that: it read correctly and
    every client route 404ed.
    """

    async def get_response(self, path: str, scope: Scope) -> Response:
        try:
            return await super().get_response(path, scope)
        except HTTPException as exc:
            if exc.status_code != 404 or not is_client_route(path):
                raise
            return await super().get_response("index.html", scope)


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
    if settings.web_dir.is_dir():
        app.mount(
            "/",
            SpaStaticFiles(directory=settings.web_dir, html=True),
            name="web",
        )
        log.info("Serving the client from %s", settings.web_dir)
    else:
        # Not an error: the API is perfectly usable on its own, and this is the
        # normal state of a checkout that has never run scripts/run.sh.
        log.info("No client build at %s; serving the API only", settings.web_dir)

    return app


app = create_app()
