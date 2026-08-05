from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db import init_db
from app.routers import auth, books, health, users


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="libra", lifespan=lifespan)

    # allow_credentials is required for the session cookie to be sent
    # cross-origin, and the CORS spec forbids combining it with a "*"
    # origin — browsers reject the response outright. So origins are always
    # an explicit list, empty by default.
    settings = get_settings()
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
    app.include_router(books.router)
    return app


app = create_app()
