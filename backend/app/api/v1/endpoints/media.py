"""Media upload (admin) + serve (public).

Uploaded files are stored as binary in the DB (`media_assets`) so deployments
stay stateless. Upload returns an absolute URL the frontend stores and renders.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from fastapi.responses import Response
from sqlalchemy import select

from app.core.deps import DbSession, require_admin
from app.models.content import MediaAsset
from app.schemas.content import MediaRead

router = APIRouter(prefix="/media", tags=["media"])

MAX_BYTES = 8 * 1024 * 1024  # 8 MB
ALLOWED = {"image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml",
           "application/pdf"}


def _media_url(request: Request, media_id: int) -> str:
    return f"{str(request.base_url).rstrip('/')}/api/v1/media/{media_id}"


@router.post("", response_model=MediaRead, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_admin())])
async def upload(request: Request, db: DbSession, file: UploadFile = File(...)):
    content_type = file.content_type or "application/octet-stream"
    if content_type not in ALLOWED:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                            f"Unsupported type: {content_type}")
    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                            f"File too large (max {MAX_BYTES // (1024 * 1024)} MB)")
    asset = MediaAsset(
        filename=file.filename or "upload",
        content_type=content_type,
        size_bytes=len(data),
        data=data,
    )
    db.add(asset)
    await db.commit()
    await db.refresh(asset)
    return MediaRead(
        id=asset.id, created_at=asset.created_at, updated_at=asset.updated_at,
        filename=asset.filename, content_type=asset.content_type,
        size_bytes=asset.size_bytes, url=_media_url(request, asset.id),
    )


@router.get("/{media_id}")
async def serve(media_id: int, db: DbSession) -> Response:
    asset = await db.get(MediaAsset, media_id)
    if asset is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    return Response(
        content=asset.data,
        media_type=asset.content_type,
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )


@router.get("", response_model=list[MediaRead], dependencies=[Depends(require_admin())])
async def list_media(request: Request, db: DbSession):
    rows = (await db.scalars(select(MediaAsset).order_by(MediaAsset.id.desc()))).all()
    return [
        MediaRead(
            id=a.id, created_at=a.created_at, updated_at=a.updated_at,
            filename=a.filename, content_type=a.content_type,
            size_bytes=a.size_bytes, url=_media_url(request, a.id),
        )
        for a in rows
    ]


@router.delete("/{media_id}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[Depends(require_admin())])
async def delete_media(media_id: int, db: DbSession):
    asset = await db.get(MediaAsset, media_id)
    if asset is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    await db.delete(asset)
    await db.commit()
