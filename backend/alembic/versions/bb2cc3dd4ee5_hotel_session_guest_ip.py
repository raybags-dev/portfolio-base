"""hotel_crawl_sessions: add client_ip, is_guest, session_contact

Revision ID: bb2cc3dd4ee5
Revises: ff1a2b3c4d5e
Create Date: 2026-06-11 10:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'bb2cc3dd4ee5'
down_revision: Union[str, None] = 'ff1a2b3c4d5e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('hotel_crawl_sessions', schema=None) as batch_op:
        batch_op.add_column(sa.Column('client_ip', sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column('is_guest', sa.Boolean(), nullable=False, server_default='true'))
        batch_op.add_column(sa.Column('session_contact', sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('hotel_crawl_sessions', schema=None) as batch_op:
        batch_op.drop_column('session_contact')
        batch_op.drop_column('is_guest')
        batch_op.drop_column('client_ip')
