from sqlalchemy import JSON as SA_JSON
from sqlalchemy import Column
from sqlmodel import Field, SQLModel


class BookBase(SQLModel):
    title: str
    author: str
    format: str
    file_path: str
    book_metadata: dict = Field(default_factory=dict, sa_column=Column(SA_JSON))


class Book(BookBase, table=True):
    id: int | None = Field(default=None, primary_key=True)


class BookCreate(BookBase):
    pass


class BookRead(BookBase):
    id: int
