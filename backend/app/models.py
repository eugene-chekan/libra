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


class BookUpdate(SQLModel):
    """Partial update for a book's metadata.

    Defined standalone rather than deriving from `BookBase` so every field is
    optional and `file_path` is absent: file locations are owned by the
    storage layer, so the user edits metadata while the system keeps the
    invariant that a row points at a file it actually wrote. Supplying
    `book_metadata` replaces the dict wholesale rather than merging it.
    """

    title: str | None = None
    author: str | None = None
    format: str | None = None
    book_metadata: dict | None = None
