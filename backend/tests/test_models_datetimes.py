"""Every stored datetime is naive UTC, and SQLModel must keep it that way."""

import pytest
from sqlalchemy import Column, DateTime, create_engine, literal, select
from sqlmodel import SQLModel

from app.models import utcnow


def _is_datetime(column: Column) -> bool:
    """True for a DateTime column, including one a SQLModel type wraps."""
    return isinstance(getattr(column.type, "impl_instance", column.type), DateTime)


DATETIME_COLUMNS = [
    pytest.param(column, id=f"{table.name}.{column.name}")
    for table in SQLModel.metadata.sorted_tables
    for column in table.columns
    if _is_datetime(column)
]


def test_the_schema_has_datetime_columns_to_check() -> None:
    assert DATETIME_COLUMNS


@pytest.mark.parametrize("column", DATETIME_COLUMNS)
def test_a_naive_utc_value_goes_in_and_comes_back_naive(column: Column) -> None:
    value = utcnow()

    with create_engine("sqlite://").connect() as connection:
        stored = connection.execute(select(literal(value, type_=column.type))).scalar_one()

    assert stored == value
    assert stored.tzinfo is None
