"""add password_reset_tokens table; set admin phone number

Revision ID: qq3r4s5t6u7v
Revises: pp2q3r4s5t6u
Create Date: 2026-06-19 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'qq3r4s5t6u7v'
down_revision: Union[str, None] = 'pp2q3r4s5t6u'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'password_reset_tokens',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('token', sa.String(length=64), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('is_used', sa.Boolean(), nullable=False, server_default='0'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('token'),
    )
    op.create_index('ix_password_reset_tokens_token', 'password_reset_tokens', ['token'])
    op.create_index('ix_password_reset_tokens_email', 'password_reset_tokens', ['email'])

    # Populate the admin phone number on the existing site configuration row.
    op.execute(
        "UPDATE site_configuration SET phone = '+31636329324' WHERE id = 1 AND (phone IS NULL OR phone = '')"
    )


def downgrade() -> None:
    op.drop_index('ix_password_reset_tokens_email', table_name='password_reset_tokens')
    op.drop_index('ix_password_reset_tokens_token', table_name='password_reset_tokens')
    op.drop_table('password_reset_tokens')
