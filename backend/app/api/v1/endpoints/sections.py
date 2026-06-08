"""Configurable, removable site sections / nav tabs."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select

from app.core.deps import DbSession, require_admin
from app.models.content import Section
from app.schemas.content import SectionCreate, SectionRead, SectionUpdate

router = APIRouter(prefix="/sections", tags=["sections"])

# key, label, order, is_removable, in_nav
DEFAULT_SECTIONS: list[tuple[str, str, int, bool, bool]] = [
    ("hero", "Home", 0, False, False),
    ("about", "About", 1, True, True),
    ("skills", "Skills", 2, True, True),
    ("projects", "Projects", 3, True, True),
    ("platform", "Data Platform", 4, True, True),
    ("recommendations", "Testimonials", 5, True, True),
    ("experience", "Experience", 6, True, True),
    ("education", "Education", 7, True, True),
    ("certifications", "Certifications", 8, True, True),
    ("blog", "Blog", 9, True, True),
    ("contact", "Contact", 10, False, True),
]


# One-time label normalisations for sections that were renamed after release.
_RENAMES = {"recommendations": ("Recommendations", "Testimonials")}


async def ensure_default_sections(db) -> int:
    rows = (await db.scalars(select(Section))).all()
    existing = {s.key: s for s in rows}
    added = 0
    for key, label, order, removable, in_nav in DEFAULT_SECTIONS:
        if key in existing:
            continue
        db.add(Section(key=key, label=label, order=order,
                       is_removable=removable, in_nav=in_nav, enabled=True))
        added += 1
    # Apply default-label renames only when the admin hasn't customised them.
    for key, (old, new) in _RENAMES.items():
        sec = existing.get(key)
        if sec and sec.label == old:
            sec.label = new
    await db.commit()
    return added


@router.get("", response_model=list[SectionRead])
async def list_sections(db: DbSession):
    return (await db.scalars(select(Section).order_by(Section.order, Section.id))).all()


@router.post("", response_model=SectionRead, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_admin())])
async def create_section(payload: SectionCreate, db: DbSession):
    if await db.scalar(select(Section).where(Section.key == payload.key)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Section key already exists")
    section = Section(**payload.model_dump())
    db.add(section)
    await db.commit()
    await db.refresh(section)
    return section


@router.put("/{key}", response_model=SectionRead, dependencies=[Depends(require_admin())])
async def update_section(key: str, payload: SectionUpdate, db: DbSession):
    section = await db.scalar(select(Section).where(Section.key == key))
    if not section:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Section not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(section, field, value)
    await db.commit()
    await db.refresh(section)
    return section


@router.delete("/{key}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[Depends(require_admin())])
async def delete_section(key: str, db: DbSession):
    section = await db.scalar(select(Section).where(Section.key == key))
    if not section:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Section not found")
    if not section.is_removable:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This section cannot be removed")
    await db.delete(section)
    await db.commit()


@router.post("/reset", dependencies=[Depends(require_admin())])
async def reset_sections(db: DbSession) -> dict[str, str]:
    """Restore all DEFAULT_SECTIONS to their original state and remove custom additions."""
    rows = (await db.scalars(select(Section))).all()
    existing = {s.key: s for s in rows}
    default_keys = {key for key, *_ in DEFAULT_SECTIONS}

    for key, section in existing.items():
        if key not in default_keys and section.is_removable:
            await db.delete(section)

    for key, label, order, removable, in_nav in DEFAULT_SECTIONS:
        sec = existing.get(key)
        if sec:
            sec.label = label
            sec.order = order
            sec.is_removable = removable
            sec.in_nav = in_nav
            sec.enabled = True
        else:
            db.add(Section(key=key, label=label, order=order,
                           is_removable=removable, in_nav=in_nav, enabled=True))

    await db.commit()
    return {"ok": "sections reset to defaults"}
