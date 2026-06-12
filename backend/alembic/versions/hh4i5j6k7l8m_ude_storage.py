"""UDE: add raw_s3_key and mongodb_collection to ude_sessions

Revision ID: hh4i5j6k7l8m
Revises: gg3h4i5j6k7l
Create Date: 2026-06-12 17:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'hh4i5j6k7l8m'
down_revision: Union[str, None] = 'gg3h4i5j6k7l'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("ude_sessions") as batch:
        batch.add_column(sa.Column("raw_s3_key", sa.String(1024), nullable=True))
        batch.add_column(sa.Column("mongodb_collection", sa.String(128), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("ude_sessions") as batch:
        batch.drop_column("mongodb_collection")
        batch.drop_column("raw_s3_key")
