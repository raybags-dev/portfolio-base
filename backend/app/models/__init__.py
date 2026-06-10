"""Import all models so they register on ``Base.metadata``.

Anything that calls ``Base.metadata.create_all`` or Alembic autogenerate must
import this package first.
"""

from app.models.base import PKMixin, TimestampMixin  # noqa: F401
from app.models.blog import (  # noqa: F401
    BlogComment,
    BlogLike,
    BlogPost,
    Category,
    Tag,
    post_tags,
)
from app.models.content import (  # noqa: F401
    AboutMe,
    HeroSection,
    MediaAsset,
    PortfolioImage,
    Resume,
    Section,
    Setting,
    SiteConfiguration,
    SocialLink,
    Theme,
)
from app.models.platform import (  # noqa: F401
    AgentTask,
    AiAgent,
    Analytics,
    AppToken,
    ContactMessage,
    CrawlerJob,
    CrawlerLog,
    CrawlerResult,
    Dashboard,
    FeatureFlag,
    IpUsageLog,
    Microservice,
    Notification,
    Report,
    ReportTemplate,
    ScheduledJob,
    StorageFile,
)
from app.models.portfolio import (  # noqa: F401
    Certification,
    Education,
    Experience,
    Project,
    ProjectImage,
    Recommendation,
    Skill,
    Technology,
    TimelineEntry,
)
from app.models.user import (  # noqa: F401
    ActivityLog,
    ApiKey,
    AuditLog,
    Permission,
    Role,
    User,
    role_permissions,
    user_roles,
)

__all__ = [
    "PKMixin",
    "TimestampMixin",
    # user / rbac
    "User",
    "Role",
    "Permission",
    "ApiKey",
    "AuditLog",
    "ActivityLog",
    "user_roles",
    "role_permissions",
    # content
    "Setting",
    "SiteConfiguration",
    "Theme",
    "HeroSection",
    "AboutMe",
    "Resume",
    "SocialLink",
    "PortfolioImage",
    "MediaAsset",
    "Section",
    # portfolio
    "Technology",
    "Project",
    "ProjectImage",
    "Recommendation",
    "Skill",
    "TimelineEntry",
    "Certification",
    "Experience",
    "Education",
    # blog
    "Category",
    "Tag",
    "BlogPost",
    "BlogComment",
    "BlogLike",
    "post_tags",
    # platform
    "FeatureFlag",
    "Microservice",
    "CrawlerJob",
    "CrawlerLog",
    "CrawlerResult",
    "AiAgent",
    "AgentTask",
    "ReportTemplate",
    "Report",
    "Analytics",
    "Dashboard",
    "ScheduledJob",
    "Notification",
    "StorageFile",
    "ContactMessage",
    "AppToken",
    "IpUsageLog",
]
