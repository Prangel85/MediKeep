"""Upgrade/downgrade of the scheduling feature migrations.

Runs each real migration against an in-memory SQLite database and compares
the resulting table with the SQLAlchemy model, so a column or index renamed in
one place but not the other fails here instead of at deploy time.
"""

import pytest
import sqlalchemy as sa

from app.models.scheduling import Appointment
from tests.utils.migrations import run_migration

PARENT_TABLES = ("patients", "practitioners", "practices", "encounters")

# (migration file name, model) - one entry per scheduling migration.
MIGRATIONS = [
    ("20261111_1000_5c0a1e7d3f01_scheduling_add_appointments.py", Appointment),
]


def _engine_with_parent_tables():
    engine = sa.create_engine("sqlite://")
    with engine.begin() as conn:
        for table in PARENT_TABLES:
            conn.execute(sa.text(f"CREATE TABLE {table} (id INTEGER PRIMARY KEY)"))
    return engine


def _upgrade_through(engine, index: int) -> None:
    """Apply the scheduling migrations up to and including ``index``."""
    for filename, _ in MIGRATIONS[: index + 1]:
        run_migration(engine, filename, "upgrade")


@pytest.mark.parametrize("index", range(len(MIGRATIONS)))
def test_upgrade_matches_model_and_downgrade_removes_table(index):
    filename, model = MIGRATIONS[index]
    engine = _engine_with_parent_tables()
    _upgrade_through(engine, index)

    table = model.__table__
    inspector = sa.inspect(engine)
    assert table.name in inspector.get_table_names()

    db_columns = {c["name"]: c for c in inspector.get_columns(table.name)}
    assert set(db_columns) == {c.name for c in table.columns}
    for column in table.columns:
        assert db_columns[column.name]["nullable"] == column.nullable, column.name

    assert {i["name"] for i in inspector.get_indexes(table.name)} == {
        i.name for i in table.indexes
    }

    db_fks = {
        (tuple(fk["constrained_columns"]), fk["referred_table"])
        for fk in inspector.get_foreign_keys(table.name)
    }
    model_fks = {((fk.parent.name,), fk.column.table.name) for fk in table.foreign_keys}
    assert db_fks == model_fks

    run_migration(engine, filename, "downgrade")
    assert table.name not in sa.inspect(engine).get_table_names()

    # Repeatable
    run_migration(engine, filename, "upgrade")
    assert table.name in sa.inspect(engine).get_table_names()


def test_migrations_form_a_single_chain():
    """Each scheduling migration builds on the previous one."""
    from tests.utils.migrations import load_migration_module

    modules = [load_migration_module(f) for f, _ in MIGRATIONS]
    for previous, current in zip(modules, modules[1:]):
        assert current.down_revision == previous.revision
