"""enable hotel_reviews flag, fix project cards

Revision ID: aa2b3c4d5e6f
Revises: ff1a2b3c4d5e
Create Date: 2026-06-10 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'aa2b3c4d5e6f'
down_revision: Union[str, None] = 'ff1a2b3c4d5e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # 1. Enable the hotel-reviews feature flag (was False when originally seeded)
    conn.execute(sa.text(
        "UPDATE feature_flags SET enabled = true WHERE key = 'ENABLE_HOTEL_REVIEWS'"
    ))

    # 2. Fix self-healing-crawlers project — point it at the hotel-reviews tool
    conn.execute(sa.text(
        "UPDATE projects SET service_key = 'hotel-reviews' "
        "WHERE slug = 'self-healing-crawlers'"
    ))

    # 3. Ensure hotel-reviews microservice is live with the correct base_url
    conn.execute(sa.text(
        "UPDATE microservices SET base_url = '/hotel-reviews', status = 'live' "
        "WHERE key = 'hotel-reviews'"
    ))

    # 4. Create hotel-reviews project card for the Projects section if not yet present
    exists = conn.execute(
        sa.text("SELECT 1 FROM projects WHERE slug = 'hotel-reviews'")
    ).fetchone()
    if not exists:
        conn.execute(sa.text("""
            INSERT INTO projects
              (title, slug, summary, description, tech_tags, is_featured, is_hidden,
               status, service_key, "order", created_at, updated_at)
            VALUES (
              'Hotel Review Analytics',
              'hotel-reviews',
              'LLM-guided web crawler — point it at any hotel/review site and it collects, validates, and analyses the data automatically.',
              'Playwright + Groq (llama-3.3-70b-versatile) navigates any website intelligently, extracts structured data, self-heals broken selectors, runs analytics (price distribution, rating heatmaps, temporal trends), and auto-generates blog posts from findings.',
              '["Playwright","Groq AI","FastAPI","Next.js","Recharts","SQLAlchemy","Alembic"]',
              true,
              false,
              'published',
              'hotel-reviews',
              2,
              CURRENT_TIMESTAMP,
              CURRENT_TIMESTAMP
            )
        """))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text(
        "UPDATE feature_flags SET enabled = false WHERE key = 'ENABLE_HOTEL_REVIEWS'"
    ))
    conn.execute(sa.text(
        "UPDATE projects SET service_key = 'retail' WHERE slug = 'self-healing-crawlers'"
    ))
    conn.execute(sa.text(
        "UPDATE microservices SET status = 'registered' WHERE key = 'hotel-reviews'"
    ))
    conn.execute(sa.text(
        "DELETE FROM projects WHERE slug = 'hotel-reviews'"
    ))
