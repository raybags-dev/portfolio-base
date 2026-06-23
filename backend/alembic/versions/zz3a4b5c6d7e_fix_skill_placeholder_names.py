"""Fix skill placeholder names: strip '(add skills below)' and hide anchor skills

Revision ID: zz3a4b5c6d7e
Revises: yy2z3a4b5c6d
Create Date: 2026-06-23
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "zz3a4b5c6d7e"
down_revision = "yy2z3a4b5c6d"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Strip the " (add skills below)" suffix from any skill names that have it,
    # and mark those skills as hidden so they don't appear on the public site.
    # These are category-anchor placeholder skills that carry metadata only.
    op.execute(
        sa.text(
            """
            UPDATE skills
            SET
                name = TRIM(REPLACE(name, ' (add skills below)', '')),
                is_visible = false
            WHERE name LIKE '%(add skills below)%'
            """
        )
    )


def downgrade() -> None:
    pass
