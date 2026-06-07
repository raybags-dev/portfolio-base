"""Collection CRUD routers, assembled from the generic factory.

Public GET (list/detail) + admin write for each portfolio/content collection.
The curated public homepage payload lives in ``public.bootstrap``; these
endpoints back the admin panel and granular fetches.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.api.crud_router import build_crud_router
from app.models import content as c
from app.models import platform as p
from app.models import portfolio as pf
from app.schemas import content as cs
from app.schemas import platform as ps
from app.schemas import portfolio as pfs

router = APIRouter()

_specs = [
    # prefix, model, read, create, update, order_by
    ("/technologies", pf.Technology, pfs.TechnologyRead, pfs.TechnologyCreate, pfs.TechnologyCreate, pf.Technology.name),
    ("/projects", pf.Project, pfs.ProjectRead, pfs.ProjectCreate, pfs.ProjectUpdate, pf.Project.order),
    ("/recommendations", pf.Recommendation, pfs.RecommendationRead, pfs.RecommendationCreate, pfs.RecommendationUpdate, pf.Recommendation.order),
    ("/skills", pf.Skill, pfs.SkillRead, pfs.SkillCreate, pfs.SkillUpdate, pf.Skill.order),
    ("/timeline", pf.TimelineEntry, pfs.TimelineRead, pfs.TimelineCreate, pfs.TimelineUpdate, pf.TimelineEntry.sort_key),
    ("/certifications", pf.Certification, pfs.CertificationRead, pfs.CertificationCreate, pfs.CertificationUpdate, pf.Certification.order),
    ("/experiences", pf.Experience, pfs.ExperienceRead, pfs.ExperienceCreate, pfs.ExperienceUpdate, pf.Experience.order),
    ("/education", pf.Education, pfs.EducationRead, pfs.EducationCreate, pfs.EducationUpdate, pf.Education.order),
    ("/social-links", c.SocialLink, cs.SocialLinkRead, cs.SocialLinkCreate, cs.SocialLinkUpdate, c.SocialLink.order),
    ("/microservices", p.Microservice, ps.MicroserviceRead, ps.MicroserviceCreate, ps.MicroserviceUpdate, p.Microservice.name),
]

for prefix, model, read, create, update, order_by in _specs:
    tag = prefix.strip("/")
    router.include_router(
        build_crud_router(
            model=model,
            read_schema=read,
            create_schema=create,
            update_schema=update,
            prefix=prefix,
            tags=[tag],
            order_by=order_by,
        )
    )
