export const schema = `
CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS organizations (id TEXT PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS actors (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id),
  display_name TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('user','legacy','system'))
);
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL, normalized_name TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(organization_id, normalized_name), UNIQUE(organization_id,id)
);
CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id),
  category_id TEXT, name TEXT NOT NULL, normalized_name TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  FOREIGN KEY(organization_id,category_id) REFERENCES categories(organization_id,id),
  UNIQUE(organization_id,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS topics_name ON topics(organization_id,coalesce(category_id,''),normalized_name);
CREATE TABLE IF NOT EXISTS prompts (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id),
  text TEXT NOT NULL, normalized_text TEXT NOT NULL, topic_id TEXT, uncategorized_category_id TEXT,
  search_intent TEXT, created_by TEXT REFERENCES actors(id), updated_by TEXT REFERENCES actors(id),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  CHECK(topic_id IS NULL OR uncategorized_category_id IS NULL),
  FOREIGN KEY(organization_id,topic_id) REFERENCES topics(organization_id,id),
  FOREIGN KEY(organization_id,uncategorized_category_id) REFERENCES categories(organization_id,id),
  UNIQUE(organization_id,normalized_text), UNIQUE(organization_id,id)
);
CREATE TABLE IF NOT EXISTS prompt_sources (
  id TEXT PRIMARY KEY, prompt_id TEXT NOT NULL REFERENCES prompts(id),
  source_type TEXT NOT NULL, source_key TEXT NOT NULL, generation_purpose TEXT,
  generation_reasoning TEXT, metadata_json JSONB NOT NULL,
  created_at TEXT NOT NULL, UNIQUE(prompt_id,source_type,source_key)
);
CREATE TABLE IF NOT EXISTS prompt_tracking (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, prompt_id TEXT NOT NULL,
  brand_id TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('active','paused','archived')),
  origin TEXT NOT NULL CHECK(origin IN ('manual','ai_generated','csv_import')),
  added_at TEXT NOT NULL, added_by TEXT REFERENCES actors(id),
  paused_at TEXT, archived_at TEXT, updated_at TEXT NOT NULL,
  FOREIGN KEY(organization_id,prompt_id) REFERENCES prompts(organization_id,id),
  UNIQUE(organization_id,prompt_id,brand_id)
);
CREATE TABLE IF NOT EXISTS tracking_events (
  id TEXT PRIMARY KEY, tracking_id TEXT NOT NULL REFERENCES prompt_tracking(id),
  status TEXT NOT NULL CHECK(status IN ('active','paused','archived')),
  actor_id TEXT REFERENCES actors(id), occurred_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS legacy_library_ids (
  organization_id TEXT NOT NULL, legacy_id TEXT NOT NULL,
  tracking_id TEXT NOT NULL REFERENCES prompt_tracking(id), PRIMARY KEY(organization_id,legacy_id)
);
CREATE TABLE IF NOT EXISTS bridge_entries (
  organization_id TEXT NOT NULL REFERENCES organizations(id), scope TEXT NOT NULL, entry_key TEXT NOT NULL,
  data_json JSONB NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY(organization_id,scope,entry_key)
);
CREATE TABLE IF NOT EXISTS collection_jobs (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id),
  trigger_type TEXT NOT NULL CHECK(trigger_type IN ('manual','scheduled','legacy_import')),
  requested_by TEXT REFERENCES actors(id), status TEXT NOT NULL,
  started_at TEXT NOT NULL, finished_at TEXT, data_json JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS prompt_runs (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, prompt_id TEXT NOT NULL,
  job_id TEXT REFERENCES collection_jobs(id), retry_of_run_id TEXT REFERENCES prompt_runs(id),
  prompt_text_snapshot TEXT NOT NULL, platform TEXT NOT NULL, model_id TEXT NOT NULL,
  market_id TEXT NOT NULL, locale TEXT, run_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('success','failed','pending','paused')),
  raw_response TEXT NOT NULL, error_message TEXT,
  original_json JSONB NOT NULL, source_dir TEXT NOT NULL, source_filename TEXT NOT NULL,
  FOREIGN KEY(organization_id,prompt_id) REFERENCES prompts(organization_id,id),
  UNIQUE(organization_id,id), UNIQUE(source_dir,source_filename)
);
CREATE TABLE IF NOT EXISTS run_analyses (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES prompt_runs(id),
  version TEXT NOT NULL, input_hash TEXT NOT NULL, method TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('success','failed')), analyzed_at TEXT NOT NULL,
  error_message TEXT, result_json JSONB,
  UNIQUE(run_id,version,input_hash)
);
CREATE TABLE IF NOT EXISTS brand_observations (
  analysis_id TEXT NOT NULL REFERENCES run_analyses(id), brand_id TEXT NOT NULL,
  brand_snapshot_json JSONB NOT NULL,
  is_present BOOLEAN NOT NULL, first_mention_position INTEGER,
  recommendation_rank INTEGER,
  sentiment TEXT CHECK(sentiment IN ('positive','neutral','negative','mixed')),
  sentiment_score REAL CHECK(sentiment_score BETWEEN -1 AND 1), evidence TEXT,
  CHECK(is_present=true OR (sentiment IS NULL AND sentiment_score IS NULL AND first_mention_position IS NULL)),
  PRIMARY KEY(analysis_id,brand_id)
);
CREATE TABLE IF NOT EXISTS citations (
  id TEXT PRIMARY KEY, analysis_id TEXT NOT NULL REFERENCES run_analyses(id),
  brand_id TEXT, url TEXT NOT NULL, domain TEXT NOT NULL, title TEXT NOT NULL,
  position INTEGER NOT NULL, is_own_domain BOOLEAN NOT NULL,
  UNIQUE(analysis_id,url)
);
CREATE TABLE IF NOT EXISTS brands (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL, url TEXT NOT NULL, sitemap_url TEXT NOT NULL, description TEXT NOT NULL,
  industry TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('active','pending')),
  markets_json JSONB NOT NULL,
  aliases_json JSONB NOT NULL,
  other_brands_json JSONB NOT NULL,
  urls_json JSONB NOT NULL,
  social_accounts_json JSONB NOT NULL,
  earned_content_sources_json JSONB NOT NULL,
  cdn_connected BOOLEAN NOT NULL,
  gsc_connected BOOLEAN NOT NULL,
  analytics_connected BOOLEAN NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS detected_brand_decisions (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id),
  brand_id TEXT NOT NULL REFERENCES brands(id),
  name TEXT NOT NULL, normalized_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('approved','excluded')),
  evidence_domain TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(organization_id,brand_id,normalized_name)
);
CREATE TABLE IF NOT EXISTS brand_youtube_channels (
  brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE, channel_id TEXT NOT NULL,
  handle TEXT, title TEXT NOT NULL, thumbnail_url TEXT, added_at TEXT NOT NULL,
  PRIMARY KEY(brand_id,channel_id)
);
CREATE TABLE IF NOT EXISTS brand_aio_settings (
  brand_id TEXT PRIMARY KEY REFERENCES brands(id) ON DELETE CASCADE,
  country TEXT NOT NULL, language TEXT NOT NULL, devices_json JSONB NOT NULL,
  optimization_date TEXT, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS aio_keywords (
  id TEXT PRIMARY KEY, brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL, normalized_keyword TEXT NOT NULL,
  keyword_group TEXT NOT NULL CHECK(keyword_group IN ('brand','category','comparison','howto')),
  status TEXT NOT NULL CHECK(status IN ('active','archived')), created_at TEXT NOT NULL,
  UNIQUE(brand_id,normalized_keyword)
);
CREATE TABLE IF NOT EXISTS aio_observations (
  id TEXT PRIMARY KEY, brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  keyword_id TEXT NOT NULL REFERENCES aio_keywords(id) ON DELETE CASCADE,
  device TEXT NOT NULL CHECK(device IN ('mobile','desktop')), country TEXT NOT NULL, language TEXT NOT NULL,
  collected_at TEXT NOT NULL, collected_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('aio_present','aio_absent','failed')),
  aio_text TEXT, paragraphs_json JSONB NOT NULL, screenshot_path TEXT, html_path TEXT, error_message TEXT,
  has_youtube BOOLEAN NOT NULL, has_own_video BOOLEAN NOT NULL, own_best_position INTEGER, source_count INTEGER NOT NULL,
  UNIQUE(keyword_id,device,collected_date)
);
CREATE TABLE IF NOT EXISTS aio_citations (
  observation_id TEXT NOT NULL REFERENCES aio_observations(id) ON DELETE CASCADE, position INTEGER NOT NULL,
  url TEXT NOT NULL, domain TEXT NOT NULL, title TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK(source_type IN ('own_video','other_youtube','own_web','competitor','other')),
  video_id TEXT, channel_id TEXT, start_seconds INTEGER,
  PRIMARY KEY(observation_id,position)
);
CREATE TABLE IF NOT EXISTS youtube_videos (
  video_id TEXT PRIMARY KEY, channel_id TEXT NOT NULL, title TEXT NOT NULL, thumbnail_url TEXT NOT NULL, fetched_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS brand_videos (
  brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE, video_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('active','archived')), added_at TEXT NOT NULL,
  PRIMARY KEY(brand_id,video_id)
);
CREATE TABLE IF NOT EXISTS aio_video_work_logs (
  id TEXT PRIMARY KEY, brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  video_id TEXT NOT NULL, work_date TEXT NOT NULL, work_type TEXT NOT NULL, note TEXT, created_at TEXT NOT NULL
);
-- 사이트맵 크롤 결과(콘텐츠 가시성·FAQ·목차·복잡도 등) — 예전엔 .tmp/sitemap-crawl 파일이라 서버리스에서 못 읽었다.
CREATE TABLE IF NOT EXISTS sitemap_crawls (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id),
  domain TEXT NOT NULL, sitemap_url TEXT NOT NULL, crawled_at TEXT NOT NULL,
  source_job_id TEXT, data_json JSONB NOT NULL, created_at TEXT NOT NULL,
  UNIQUE(organization_id,domain,crawled_at)
);
CREATE INDEX IF NOT EXISTS sitemap_crawls_lookup ON sitemap_crawls(organization_id,domain,crawled_at);
CREATE TABLE IF NOT EXISTS imported_files (path TEXT PRIMARY KEY, signature TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS data_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS prompts_topic ON prompts(organization_id,topic_id);
CREATE INDEX IF NOT EXISTS tracking_status ON prompt_tracking(organization_id,brand_id,status);
CREATE INDEX IF NOT EXISTS runs_prompt_date ON prompt_runs(organization_id,prompt_id,run_at);
CREATE INDEX IF NOT EXISTS runs_dimensions ON prompt_runs(organization_id,model_id,market_id,run_at);
CREATE INDEX IF NOT EXISTS analyses_run ON run_analyses(run_id,analyzed_at);
CREATE INDEX IF NOT EXISTS observations_brand ON brand_observations(brand_id,analysis_id);
CREATE INDEX IF NOT EXISTS citations_domain ON citations(domain,analysis_id);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS slug TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS organizations_slug ON organizations(slug);
CREATE INDEX IF NOT EXISTS aio_observations_brand_date ON aio_observations(brand_id,collected_date);
ALTER TABLE youtube_videos ADD COLUMN IF NOT EXISTS channel_title TEXT;
-- 프롬프트(질의)는 prompts 한 곳에서 등록하고, 어느 표면에서 수집할지는 추적(prompt_tracking)마다 정한다.
CREATE TABLE IF NOT EXISTS prompt_tracking_surfaces (
  tracking_id TEXT NOT NULL REFERENCES prompt_tracking(id) ON DELETE CASCADE,
  surface TEXT NOT NULL CHECK(surface IN ('google-aio','google-ai-mode','naver-ai')),
  updated_at TEXT NOT NULL,
  PRIMARY KEY(tracking_id,surface)
);
-- AIO 키워드를 프롬프트로 통합하는 동안 두 저장소를 잇는 열 — 이관이 끝나면 aio_keywords를 없앤다(docs/prompt-surfaces-plan.md).
ALTER TABLE aio_keywords ADD COLUMN IF NOT EXISTS prompt_id TEXT REFERENCES prompts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS aio_keywords_prompt ON aio_keywords(prompt_id);
CREATE INDEX IF NOT EXISTS aio_citations_video ON aio_citations(video_id);
CREATE INDEX IF NOT EXISTS aio_work_logs_video ON aio_video_work_logs(brand_id,video_id,work_date);
CREATE INDEX IF NOT EXISTS detected_brand_decisions_status ON detected_brand_decisions(organization_id,brand_id,status);
`;
