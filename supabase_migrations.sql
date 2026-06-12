-- =============================================================================
-- portfolio-base: Supabase SQL — all tables in a single runnable file
-- Generated from alembic migration chain (8 migrations)
-- Run this once in the Supabase SQL editor to create all tables.
-- =============================================================================

-- Auto-update updated_at on every row change
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Helper macro: attach the trigger to a table
-- (called inline below for each table)

-- =============================================================================
-- STANDALONE TABLES (no foreign key dependencies)
-- =============================================================================

CREATE TABLE IF NOT EXISTS about_me (
  id              SERIAL PRIMARY KEY,
  heading         VARCHAR(255),
  biography       TEXT,
  description     TEXT,
  image_url       VARCHAR(1024),
  images          JSONB,
  highlights      JSONB,
  is_visible      BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE OR REPLACE TRIGGER trg_about_me_updated_at
  BEFORE UPDATE ON about_me
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS activity_logs (
  id          SERIAL PRIMARY KEY,
  category    VARCHAR(64)  NOT NULL,
  message     TEXT         NOT NULL,
  level       VARCHAR(16)  NOT NULL,
  context     JSONB,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_activity_logs_category ON activity_logs (category);
CREATE OR REPLACE TRIGGER trg_activity_logs_updated_at
  BEFORE UPDATE ON activity_logs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ai_agents (
  id             SERIAL PRIMARY KEY,
  key            VARCHAR(64)  NOT NULL,
  name           VARCHAR(255) NOT NULL,
  role           VARCHAR(128),
  description    TEXT,
  model          VARCHAR(64),
  system_prompt  TEXT,
  config         JSONB,
  is_enabled     BOOLEAN      NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_ai_agents_key UNIQUE (key)
);
CREATE UNIQUE INDEX IF NOT EXISTS ix_ai_agents_key ON ai_agents (key);
CREATE OR REPLACE TRIGGER trg_ai_agents_updated_at
  BEFORE UPDATE ON ai_agents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS analytics (
  id           SERIAL PRIMARY KEY,
  metric       VARCHAR(128) NOT NULL,
  dimension    VARCHAR(128),
  value        DOUBLE PRECISION NOT NULL,
  recorded_at  TIMESTAMPTZ,
  meta         JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_analytics_metric    ON analytics (metric);
CREATE INDEX IF NOT EXISTS ix_analytics_dimension ON analytics (dimension);
CREATE OR REPLACE TRIGGER trg_analytics_updated_at
  BEFORE UPDATE ON analytics
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS categories (
  id           SERIAL PRIMARY KEY,
  name         VARCHAR(128) NOT NULL,
  slug         VARCHAR(128) NOT NULL,
  description  VARCHAR(512),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_categories_name UNIQUE (name),
  CONSTRAINT uq_categories_slug UNIQUE (slug)
);
CREATE UNIQUE INDEX IF NOT EXISTS ix_categories_slug ON categories (slug);
CREATE OR REPLACE TRIGGER trg_categories_updated_at
  BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS certifications (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(255)  NOT NULL,
  issuer          VARCHAR(255),
  issue_date      VARCHAR(32),
  credential_url  VARCHAR(1024),
  image_url       VARCHAR(1024),
  "order"         INTEGER       NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE OR REPLACE TRIGGER trg_certifications_updated_at
  BEFORE UPDATE ON certifications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS crawler_jobs (
  id             SERIAL PRIMARY KEY,
  name           VARCHAR(255) NOT NULL,
  target_key     VARCHAR(64),
  start_urls     JSONB,
  selectors      JSONB,
  schedule_cron  VARCHAR(64),
  status         VARCHAR(32)  NOT NULL DEFAULT 'pending',
  is_enabled     BOOLEAN      NOT NULL DEFAULT true,
  last_run_at    TIMESTAMPTZ,
  config         JSONB,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_crawler_jobs_target_key ON crawler_jobs (target_key);
CREATE OR REPLACE TRIGGER trg_crawler_jobs_updated_at
  BEFORE UPDATE ON crawler_jobs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS dashboards (
  id           SERIAL PRIMARY KEY,
  key          VARCHAR(64)  NOT NULL,
  name         VARCHAR(255) NOT NULL,
  description  TEXT,
  layout       JSONB,
  is_public    BOOLEAN      NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_dashboards_key UNIQUE (key)
);
CREATE UNIQUE INDEX IF NOT EXISTS ix_dashboards_key ON dashboards (key);
CREATE OR REPLACE TRIGGER trg_dashboards_updated_at
  BEFORE UPDATE ON dashboards
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS education (
  id              SERIAL PRIMARY KEY,
  degree          VARCHAR(255) NOT NULL,
  institution     VARCHAR(255),
  field_of_study  VARCHAR(255),
  start_date      VARCHAR(32),
  end_date        VARCHAR(32),
  description     TEXT,
  "order"         INTEGER      NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE OR REPLACE TRIGGER trg_education_updated_at
  BEFORE UPDATE ON education
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS experiences (
  id           SERIAL PRIMARY KEY,
  role         VARCHAR(255) NOT NULL,
  company      VARCHAR(255),
  location     VARCHAR(255),
  start_date   VARCHAR(32),
  end_date     VARCHAR(32),
  is_current   BOOLEAN      NOT NULL DEFAULT false,
  description  TEXT,
  highlights   JSONB,
  "order"      INTEGER      NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE OR REPLACE TRIGGER trg_experiences_updated_at
  BEFORE UPDATE ON experiences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS feature_flags (
  id           SERIAL PRIMARY KEY,
  key          VARCHAR(64)  NOT NULL,
  label        VARCHAR(128),
  description  VARCHAR(512),
  enabled      BOOLEAN      NOT NULL DEFAULT false,
  "group"      VARCHAR(64)  NOT NULL DEFAULT 'general',
  config       JSONB,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_feature_flags_key UNIQUE (key)
);
CREATE UNIQUE INDEX IF NOT EXISTS ix_feature_flags_key   ON feature_flags (key);
CREATE INDEX        IF NOT EXISTS ix_feature_flags_group ON feature_flags ("group");
CREATE OR REPLACE TRIGGER trg_feature_flags_updated_at
  BEFORE UPDATE ON feature_flags
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- hero_section: includes columns added in migration b065094ad9ba
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS hero_section (
  id                      SERIAL PRIMARY KEY,
  title                   VARCHAR(255),
  subtitle                VARCHAR(512),
  name                    VARCHAR(255),
  cta_text                VARCHAR(128),
  cta_url                 VARCHAR(1024),
  hero_image_url          VARCHAR(1024),
  background_image_url    VARCHAR(1024),
  background_color        VARCHAR(32),
  background_mode         VARCHAR(16)  NOT NULL DEFAULT 'color',
  animation               VARCHAR(64),
  parallax_speed          DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  is_visible              BOOLEAN      NOT NULL DEFAULT true,
  avatar_url              VARCHAR(1024),
  avatar_shape            VARCHAR(16)  NOT NULL DEFAULT 'circle',
  created_at              TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE OR REPLACE TRIGGER trg_hero_section_updated_at
  BEFORE UPDATE ON hero_section
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS microservices (
  id               SERIAL PRIMARY KEY,
  key              VARCHAR(64)   NOT NULL,
  name             VARCHAR(255)  NOT NULL,
  description      TEXT,
  category         VARCHAR(64),
  icon             VARCHAR(128),
  feature_flag_key VARCHAR(64),
  base_url         VARCHAR(1024),
  health_url       VARCHAR(1024),
  status           VARCHAR(32)   NOT NULL DEFAULT 'registered',
  config           JSONB,
  is_public        BOOLEAN       NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_microservices_key UNIQUE (key)
);
CREATE UNIQUE INDEX IF NOT EXISTS ix_microservices_key              ON microservices (key);
CREATE INDEX        IF NOT EXISTS ix_microservices_category         ON microservices (category);
CREATE INDEX        IF NOT EXISTS ix_microservices_feature_flag_key ON microservices (feature_flag_key);
CREATE OR REPLACE TRIGGER trg_microservices_updated_at
  BEFORE UPDATE ON microservices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS permissions (
  id           SERIAL PRIMARY KEY,
  code         VARCHAR(128) NOT NULL,
  description  VARCHAR(255),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_permissions_code UNIQUE (code)
);
CREATE UNIQUE INDEX IF NOT EXISTS ix_permissions_code ON permissions (code);
CREATE OR REPLACE TRIGGER trg_permissions_updated_at
  BEFORE UPDATE ON permissions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS portfolio_images (
  id         SERIAL PRIMARY KEY,
  url        VARCHAR(1024) NOT NULL,
  alt_text   VARCHAR(255),
  caption    VARCHAR(512),
  category   VARCHAR(64),
  "order"    INTEGER       NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_portfolio_images_category ON portfolio_images (category);
CREATE OR REPLACE TRIGGER trg_portfolio_images_updated_at
  BEFORE UPDATE ON portfolio_images
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS projects (
  id               SERIAL PRIMARY KEY,
  title            VARCHAR(255)  NOT NULL,
  slug             VARCHAR(255)  NOT NULL,
  summary          VARCHAR(512),
  description      TEXT,
  cover_image_url  VARCHAR(1024),
  video_url        VARCHAR(1024),
  github_url       VARCHAR(1024),
  demo_url         VARCHAR(1024),
  status           VARCHAR(32)   NOT NULL DEFAULT 'draft',
  tech_tags        JSONB,
  is_featured      BOOLEAN       NOT NULL DEFAULT false,
  is_hidden        BOOLEAN       NOT NULL DEFAULT false,
  "order"          INTEGER       NOT NULL DEFAULT 0,
  service_key      VARCHAR(64),
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_projects_slug UNIQUE (slug)
);
CREATE UNIQUE INDEX IF NOT EXISTS ix_projects_slug        ON projects (slug);
CREATE INDEX        IF NOT EXISTS ix_projects_service_key ON projects (service_key);
CREATE OR REPLACE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS recommendations (
  id            SERIAL PRIMARY KEY,
  author_name   VARCHAR(255)  NOT NULL,
  position      VARCHAR(255),
  company       VARCHAR(255),
  linkedin_url  VARCHAR(1024),
  avatar_url    VARCHAR(1024),
  quote         TEXT          NOT NULL,
  stars         INTEGER       NOT NULL DEFAULT 5,
  "order"       INTEGER       NOT NULL DEFAULT 0,
  is_visible    BOOLEAN       NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE OR REPLACE TRIGGER trg_recommendations_updated_at
  BEFORE UPDATE ON recommendations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS report_templates (
  id             SERIAL PRIMARY KEY,
  key            VARCHAR(64)  NOT NULL,
  name           VARCHAR(255) NOT NULL,
  description    TEXT,
  format         VARCHAR(16)  NOT NULL DEFAULT 'json',
  template_body  TEXT,
  config         JSONB,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_report_templates_key UNIQUE (key)
);
CREATE UNIQUE INDEX IF NOT EXISTS ix_report_templates_key ON report_templates (key);
CREATE OR REPLACE TRIGGER trg_report_templates_updated_at
  BEFORE UPDATE ON report_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS reports (
  id            SERIAL PRIMARY KEY,
  title         VARCHAR(255) NOT NULL,
  template_key  VARCHAR(64),
  format        VARCHAR(16)  NOT NULL DEFAULT 'json',
  status        VARCHAR(32)  NOT NULL DEFAULT 'pending',
  file_url      VARCHAR(1024),
  params        JSONB,
  generated_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_reports_template_key ON reports (template_key);
CREATE OR REPLACE TRIGGER trg_reports_updated_at
  BEFORE UPDATE ON reports
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS resume (
  id            SERIAL PRIMARY KEY,
  title         VARCHAR(255) NOT NULL,
  pdf_url       VARCHAR(1024),
  is_generated  BOOLEAN      NOT NULL DEFAULT false,
  summary       TEXT,
  is_public     BOOLEAN      NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE OR REPLACE TRIGGER trg_resume_updated_at
  BEFORE UPDATE ON resume
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS roles (
  id           SERIAL PRIMARY KEY,
  name         VARCHAR(64)  NOT NULL,
  description  VARCHAR(255),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_roles_name UNIQUE (name)
);
CREATE UNIQUE INDEX IF NOT EXISTS ix_roles_name ON roles (name);
CREATE OR REPLACE TRIGGER trg_roles_updated_at
  BEFORE UPDATE ON roles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS scheduled_jobs (
  id                SERIAL PRIMARY KEY,
  name              VARCHAR(255) NOT NULL,
  task              VARCHAR(128) NOT NULL,
  cron              VARCHAR(64),
  interval_seconds  INTEGER,
  args              JSONB,
  is_enabled        BOOLEAN      NOT NULL DEFAULT true,
  last_run_at       TIMESTAMPTZ,
  next_run_at       TIMESTAMPTZ,
  status            VARCHAR(32)  NOT NULL DEFAULT 'idle',
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE OR REPLACE TRIGGER trg_scheduled_jobs_updated_at
  BEFORE UPDATE ON scheduled_jobs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS settings (
  id           SERIAL PRIMARY KEY,
  key          VARCHAR(128) NOT NULL,
  value        JSONB,
  "group"      VARCHAR(64)  NOT NULL DEFAULT 'general',
  description  VARCHAR(255),
  is_public    BOOLEAN      NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_settings_key UNIQUE (key)
);
CREATE UNIQUE INDEX IF NOT EXISTS ix_settings_key   ON settings (key);
CREATE INDEX        IF NOT EXISTS ix_settings_group ON settings ("group");
CREATE OR REPLACE TRIGGER trg_settings_updated_at
  BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- site_configuration: includes columns added in migration b065094ad9ba
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS site_configuration (
  id                     SERIAL PRIMARY KEY,
  site_name              VARCHAR(255)  NOT NULL,
  tagline                VARCHAR(512),
  logo_url               VARCHAR(1024),
  favicon_url            VARCHAR(1024),
  meta_title             VARCHAR(255),
  meta_description       TEXT,
  meta_keywords          TEXT,
  og_image_url           VARCHAR(1024),
  twitter_handle         VARCHAR(64),
  structured_data        JSONB,
  analytics_provider     VARCHAR(64),
  analytics_id           VARCHAR(128),
  cookie_banner_enabled  BOOLEAN       NOT NULL DEFAULT false,
  cookie_banner_text     TEXT,
  robots_txt             TEXT,
  maintenance_mode       BOOLEAN       NOT NULL DEFAULT false,
  default_locale         VARCHAR(8)    NOT NULL DEFAULT 'en',
  contact_email          VARCHAR(255),
  phone                  VARCHAR(64),
  location_address       VARCHAR(512),
  map_embed_url          TEXT,
  created_at             TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE OR REPLACE TRIGGER trg_site_configuration_updated_at
  BEFORE UPDATE ON site_configuration
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS skills (
  id           SERIAL PRIMARY KEY,
  name         VARCHAR(128) NOT NULL,
  category     VARCHAR(64),
  icon         VARCHAR(128),
  proficiency  INTEGER      NOT NULL DEFAULT 0,
  "order"      INTEGER      NOT NULL DEFAULT 0,
  is_visible   BOOLEAN      NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_skills_category ON skills (category);
CREATE OR REPLACE TRIGGER trg_skills_updated_at
  BEFORE UPDATE ON skills
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS social_links (
  id         SERIAL PRIMARY KEY,
  platform   VARCHAR(64)   NOT NULL,
  url        VARCHAR(1024) NOT NULL,
  icon       VARCHAR(64),
  label      VARCHAR(128),
  "order"    INTEGER       NOT NULL DEFAULT 0,
  is_visible BOOLEAN       NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE OR REPLACE TRIGGER trg_social_links_updated_at
  BEFORE UPDATE ON social_links
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS storage_files (
  id            SERIAL PRIMARY KEY,
  key           VARCHAR(512) NOT NULL,
  bucket        VARCHAR(128),
  provider      VARCHAR(32)  NOT NULL DEFAULT 'supabase',
  url           VARCHAR(1024),
  content_type  VARCHAR(128),
  size_bytes    BIGINT       NOT NULL DEFAULT 0,
  meta          JSONB,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_storage_files_key ON storage_files (key);
CREATE OR REPLACE TRIGGER trg_storage_files_updated_at
  BEFORE UPDATE ON storage_files
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tags (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(64)  NOT NULL,
  slug       VARCHAR(64)  NOT NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_tags_name UNIQUE (name),
  CONSTRAINT uq_tags_slug UNIQUE (slug)
);
CREATE UNIQUE INDEX IF NOT EXISTS ix_tags_slug ON tags (slug);
CREATE OR REPLACE TRIGGER trg_tags_updated_at
  BEFORE UPDATE ON tags
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS technologies (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(128) NOT NULL,
  icon       VARCHAR(128),
  color      VARCHAR(32),
  category   VARCHAR(64),
  created_at TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_technologies_name UNIQUE (name)
);
CREATE INDEX IF NOT EXISTS ix_technologies_category ON technologies (category);
CREATE OR REPLACE TRIGGER trg_technologies_updated_at
  BEFORE UPDATE ON technologies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS themes (
  id                   SERIAL PRIMARY KEY,
  name                 VARCHAR(64)  NOT NULL,
  default_mode         VARCHAR(8)   NOT NULL DEFAULT 'dark',
  primary_color        VARCHAR(32)  NOT NULL,
  secondary_color      VARCHAR(32)  NOT NULL,
  accent_color         VARCHAR(32)  NOT NULL,
  background_dark      VARCHAR(32)  NOT NULL,
  background_light     VARCHAR(32)  NOT NULL,
  text_dark            VARCHAR(32)  NOT NULL,
  text_light           VARCHAR(32)  NOT NULL,
  font_family          VARCHAR(128) NOT NULL,
  heading_font_family  VARCHAR(128),
  base_font_size       VARCHAR(16)  NOT NULL DEFAULT '16px',
  spacing_unit         VARCHAR(16)  NOT NULL DEFAULT '4px',
  border_radius        VARCHAR(16)  NOT NULL DEFAULT '8px',
  card_shadow          VARCHAR(128) NOT NULL,
  animations_enabled   BOOLEAN      NOT NULL DEFAULT true,
  parallax_enabled     BOOLEAN      NOT NULL DEFAULT true,
  extra_tokens         JSONB,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE OR REPLACE TRIGGER trg_themes_updated_at
  BEFORE UPDATE ON themes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS timeline (
  id          SERIAL PRIMARY KEY,
  title       VARCHAR(255) NOT NULL,
  subtitle    VARCHAR(255),
  description TEXT,
  icon        VARCHAR(128),
  date_label  VARCHAR(64),
  sort_key    DOUBLE PRECISION NOT NULL DEFAULT 0,
  is_visible  BOOLEAN      NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE OR REPLACE TRIGGER trg_timeline_updated_at
  BEFORE UPDATE ON timeline
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id               SERIAL PRIMARY KEY,
  email            VARCHAR(255) NOT NULL,
  hashed_password  VARCHAR(255) NOT NULL,
  full_name        VARCHAR(255),
  is_active        BOOLEAN      NOT NULL DEFAULT true,
  is_superuser     BOOLEAN      NOT NULL DEFAULT false,
  avatar_url       VARCHAR(1024),
  last_login_at    TIMESTAMPTZ,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_users_email UNIQUE (email)
);
CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email ON users (email);
CREATE OR REPLACE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- Tables added in migration b065094ad9ba
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS contact_messages (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  email       VARCHAR(255) NOT NULL,
  subject     VARCHAR(255),
  message     TEXT         NOT NULL,
  ip_address  VARCHAR(64),
  is_read     BOOLEAN      NOT NULL DEFAULT false,
  delivered   BOOLEAN      NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE OR REPLACE TRIGGER trg_contact_messages_updated_at
  BEFORE UPDATE ON contact_messages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS media_assets (
  id            SERIAL PRIMARY KEY,
  filename      VARCHAR(255)  NOT NULL,
  content_type  VARCHAR(128)  NOT NULL,
  size_bytes    BIGINT        NOT NULL DEFAULT 0,
  data          BYTEA         NOT NULL,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE OR REPLACE TRIGGER trg_media_assets_updated_at
  BEFORE UPDATE ON media_assets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS sections (
  id            SERIAL PRIMARY KEY,
  key           VARCHAR(64)  NOT NULL,
  label         VARCHAR(128) NOT NULL,
  enabled       BOOLEAN      NOT NULL DEFAULT true,
  "order"       INTEGER      NOT NULL DEFAULT 0,
  is_removable  BOOLEAN      NOT NULL DEFAULT true,
  in_nav        BOOLEAN      NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_sections_key UNIQUE (key)
);
CREATE UNIQUE INDEX IF NOT EXISTS ix_sections_key ON sections (key);
CREATE OR REPLACE TRIGGER trg_sections_updated_at
  BEFORE UPDATE ON sections
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- Tables added in migration cc3d4e5f6a7b
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app_tokens (
  id           SERIAL PRIMARY KEY,
  token        VARCHAR(64)  NOT NULL,
  expires_at   TIMESTAMPTZ  NOT NULL,
  is_used      BOOLEAN      NOT NULL DEFAULT false,
  used_by_ip   VARCHAR(64),
  used_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_app_tokens_token UNIQUE (token)
);
CREATE INDEX IF NOT EXISTS ix_app_tokens_token ON app_tokens (token);
CREATE OR REPLACE TRIGGER trg_app_tokens_updated_at
  BEFORE UPDATE ON app_tokens
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ip_usage_logs (
  id         SERIAL PRIMARY KEY,
  ip         VARCHAR(64) NOT NULL,
  app_name   VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_ip_app_usage UNIQUE (ip, app_name)
);
CREATE INDEX IF NOT EXISTS ix_ip_usage_logs_ip ON ip_usage_logs (ip);
CREATE OR REPLACE TRIGGER trg_ip_usage_logs_updated_at
  BEFORE UPDATE ON ip_usage_logs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- Tables added in migration ff1a2b3c4d5e
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS hotel_crawl_sessions (
  id                SERIAL PRIMARY KEY,
  name              VARCHAR(255)   NOT NULL,
  target_url        VARCHAR(2048)  NOT NULL,
  collection_prompt TEXT           NOT NULL,
  analytics_spec    JSONB,
  max_pages         INTEGER        NOT NULL DEFAULT 5,
  status            VARCHAR(32)    NOT NULL DEFAULT 'pending',
  progress          JSONB,
  analytics_result  JSONB,
  error             TEXT,
  created_at        TIMESTAMPTZ    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMPTZ    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE OR REPLACE TRIGGER trg_hotel_crawl_sessions_updated_at
  BEFORE UPDATE ON hotel_crawl_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- TABLES WITH FOREIGN KEY DEPENDENCIES
-- =============================================================================

CREATE TABLE IF NOT EXISTS agent_tasks (
  id          SERIAL PRIMARY KEY,
  agent_id    INTEGER REFERENCES ai_agents (id) ON DELETE SET NULL,
  title       VARCHAR(255) NOT NULL,
  input       JSONB,
  plan        JSONB,
  output      JSONB,
  status      VARCHAR(32)  NOT NULL DEFAULT 'pending',
  stage       VARCHAR(32)  NOT NULL DEFAULT 'init',
  attempts    INTEGER      NOT NULL DEFAULT 0,
  error       TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_agent_tasks_agent_id ON agent_tasks (agent_id);
CREATE OR REPLACE TRIGGER trg_agent_tasks_updated_at
  BEFORE UPDATE ON agent_tasks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS api_keys (
  id           SERIAL PRIMARY KEY,
  name         VARCHAR(128) NOT NULL,
  prefix       VARCHAR(16)  NOT NULL,
  hashed_key   VARCHAR(255) NOT NULL,
  user_id      INTEGER REFERENCES users (id) ON DELETE SET NULL,
  scopes       JSONB        NOT NULL DEFAULT '[]',
  is_active    BOOLEAN      NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_api_keys_prefix ON api_keys (prefix);
CREATE OR REPLACE TRIGGER trg_api_keys_updated_at
  BEFORE UPDATE ON api_keys
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS audit_logs (
  id          SERIAL PRIMARY KEY,
  actor_id    INTEGER REFERENCES users (id) ON DELETE SET NULL,
  action      VARCHAR(128) NOT NULL,
  entity      VARCHAR(128),
  entity_id   VARCHAR(64),
  detail      JSONB,
  ip_address  VARCHAR(64),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE OR REPLACE TRIGGER trg_audit_logs_updated_at
  BEFORE UPDATE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- blog_posts: base columns + is_featured/like_count (da1daa73c50a) + service_key (e9f3b2d15a77)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS blog_posts (
  id                SERIAL PRIMARY KEY,
  title             VARCHAR(255)  NOT NULL,
  slug              VARCHAR(255)  NOT NULL,
  excerpt           TEXT,
  content_markdown  TEXT,
  cover_image_url   VARCHAR(1024),
  status            VARCHAR(32)   NOT NULL DEFAULT 'draft',
  published_at      TIMESTAMPTZ,
  scheduled_at      TIMESTAMPTZ,
  reading_minutes   INTEGER,
  is_featured       BOOLEAN       NOT NULL DEFAULT false,
  like_count        INTEGER       NOT NULL DEFAULT 0,
  meta_title        VARCHAR(255),
  meta_description  TEXT,
  seo               JSONB,
  service_key       VARCHAR(64),
  category_id       INTEGER REFERENCES categories (id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_blog_posts_slug UNIQUE (slug)
);
CREATE UNIQUE INDEX IF NOT EXISTS ix_blog_posts_slug        ON blog_posts (slug);
CREATE INDEX        IF NOT EXISTS ix_blog_posts_service_key ON blog_posts (service_key);
CREATE OR REPLACE TRIGGER trg_blog_posts_updated_at
  BEFORE UPDATE ON blog_posts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS crawler_logs (
  id             SERIAL PRIMARY KEY,
  job_id         INTEGER     NOT NULL REFERENCES crawler_jobs (id) ON DELETE CASCADE,
  level          VARCHAR(16) NOT NULL,
  message        TEXT        NOT NULL,
  context        JSONB,
  healing_event  JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_crawler_logs_job_id ON crawler_logs (job_id);
CREATE OR REPLACE TRIGGER trg_crawler_logs_updated_at
  BEFORE UPDATE ON crawler_logs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS crawler_results (
  id           SERIAL PRIMARY KEY,
  job_id       INTEGER       NOT NULL REFERENCES crawler_jobs (id) ON DELETE CASCADE,
  payload      JSONB         NOT NULL DEFAULT '{}',
  row_count    INTEGER       NOT NULL DEFAULT 0,
  storage_url  VARCHAR(1024),
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_crawler_results_job_id ON crawler_results (job_id);
CREATE OR REPLACE TRIGGER trg_crawler_results_updated_at
  BEFORE UPDATE ON crawler_results
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS notifications (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER REFERENCES users (id) ON DELETE CASCADE,
  title      VARCHAR(255) NOT NULL,
  body       TEXT,
  level      VARCHAR(16)  NOT NULL DEFAULT 'info',
  channel    VARCHAR(32)  NOT NULL DEFAULT 'in_app',
  is_read    BOOLEAN      NOT NULL DEFAULT false,
  data       JSONB,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE OR REPLACE TRIGGER trg_notifications_updated_at
  BEFORE UPDATE ON notifications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS project_images (
  id          SERIAL PRIMARY KEY,
  project_id  INTEGER       NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  url         VARCHAR(1024) NOT NULL,
  alt_text    VARCHAR(255),
  "order"     INTEGER       NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_project_images_project_id ON project_images (project_id);
CREATE OR REPLACE TRIGGER trg_project_images_updated_at
  BEFORE UPDATE ON project_images
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- Tables added in migration da1daa73c50a
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS blog_comments (
  id            SERIAL PRIMARY KEY,
  post_id       INTEGER     NOT NULL REFERENCES blog_posts (id) ON DELETE CASCADE,
  author_name   VARCHAR(128) NOT NULL,
  author_email  VARCHAR(255),
  content       TEXT        NOT NULL,
  is_approved   BOOLEAN     NOT NULL DEFAULT true,
  ip_address    VARCHAR(64),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_blog_comments_post_id ON blog_comments (post_id);
CREATE OR REPLACE TRIGGER trg_blog_comments_updated_at
  BEFORE UPDATE ON blog_comments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS blog_likes (
  id           SERIAL PRIMARY KEY,
  post_id      INTEGER     NOT NULL REFERENCES blog_posts (id) ON DELETE CASCADE,
  fingerprint  VARCHAR(128) NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_blog_likes_post_id     ON blog_likes (post_id);
CREATE INDEX IF NOT EXISTS ix_blog_likes_fingerprint ON blog_likes (fingerprint);
CREATE OR REPLACE TRIGGER trg_blog_likes_updated_at
  BEFORE UPDATE ON blog_likes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- Tables added in migration ff1a2b3c4d5e (continued — depends on hotel_crawl_sessions)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS hotel_crawl_records (
  id                SERIAL PRIMARY KEY,
  session_id        INTEGER  NOT NULL REFERENCES hotel_crawl_sessions (id) ON DELETE CASCADE,
  source_url        VARCHAR(2048),
  data              JSONB,
  is_valid          BOOLEAN  NOT NULL DEFAULT true,
  validation_errors JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_hotel_crawl_records_session_id ON hotel_crawl_records (session_id);
CREATE OR REPLACE TRIGGER trg_hotel_crawl_records_updated_at
  BEFORE UPDATE ON hotel_crawl_records
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- JUNCTION / MANY-TO-MANY TABLES (no updated_at — composite PK only)
-- =============================================================================

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id        INTEGER NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
  permission_id  INTEGER NOT NULL REFERENCES permissions (id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id  INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role_id  INTEGER NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS post_tags (
  post_id  INTEGER NOT NULL REFERENCES blog_posts (id) ON DELETE CASCADE,
  tag_id   INTEGER NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);

-- =============================================================================
-- END
-- =============================================================================
