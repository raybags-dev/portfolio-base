"""add crawler_profiles table

Revision ID: pp2q3r4s5t6u
Revises: b3316016bbdd
Create Date: 2026-06-18 22:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'pp2q3r4s5t6u'
down_revision: Union[str, None] = 'b3316016bbdd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'crawler_profiles',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('applies_to', sa.String(length=64), nullable=False, server_default='all'),
        sa.Column('target_url_pattern', sa.String(length=512), nullable=True),
        sa.Column('fields_config', sa.JSON(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='1'),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('crawler_profiles')
