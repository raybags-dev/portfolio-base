"""add hero image display controls

Revision ID: rr5t6u7v8w9x
Revises: qq3r4s5t6u7v
Create Date: 2026-06-21 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'rr5t6u7v8w9x'
down_revision: Union[str, None] = 'qq3r4s5t6u7v'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('hero_section') as batch:
        batch.add_column(sa.Column('background_opacity', sa.Float(), nullable=False, server_default='0.2'))
        batch.add_column(sa.Column('img_grayscale', sa.Float(), nullable=False, server_default='0.0'))
        batch.add_column(sa.Column('img_invert', sa.Boolean(), nullable=False, server_default='0'))


def downgrade() -> None:
    with op.batch_alter_table('hero_section') as batch:
        batch.drop_column('img_invert')
        batch.drop_column('img_grayscale')
        batch.drop_column('background_opacity')
