from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.db import init_db
from app.routers import books, health


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="libra", lifespan=lifespan)
    app.include_router(health.router)
    app.include_router(books.router)
    return app


app = create_app()
