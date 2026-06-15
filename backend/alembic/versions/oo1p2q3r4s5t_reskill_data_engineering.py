"""Reskill: replace skill list with data-engineering-focused structure

Revision ID: oo1p2q3r4s5t
Revises: nn0o1p2q3r4s
Create Date: 2026-06-15
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "oo1p2q3r4s5t"
down_revision = "nn0o1p2q3r4s"
branch_labels = None
depends_on = None

SKILLS = [
    # Core Data Engineering & Warehousing
    ("Google BigQuery",         "Core Data Engineering",    1),
    ("DBT",                     "Core Data Engineering",    2),
    ("PostgreSQL",              "Core Data Engineering",    3),
    ("MySQL",                   "Core Data Engineering",    4),
    ("MongoDB",                 "Core Data Engineering",    5),
    ("ETL / ELT Development",   "Core Data Engineering",    6),
    ("Data Integration",        "Core Data Engineering",    7),
    # Data Streaming & Event-Driven Architecture
    ("Apache Kafka",            "Streaming & Events",       1),
    ("RabbitMQ",                "Streaming & Events",       2),
    ("Event-Driven Architectures", "Streaming & Events",   3),
    ("API Integration",         "Streaming & Events",       4),
    # Languages & Backend Frameworks
    ("Python",                  "Languages & Backend",      1),
    ("JavaScript",              "Languages & Backend",      2),
    ("C# (.NET)",               "Languages & Backend",      3),
    ("FastAPI",                 "Languages & Backend",      4),
    ("Node.js (Express)",       "Languages & Backend",      5),
    # Specialized Engineering
    ("PLC Programming",         "Specialized Engineering",  1),
    # Frontend & Design
    ("React.js",                "Frontend & Design",        1),
    ("HTML5 / CSS3",            "Frontend & Design",        2),
    ("jQuery",                  "Frontend & Design",        3),
    ("Figma",                   "Frontend & Design",        4),
]


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("DELETE FROM skills"))
    conn.execute(
        sa.text(
            "INSERT INTO skills (name, category, proficiency, \"order\", is_visible) "
            "VALUES (:name, :category, :proficiency, :order, true)"
        ),
        [{"name": n, "category": c, "proficiency": 90, "order": o} for n, c, o in SKILLS],
    )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("DELETE FROM skills"))
