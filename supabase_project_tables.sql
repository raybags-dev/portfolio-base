-- =============================================================================
-- portfolio-base: Pre-emptive project tables
-- One schema block per Feature Flag project (group: "projects").
-- Run this in the Supabase SQL editor after supabase_migrations.sql.
-- Projects covered (Hotel Reviews already migrated — skipped here):
--   ENABLE_RETAIL     Retail Price Intelligence
--   ENABLE_SPORTS     Sports Analytics
--   ENABLE_WEATHER    Weather Pipeline
--   ENABLE_NEWS       News Pipeline
--   ENABLE_STOCKS     Stock Pipeline
--   ENABLE_CRYPTO     Crypto Analytics
--   ENABLE_AIRLINE    Airline Price Tracker
--   ENABLE_JOBS       Job Market Analytics
--   ENABLE_ENERGY     Energy Market Pipeline
--   ENABLE_SOCIAL     Social Media Trends
--   ENABLE_ANNOTATION Data Annotation Platform
-- =============================================================================


-- =============================================================================
-- RETAIL PRICE INTELLIGENCE  (ENABLE_RETAIL)
-- =============================================================================

CREATE TABLE IF NOT EXISTS retail_products (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(512)  NOT NULL,
  sku             VARCHAR(128),
  brand           VARCHAR(255),
  category        VARCHAR(128),
  description     TEXT,
  image_url       VARCHAR(1024),
  source_url      VARCHAR(1024),
  source_platform VARCHAR(128),
  metadata        JSONB,
  is_active       BOOLEAN       NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_retail_products_category  ON retail_products (category);
CREATE INDEX IF NOT EXISTS ix_retail_products_brand     ON retail_products (brand);
CREATE OR REPLACE TRIGGER trg_retail_products_updated_at
  BEFORE UPDATE ON retail_products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS retail_price_snapshots (
  id              SERIAL PRIMARY KEY,
  product_id      INTEGER       NOT NULL REFERENCES retail_products (id) ON DELETE CASCADE,
  price           NUMERIC(12,2) NOT NULL,
  currency        VARCHAR(8)    NOT NULL DEFAULT 'USD',
  original_price  NUMERIC(12,2),
  discount_pct    NUMERIC(5,2),
  seller          VARCHAR(255),
  in_stock        BOOLEAN       NOT NULL DEFAULT true,
  scraped_at      TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source_url      VARCHAR(1024),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_retail_price_snapshots_product_id ON retail_price_snapshots (product_id);
CREATE INDEX IF NOT EXISTS ix_retail_price_snapshots_scraped_at ON retail_price_snapshots (scraped_at);

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS retail_price_alerts (
  id                   SERIAL PRIMARY KEY,
  product_id           INTEGER       NOT NULL REFERENCES retail_products (id) ON DELETE CASCADE,
  target_price         NUMERIC(12,2) NOT NULL,
  currency             VARCHAR(8)    NOT NULL DEFAULT 'USD',
  email                VARCHAR(255),
  is_triggered         BOOLEAN       NOT NULL DEFAULT false,
  triggered_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE OR REPLACE TRIGGER trg_retail_price_alerts_updated_at
  BEFORE UPDATE ON retail_price_alerts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS retail_crawl_sessions (
  id             SERIAL PRIMARY KEY,
  name           VARCHAR(255)  NOT NULL,
  target_url     VARCHAR(1024) NOT NULL,
  status         VARCHAR(32)   NOT NULL DEFAULT 'pending',
  config         JSONB,
  records_count  INTEGER       NOT NULL DEFAULT 0,
  error          TEXT,
  started_at     TIMESTAMPTZ,
  finished_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE OR REPLACE TRIGGER trg_retail_crawl_sessions_updated_at
  BEFORE UPDATE ON retail_crawl_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================================
-- SPORTS ANALYTICS  (ENABLE_SPORTS)
-- =============================================================================

CREATE TABLE IF NOT EXISTS sports_leagues (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(255)  NOT NULL,
  sport       VARCHAR(64)   NOT NULL,
  country     VARCHAR(64),
  logo_url    VARCHAR(1024),
  season      VARCHAR(32),
  is_active   BOOLEAN       NOT NULL DEFAULT true,
  metadata    JSONB,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_sports_leagues_sport ON sports_leagues (sport);
CREATE OR REPLACE TRIGGER trg_sports_leagues_updated_at
  BEFORE UPDATE ON sports_leagues
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS sports_teams (
  id          SERIAL PRIMARY KEY,
  league_id   INTEGER       REFERENCES sports_leagues (id) ON DELETE SET NULL,
  name        VARCHAR(255)  NOT NULL,
  short_name  VARCHAR(32),
  sport       VARCHAR(64)   NOT NULL,
  country     VARCHAR(64),
  logo_url    VARCHAR(1024),
  founded     INTEGER,
  metadata    JSONB,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_sports_teams_sport     ON sports_teams (sport);
CREATE INDEX IF NOT EXISTS ix_sports_teams_league_id ON sports_teams (league_id);
CREATE OR REPLACE TRIGGER trg_sports_teams_updated_at
  BEFORE UPDATE ON sports_teams
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS sports_players (
  id           SERIAL PRIMARY KEY,
  team_id      INTEGER       REFERENCES sports_teams (id) ON DELETE SET NULL,
  name         VARCHAR(255)  NOT NULL,
  position     VARCHAR(64),
  nationality  VARCHAR(64),
  date_of_birth DATE,
  jersey_number INTEGER,
  stats        JSONB,
  metadata     JSONB,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_sports_players_team_id ON sports_players (team_id);
CREATE OR REPLACE TRIGGER trg_sports_players_updated_at
  BEFORE UPDATE ON sports_players
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS sports_events (
  id              SERIAL PRIMARY KEY,
  league_id       INTEGER       REFERENCES sports_leagues (id) ON DELETE SET NULL,
  home_team_id    INTEGER       REFERENCES sports_teams (id) ON DELETE SET NULL,
  away_team_id    INTEGER       REFERENCES sports_teams (id) ON DELETE SET NULL,
  event_date      TIMESTAMPTZ   NOT NULL,
  venue           VARCHAR(255),
  status          VARCHAR(32)   NOT NULL DEFAULT 'scheduled',
  home_score      INTEGER,
  away_score      INTEGER,
  result          JSONB,
  source_url      VARCHAR(1024),
  metadata        JSONB,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_sports_events_league_id  ON sports_events (league_id);
CREATE INDEX IF NOT EXISTS ix_sports_events_event_date ON sports_events (event_date);
CREATE OR REPLACE TRIGGER trg_sports_events_updated_at
  BEFORE UPDATE ON sports_events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS sports_stats_snapshots (
  id           SERIAL PRIMARY KEY,
  entity_type  VARCHAR(16)   NOT NULL,
  entity_id    INTEGER       NOT NULL,
  stat_date    DATE          NOT NULL,
  stats        JSONB         NOT NULL,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_sports_stats_snapshots_entity ON sports_stats_snapshots (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS ix_sports_stats_snapshots_date   ON sports_stats_snapshots (stat_date);


-- =============================================================================
-- WEATHER PIPELINE  (ENABLE_WEATHER)
-- =============================================================================

CREATE TABLE IF NOT EXISTS weather_locations (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(255)  NOT NULL,
  country     VARCHAR(64)   NOT NULL,
  region      VARCHAR(128),
  latitude    FLOAT         NOT NULL,
  longitude   FLOAT         NOT NULL,
  timezone    VARCHAR(64),
  is_active   BOOLEAN       NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE OR REPLACE TRIGGER trg_weather_locations_updated_at
  BEFORE UPDATE ON weather_locations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS weather_observations (
  id               SERIAL PRIMARY KEY,
  location_id      INTEGER       NOT NULL REFERENCES weather_locations (id) ON DELETE CASCADE,
  observed_at      TIMESTAMPTZ   NOT NULL,
  temp_c           FLOAT,
  feels_like_c     FLOAT,
  humidity_pct     FLOAT,
  wind_kmh         FLOAT,
  wind_direction   VARCHAR(8),
  pressure_hpa     FLOAT,
  visibility_km    FLOAT,
  uv_index         FLOAT,
  condition        VARCHAR(128),
  icon             VARCHAR(64),
  raw_data         JSONB,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_weather_observations_location_id ON weather_observations (location_id);
CREATE INDEX IF NOT EXISTS ix_weather_observations_observed_at ON weather_observations (observed_at);

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS weather_forecasts (
  id            SERIAL PRIMARY KEY,
  location_id   INTEGER       NOT NULL REFERENCES weather_locations (id) ON DELETE CASCADE,
  forecast_date DATE          NOT NULL,
  fetched_at    TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source        VARCHAR(64),
  hourly        JSONB,
  daily         JSONB,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_weather_forecasts_location_id   ON weather_forecasts (location_id);
CREATE INDEX IF NOT EXISTS ix_weather_forecasts_forecast_date ON weather_forecasts (forecast_date);

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS weather_alerts (
  id           SERIAL PRIMARY KEY,
  location_id  INTEGER       NOT NULL REFERENCES weather_locations (id) ON DELETE CASCADE,
  alert_type   VARCHAR(64)   NOT NULL,
  severity     VARCHAR(32),
  headline     VARCHAR(512),
  description  TEXT,
  effective_at TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ,
  source       VARCHAR(64),
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_weather_alerts_location_id ON weather_alerts (location_id);


-- =============================================================================
-- NEWS PIPELINE  (ENABLE_NEWS)
-- =============================================================================

CREATE TABLE IF NOT EXISTS news_sources (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(255)  NOT NULL,
  domain          VARCHAR(255)  NOT NULL UNIQUE,
  feed_url        VARCHAR(1024),
  category        VARCHAR(64),
  country         VARCHAR(64),
  language        VARCHAR(8)    NOT NULL DEFAULT 'en',
  crawl_schedule  VARCHAR(64),
  is_active       BOOLEAN       NOT NULL DEFAULT true,
  metadata        JSONB,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE OR REPLACE TRIGGER trg_news_sources_updated_at
  BEFORE UPDATE ON news_sources
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS news_articles (
  id               SERIAL PRIMARY KEY,
  source_id        INTEGER       REFERENCES news_sources (id) ON DELETE SET NULL,
  headline         VARCHAR(1024) NOT NULL,
  slug             VARCHAR(512),
  summary          TEXT,
  content          TEXT,
  author           VARCHAR(255),
  published_at     TIMESTAMPTZ,
  url              VARCHAR(2048) NOT NULL UNIQUE,
  image_url        VARCHAR(1024),
  category         VARCHAR(64),
  tags             JSONB,
  sentiment_score  FLOAT,
  sentiment_label  VARCHAR(16),
  is_processed     BOOLEAN       NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_news_articles_source_id    ON news_articles (source_id);
CREATE INDEX IF NOT EXISTS ix_news_articles_published_at ON news_articles (published_at);
CREATE INDEX IF NOT EXISTS ix_news_articles_category     ON news_articles (category);
CREATE OR REPLACE TRIGGER trg_news_articles_updated_at
  BEFORE UPDATE ON news_articles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS news_topics (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(255)  NOT NULL UNIQUE,
  keywords    JSONB         NOT NULL DEFAULT '[]',
  is_active   BOOLEAN       NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE OR REPLACE TRIGGER trg_news_topics_updated_at
  BEFORE UPDATE ON news_topics
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS news_topic_articles (
  id               SERIAL PRIMARY KEY,
  topic_id         INTEGER       NOT NULL REFERENCES news_topics (id) ON DELETE CASCADE,
  article_id       INTEGER       NOT NULL REFERENCES news_articles (id) ON DELETE CASCADE,
  relevance_score  FLOAT,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_news_topic_articles UNIQUE (topic_id, article_id)
);
CREATE INDEX IF NOT EXISTS ix_news_topic_articles_topic_id   ON news_topic_articles (topic_id);
CREATE INDEX IF NOT EXISTS ix_news_topic_articles_article_id ON news_topic_articles (article_id);


-- =============================================================================
-- STOCK PIPELINE  (ENABLE_STOCKS)
-- =============================================================================

CREATE TABLE IF NOT EXISTS stocks_instruments (
  id          SERIAL PRIMARY KEY,
  ticker      VARCHAR(16)   NOT NULL UNIQUE,
  name        VARCHAR(255)  NOT NULL,
  exchange    VARCHAR(32),
  type        VARCHAR(16)   NOT NULL DEFAULT 'stock',
  sector      VARCHAR(128),
  industry    VARCHAR(128),
  currency    VARCHAR(8)    NOT NULL DEFAULT 'USD',
  is_active   BOOLEAN       NOT NULL DEFAULT true,
  metadata    JSONB,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS ix_stocks_instruments_ticker ON stocks_instruments (ticker);
CREATE OR REPLACE TRIGGER trg_stocks_instruments_updated_at
  BEFORE UPDATE ON stocks_instruments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS stocks_price_snapshots (
  id              SERIAL PRIMARY KEY,
  instrument_id   INTEGER       NOT NULL REFERENCES stocks_instruments (id) ON DELETE CASCADE,
  interval        VARCHAR(8)    NOT NULL DEFAULT '1d',
  open            FLOAT         NOT NULL,
  high            FLOAT         NOT NULL,
  low             FLOAT         NOT NULL,
  close           FLOAT         NOT NULL,
  adj_close       FLOAT,
  volume          BIGINT,
  recorded_at     TIMESTAMPTZ   NOT NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_stocks_price_snapshots_instrument_id ON stocks_price_snapshots (instrument_id);
CREATE INDEX IF NOT EXISTS ix_stocks_price_snapshots_recorded_at   ON stocks_price_snapshots (recorded_at);

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS stocks_fundamentals (
  id              SERIAL PRIMARY KEY,
  instrument_id   INTEGER       NOT NULL REFERENCES stocks_instruments (id) ON DELETE CASCADE,
  period_type     VARCHAR(16)   NOT NULL,
  period_end      DATE          NOT NULL,
  revenue         FLOAT,
  net_income      FLOAT,
  eps             FLOAT,
  pe_ratio        FLOAT,
  pb_ratio        FLOAT,
  debt_equity     FLOAT,
  market_cap      FLOAT,
  data            JSONB,
  fetched_at      TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_stocks_fundamentals_instrument_id ON stocks_fundamentals (instrument_id);
CREATE INDEX IF NOT EXISTS ix_stocks_fundamentals_period_end    ON stocks_fundamentals (period_end);

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS stocks_watchlists (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(255)  NOT NULL,
  tickers     JSONB         NOT NULL DEFAULT '[]',
  notes       TEXT,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE OR REPLACE TRIGGER trg_stocks_watchlists_updated_at
  BEFORE UPDATE ON stocks_watchlists
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================================
-- CRYPTO ANALYTICS  (ENABLE_CRYPTO)
-- =============================================================================

CREATE TABLE IF NOT EXISTS crypto_assets (
  id                SERIAL PRIMARY KEY,
  symbol            VARCHAR(32)   NOT NULL UNIQUE,
  name              VARCHAR(255)  NOT NULL,
  coingecko_id      VARCHAR(128),
  contract_address  VARCHAR(255),
  chain             VARCHAR(64),
  decimals          INTEGER,
  logo_url          VARCHAR(1024),
  is_active         BOOLEAN       NOT NULL DEFAULT true,
  metadata          JSONB,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS ix_crypto_assets_symbol ON crypto_assets (symbol);
CREATE OR REPLACE TRIGGER trg_crypto_assets_updated_at
  BEFORE UPDATE ON crypto_assets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS crypto_price_snapshots (
  id           SERIAL PRIMARY KEY,
  asset_id     INTEGER       NOT NULL REFERENCES crypto_assets (id) ON DELETE CASCADE,
  price_usd    FLOAT         NOT NULL,
  market_cap   FLOAT,
  volume_24h   FLOAT,
  change_24h   FLOAT,
  change_7d    FLOAT,
  source       VARCHAR(64),
  recorded_at  TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_crypto_price_snapshots_asset_id    ON crypto_price_snapshots (asset_id);
CREATE INDEX IF NOT EXISTS ix_crypto_price_snapshots_recorded_at ON crypto_price_snapshots (recorded_at);

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS crypto_on_chain_events (
  id            SERIAL PRIMARY KEY,
  asset_id      INTEGER       NOT NULL REFERENCES crypto_assets (id) ON DELETE CASCADE,
  event_type    VARCHAR(32)   NOT NULL,
  tx_hash       VARCHAR(128)  NOT NULL UNIQUE,
  block_number  BIGINT,
  from_address  VARCHAR(128),
  to_address    VARCHAR(128),
  value         FLOAT,
  gas_fee       FLOAT,
  event_data    JSONB,
  recorded_at   TIMESTAMPTZ   NOT NULL,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_crypto_on_chain_events_asset_id   ON crypto_on_chain_events (asset_id);
CREATE INDEX IF NOT EXISTS ix_crypto_on_chain_events_event_type ON crypto_on_chain_events (event_type);

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS crypto_sentiment_snapshots (
  id               SERIAL PRIMARY KEY,
  asset_id         INTEGER       NOT NULL REFERENCES crypto_assets (id) ON DELETE CASCADE,
  source           VARCHAR(64)   NOT NULL,
  sentiment_score  FLOAT,
  mention_volume   INTEGER,
  recorded_at      TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  data             JSONB,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_crypto_sentiment_snapshots_asset_id   ON crypto_sentiment_snapshots (asset_id);
CREATE INDEX IF NOT EXISTS ix_crypto_sentiment_snapshots_recorded_at ON crypto_sentiment_snapshots (recorded_at);


-- =============================================================================
-- AIRLINE PRICE TRACKER  (ENABLE_AIRLINE)
-- =============================================================================

CREATE TABLE IF NOT EXISTS airline_routes (
  id                  SERIAL PRIMARY KEY,
  origin_iata         VARCHAR(4)    NOT NULL,
  destination_iata    VARCHAR(4)    NOT NULL,
  origin_city         VARCHAR(128),
  destination_city    VARCHAR(128),
  is_active           BOOLEAN       NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_airline_routes UNIQUE (origin_iata, destination_iata)
);
CREATE OR REPLACE TRIGGER trg_airline_routes_updated_at
  BEFORE UPDATE ON airline_routes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS airline_price_snapshots (
  id                  SERIAL PRIMARY KEY,
  route_id            INTEGER       NOT NULL REFERENCES airline_routes (id) ON DELETE CASCADE,
  airline_code        VARCHAR(8)    NOT NULL,
  flight_number       VARCHAR(16),
  departure_date      DATE          NOT NULL,
  departure_time      TIME,
  arrival_time        TIME,
  duration_mins       INTEGER,
  stops               INTEGER       NOT NULL DEFAULT 0,
  price               NUMERIC(10,2) NOT NULL,
  currency            VARCHAR(8)    NOT NULL DEFAULT 'USD',
  cabin_class         VARCHAR(16)   NOT NULL DEFAULT 'economy',
  available_seats     INTEGER,
  source              VARCHAR(64),
  scraped_at          TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_airline_price_snapshots_route_id       ON airline_price_snapshots (route_id);
CREATE INDEX IF NOT EXISTS ix_airline_price_snapshots_departure_date ON airline_price_snapshots (departure_date);

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS airline_price_alerts (
  id                      SERIAL PRIMARY KEY,
  route_id                INTEGER       NOT NULL REFERENCES airline_routes (id) ON DELETE CASCADE,
  cabin_class             VARCHAR(16)   NOT NULL DEFAULT 'economy',
  target_price            NUMERIC(10,2) NOT NULL,
  currency                VARCHAR(8)    NOT NULL DEFAULT 'USD',
  departure_window_start  DATE,
  departure_window_end    DATE,
  email                   VARCHAR(255),
  is_triggered            BOOLEAN       NOT NULL DEFAULT false,
  triggered_at            TIMESTAMPTZ,
  created_at              TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE OR REPLACE TRIGGER trg_airline_price_alerts_updated_at
  BEFORE UPDATE ON airline_price_alerts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================================
-- JOB MARKET ANALYTICS  (ENABLE_JOBS)
-- =============================================================================

CREATE TABLE IF NOT EXISTS jobs_companies (
  id               SERIAL PRIMARY KEY,
  name             VARCHAR(255)  NOT NULL,
  domain           VARCHAR(255)  UNIQUE,
  industry         VARCHAR(128),
  size_range       VARCHAR(64),
  country          VARCHAR(64),
  description      TEXT,
  logo_url         VARCHAR(1024),
  glassdoor_rating FLOAT,
  metadata         JSONB,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_jobs_companies_industry ON jobs_companies (industry);
CREATE OR REPLACE TRIGGER trg_jobs_companies_updated_at
  BEFORE UPDATE ON jobs_companies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS jobs_postings (
  id                SERIAL PRIMARY KEY,
  company_id        INTEGER       REFERENCES jobs_companies (id) ON DELETE SET NULL,
  title             VARCHAR(512)  NOT NULL,
  location          VARCHAR(255),
  remote_type       VARCHAR(16),
  job_type          VARCHAR(32),
  seniority_level   VARCHAR(32),
  salary_min        NUMERIC(12,2),
  salary_max        NUMERIC(12,2),
  salary_currency   VARCHAR(8)    NOT NULL DEFAULT 'USD',
  description       TEXT,
  skills_required   JSONB,
  source_url        VARCHAR(2048) NOT NULL UNIQUE,
  source_platform   VARCHAR(64),
  posted_at         TIMESTAMPTZ,
  expires_at        TIMESTAMPTZ,
  is_active         BOOLEAN       NOT NULL DEFAULT true,
  raw_data          JSONB,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_jobs_postings_company_id      ON jobs_postings (company_id);
CREATE INDEX IF NOT EXISTS ix_jobs_postings_seniority_level ON jobs_postings (seniority_level);
CREATE INDEX IF NOT EXISTS ix_jobs_postings_remote_type     ON jobs_postings (remote_type);
CREATE INDEX IF NOT EXISTS ix_jobs_postings_posted_at       ON jobs_postings (posted_at);
CREATE OR REPLACE TRIGGER trg_jobs_postings_updated_at
  BEFORE UPDATE ON jobs_postings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS jobs_market_snapshots (
  id             SERIAL PRIMARY KEY,
  snapshot_date  DATE          NOT NULL,
  role_category  VARCHAR(128),
  location       VARCHAR(128),
  avg_salary     NUMERIC(12,2),
  median_salary  NUMERIC(12,2),
  total_postings INTEGER,
  demand_score   FLOAT,
  data           JSONB,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_jobs_market_snapshots_snapshot_date  ON jobs_market_snapshots (snapshot_date);
CREATE INDEX IF NOT EXISTS ix_jobs_market_snapshots_role_category  ON jobs_market_snapshots (role_category);


-- =============================================================================
-- ENERGY MARKET PIPELINE  (ENABLE_ENERGY)
-- =============================================================================

CREATE TABLE IF NOT EXISTS energy_sources (
  id           SERIAL PRIMARY KEY,
  name         VARCHAR(255)  NOT NULL,
  region       VARCHAR(128),
  country      VARCHAR(64),
  source_type  VARCHAR(32),
  is_active    BOOLEAN       NOT NULL DEFAULT true,
  metadata     JSONB,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_energy_sources_country     ON energy_sources (country);
CREATE INDEX IF NOT EXISTS ix_energy_sources_source_type ON energy_sources (source_type);
CREATE OR REPLACE TRIGGER trg_energy_sources_updated_at
  BEFORE UPDATE ON energy_sources
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS energy_price_snapshots (
  id             SERIAL PRIMARY KEY,
  source_id      INTEGER       NOT NULL REFERENCES energy_sources (id) ON DELETE CASCADE,
  energy_type    VARCHAR(64)   NOT NULL,
  price_per_kwh  FLOAT         NOT NULL,
  currency       VARCHAR(8)    NOT NULL DEFAULT 'USD',
  recorded_at    TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_energy_price_snapshots_source_id   ON energy_price_snapshots (source_id);
CREATE INDEX IF NOT EXISTS ix_energy_price_snapshots_recorded_at ON energy_price_snapshots (recorded_at);

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS energy_generation_records (
  id               SERIAL PRIMARY KEY,
  source_id        INTEGER       NOT NULL REFERENCES energy_sources (id) ON DELETE CASCADE,
  period_start     TIMESTAMPTZ   NOT NULL,
  period_end       TIMESTAMPTZ   NOT NULL,
  generation_kwh   FLOAT,
  consumption_kwh  FLOAT,
  import_kwh       FLOAT,
  export_kwh       FLOAT,
  renewable_pct    FLOAT,
  data             JSONB,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_energy_generation_records_source_id    ON energy_generation_records (source_id);
CREATE INDEX IF NOT EXISTS ix_energy_generation_records_period_start ON energy_generation_records (period_start);

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS energy_grid_events (
  id            SERIAL PRIMARY KEY,
  source_id     INTEGER       NOT NULL REFERENCES energy_sources (id) ON DELETE CASCADE,
  event_type    VARCHAR(64)   NOT NULL,
  severity      VARCHAR(16),
  description   TEXT,
  affected_area VARCHAR(255),
  started_at    TIMESTAMPTZ,
  ended_at      TIMESTAMPTZ,
  metadata      JSONB,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_energy_grid_events_source_id  ON energy_grid_events (source_id);
CREATE INDEX IF NOT EXISTS ix_energy_grid_events_event_type ON energy_grid_events (event_type);


-- =============================================================================
-- SOCIAL MEDIA TRENDS  (ENABLE_SOCIAL)
-- =============================================================================

CREATE TABLE IF NOT EXISTS social_topics (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(255)  NOT NULL UNIQUE,
  keywords    JSONB         NOT NULL DEFAULT '[]',
  platforms   JSONB         NOT NULL DEFAULT '[]',
  is_active   BOOLEAN       NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE OR REPLACE TRIGGER trg_social_topics_updated_at
  BEFORE UPDATE ON social_topics
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS social_posts (
  id               SERIAL PRIMARY KEY,
  topic_id         INTEGER       REFERENCES social_topics (id) ON DELETE SET NULL,
  platform         VARCHAR(32)   NOT NULL,
  post_id          VARCHAR(128)  NOT NULL,
  author_handle    VARCHAR(128),
  author_followers INTEGER,
  content          TEXT,
  language         VARCHAR(8),
  likes            INTEGER       NOT NULL DEFAULT 0,
  shares           INTEGER       NOT NULL DEFAULT 0,
  comments         INTEGER       NOT NULL DEFAULT 0,
  reach            INTEGER,
  sentiment_score  FLOAT,
  sentiment_label  VARCHAR(16),
  tags             JSONB,
  media_urls       JSONB,
  posted_at        TIMESTAMPTZ,
  source_url       VARCHAR(2048),
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_social_posts_platform_post_id UNIQUE (platform, post_id)
);
CREATE INDEX IF NOT EXISTS ix_social_posts_topic_id  ON social_posts (topic_id);
CREATE INDEX IF NOT EXISTS ix_social_posts_platform  ON social_posts (platform);
CREATE INDEX IF NOT EXISTS ix_social_posts_posted_at ON social_posts (posted_at);

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS social_trend_snapshots (
  id              SERIAL PRIMARY KEY,
  topic_id        INTEGER       NOT NULL REFERENCES social_topics (id) ON DELETE CASCADE,
  platform        VARCHAR(32),
  snapshot_at     TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  mention_count   INTEGER       NOT NULL DEFAULT 0,
  engagement_score FLOAT,
  sentiment_avg   FLOAT,
  top_influencers JSONB,
  data            JSONB,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_social_trend_snapshots_topic_id    ON social_trend_snapshots (topic_id);
CREATE INDEX IF NOT EXISTS ix_social_trend_snapshots_snapshot_at ON social_trend_snapshots (snapshot_at);

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS social_influencers (
  id               SERIAL PRIMARY KEY,
  platform         VARCHAR(32)   NOT NULL,
  handle           VARCHAR(128)  NOT NULL,
  display_name     VARCHAR(255),
  followers        INTEGER,
  engagement_rate  FLOAT,
  topics           JSONB,
  is_verified      BOOLEAN       NOT NULL DEFAULT false,
  last_updated_at  TIMESTAMPTZ,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_social_influencers UNIQUE (platform, handle)
);
CREATE INDEX IF NOT EXISTS ix_social_influencers_platform ON social_influencers (platform);
CREATE OR REPLACE TRIGGER trg_social_influencers_updated_at
  BEFORE UPDATE ON social_influencers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================================
-- DATA ANNOTATION PLATFORM  (ENABLE_ANNOTATION)
-- =============================================================================

CREATE TABLE IF NOT EXISTS annotation_datasets (
  id               SERIAL PRIMARY KEY,
  name             VARCHAR(255)  NOT NULL,
  description      TEXT,
  type             VARCHAR(32)   NOT NULL DEFAULT 'text',
  status           VARCHAR(32)   NOT NULL DEFAULT 'draft',
  total_items      INTEGER       NOT NULL DEFAULT 0,
  annotated_items  INTEGER       NOT NULL DEFAULT 0,
  config           JSONB,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE OR REPLACE TRIGGER trg_annotation_datasets_updated_at
  BEFORE UPDATE ON annotation_datasets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS annotation_labels (
  id          SERIAL PRIMARY KEY,
  dataset_id  INTEGER       NOT NULL REFERENCES annotation_datasets (id) ON DELETE CASCADE,
  name        VARCHAR(128)  NOT NULL,
  color       VARCHAR(16),
  description TEXT,
  parent_id   INTEGER       REFERENCES annotation_labels (id) ON DELETE SET NULL,
  metadata    JSONB,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_annotation_labels UNIQUE (dataset_id, name)
);
CREATE INDEX IF NOT EXISTS ix_annotation_labels_dataset_id ON annotation_labels (dataset_id);

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS annotation_items (
  id           SERIAL PRIMARY KEY,
  dataset_id   INTEGER       NOT NULL REFERENCES annotation_datasets (id) ON DELETE CASCADE,
  external_id  VARCHAR(255),
  content_url  VARCHAR(2048),
  raw_content  TEXT,
  metadata     JSONB,
  status       VARCHAR(32)   NOT NULL DEFAULT 'pending',
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_annotation_items_dataset_id ON annotation_items (dataset_id);
CREATE INDEX IF NOT EXISTS ix_annotation_items_status     ON annotation_items (status);
CREATE OR REPLACE TRIGGER trg_annotation_items_updated_at
  BEFORE UPDATE ON annotation_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS annotation_tasks (
  id            SERIAL PRIMARY KEY,
  item_id       INTEGER       NOT NULL REFERENCES annotation_items (id) ON DELETE CASCADE,
  annotator_id  VARCHAR(128),
  status        VARCHAR(32)   NOT NULL DEFAULT 'pending',
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_annotation_tasks_item_id      ON annotation_tasks (item_id);
CREATE INDEX IF NOT EXISTS ix_annotation_tasks_annotator_id ON annotation_tasks (annotator_id);
CREATE OR REPLACE TRIGGER trg_annotation_tasks_updated_at
  BEFORE UPDATE ON annotation_tasks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS annotation_results (
  id              SERIAL PRIMARY KEY,
  task_id         INTEGER       NOT NULL REFERENCES annotation_tasks (id) ON DELETE CASCADE,
  item_id         INTEGER       NOT NULL REFERENCES annotation_items (id) ON DELETE CASCADE,
  labels          JSONB,
  bounding_boxes  JSONB,
  spans           JSONB,
  notes           TEXT,
  confidence      FLOAT,
  review_status   VARCHAR(32)   NOT NULL DEFAULT 'pending',
  reviewed_by     VARCHAR(128),
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_annotation_results_task_id      ON annotation_results (task_id);
CREATE INDEX IF NOT EXISTS ix_annotation_results_item_id      ON annotation_results (item_id);
CREATE INDEX IF NOT EXISTS ix_annotation_results_review_status ON annotation_results (review_status);
CREATE OR REPLACE TRIGGER trg_annotation_results_updated_at
  BEFORE UPDATE ON annotation_results
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
