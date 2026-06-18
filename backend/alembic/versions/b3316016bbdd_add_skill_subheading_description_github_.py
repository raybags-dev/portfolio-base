"""add skill subheading description github_url

Revision ID: b3316016bbdd
Revises: oo1p2q3r4s5t
Create Date: 2026-06-18 21:22:03.416571

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'b3316016bbdd'
down_revision: Union[str, None] = 'oo1p2q3r4s5t'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('skills', schema=None) as batch_op:
        batch_op.add_column(sa.Column('subheading', sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column('description', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('github_url', sa.String(length=512), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('skills', schema=None) as batch_op:
        batch_op.drop_column('github_url')
        batch_op.drop_column('description')
        batch_op.drop_column('subheading')
