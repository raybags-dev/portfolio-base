"""hotel crawl sessions and records

Revision ID: ff1a2b3c4d5e
Revises: e9f3b2d15a77
Create Date: 2026-06-10 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'ff1a2b3c4d5e'
down_revision: Union[str, None] = 'e9f3b2d15a77'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('hotel_crawl_sessions',
    sa.Column('name', sa.String(length=255), nullable=False),
    sa.Column('target_url', sa.String(length=2048), nullable=False),
    sa.Column('collection_prompt', sa.Text(), nullable=False),
    sa.Column('analytics_spec', sa.JSON(), nullable=True),
    sa.Column('max_pages', sa.Integer(), nullable=False),
    sa.Column('status', sa.String(length=32), nullable=False),
    sa.Column('progress', sa.JSON(), nullable=True),
    sa.Column('analytics_result', sa.JSON(), nullable=True),
    sa.Column('error', sa.Text(), nullable=True),
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('hotel_crawl_records',
    sa.Column('session_id', sa.Integer(), nullable=False),
    sa.Column('source_url', sa.String(length=2048), nullable=True),
    sa.Column('data', sa.JSON(), nullable=True),
    sa.Column('is_valid', sa.Boolean(), nullable=False),
    sa.Column('validation_errors', sa.JSON(), nullable=True),
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.ForeignKeyConstraint(['session_id'], ['hotel_crawl_sessions.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('hotel_crawl_records', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_hotel_crawl_records_session_id'), ['session_id'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('hotel_crawl_records', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_hotel_crawl_records_session_id'))
    op.drop_table('hotel_crawl_records')
    op.drop_table('hotel_crawl_sessions')
