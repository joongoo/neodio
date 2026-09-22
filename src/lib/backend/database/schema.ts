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
  generation_reasoning TEXT, metadata_json TEXT NOT NULL CHECK(json_valid(metadata_json)),
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
  data_json TEXT NOT NULL CHECK(json_valid(data_json)), updated_at TEXT NOT NULL,
  PRIMARY KEY(organization_id,scope,entry_key)
);
CREATE TABLE IF NOT EXISTS collection_jobs (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id),
  trigger_type TEXT NOT NULL CHECK(trigger_type IN ('manual','scheduled','legacy_import')),
  requested_by TEXT REFERENCES actors(id), status TEXT NOT NULL,
  started_at TEXT NOT NULL, finished_at TEXT, data_json TEXT NOT NULL CHECK(json_valid(data_json))
);
CREATE TABLE IF NOT EXISTS prompt_runs (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, prompt_id TEXT NOT NULL,
  job_id TEXT REFERENCES collection_jobs(id), retry_of_run_id TEXT REFERENCES prompt_runs(id),
  prompt_text_snapshot TEXT NOT NULL, platform TEXT NOT NULL, model_id TEXT NOT NULL,
  market_id TEXT NOT NULL, locale TEXT, run_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('success','failed','pending','paused')),
  raw_response TEXT NOT NULL, error_message TEXT,
  original_json TEXT NOT NULL CHECK(json_valid(original_json)), source_dir TEXT NOT NULL, source_filename TEXT NOT NULL,
  FOREIGN KEY(organization_id,prompt_id) REFERENCES prompts(organization_id,id),
  UNIQUE(organization_id,id), UNIQUE(source_dir,source_filename)
);
CREATE TABLE IF NOT EXISTS run_analyses (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES prompt_runs(id),
  version TEXT NOT NULL, input_hash TEXT NOT NULL, method TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('success','failed')), analyzed_at TEXT NOT NULL,
  error_message TEXT, result_json TEXT CHECK(result_json IS NULL OR json_valid(result_json)),
  UNIQUE(run_id,version,input_hash)
);
CREATE TABLE IF NOT EXISTS brand_observations (
  analysis_id TEXT NOT NULL REFERENCES run_analyses(id), brand_id TEXT NOT NULL,
  brand_snapshot_json TEXT NOT NULL CHECK(json_valid(brand_snapshot_json)),
  is_present INTEGER NOT NULL CHECK(is_present IN (0,1)), first_mention_position INTEGER,
  recommendation_rank INTEGER,
  sentiment TEXT CHECK(sentiment IN ('positive','neutral','negative','mixed')),
  sentiment_score REAL CHECK(sentiment_score BETWEEN -1 AND 1), evidence TEXT,
  CHECK(is_present=1 OR (sentiment IS NULL AND sentiment_score IS NULL AND first_mention_position IS NULL)),
  PRIMARY KEY(analysis_id,brand_id)
);
CREATE TABLE IF NOT EXISTS citations (
  id TEXT PRIMARY KEY, analysis_id TEXT NOT NULL REFERENCES run_analyses(id),
  brand_id TEXT, url TEXT NOT NULL, domain TEXT NOT NULL, title TEXT NOT NULL,
  position INTEGER NOT NULL, is_own_domain INTEGER NOT NULL CHECK(is_own_domain IN (0,1)),
  UNIQUE(analysis_id,url)
);
CREATE TABLE IF NOT EXISTS brands (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL, url TEXT NOT NULL, sitemap_url TEXT NOT NULL, description TEXT NOT NULL,
  industry TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('active','pending')),
  markets_json TEXT NOT NULL CHECK(json_valid(markets_json)),
  aliases_json TEXT NOT NULL CHECK(json_valid(aliases_json)),
  other_brands_json TEXT NOT NULL CHECK(json_valid(other_brands_json)),
  urls_json TEXT NOT NULL CHECK(json_valid(urls_json)),
  social_accounts_json TEXT NOT NULL CHECK(json_valid(social_accounts_json)),
  earned_content_sources_json TEXT NOT NULL CHECK(json_valid(earned_content_sources_json)),
  cdn_connected INTEGER NOT NULL CHECK(cdn_connected IN (0,1)),
  gsc_connected INTEGER NOT NULL CHECK(gsc_connected IN (0,1)),
  analytics_connected INTEGER NOT NULL CHECK(analytics_connected IN (0,1)),
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
CREATE TABLE IF NOT EXISTS imported_files (path TEXT PRIMARY KEY, signature TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS data_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS prompts_topic ON prompts(organization_id,topic_id);
CREATE INDEX IF NOT EXISTS tracking_status ON prompt_tracking(organization_id,brand_id,status);
CREATE INDEX IF NOT EXISTS runs_prompt_date ON prompt_runs(organization_id,prompt_id,run_at);
CREATE INDEX IF NOT EXISTS runs_dimensions ON prompt_runs(organization_id,model_id,market_id,run_at);
CREATE INDEX IF NOT EXISTS analyses_run ON run_analyses(run_id,analyzed_at);
CREATE INDEX IF NOT EXISTS observations_brand ON brand_observations(brand_id,analysis_id);
CREATE INDEX IF NOT EXISTS citations_domain ON citations(domain,analysis_id);
CREATE INDEX IF NOT EXISTS detected_brand_decisions_status ON detected_brand_decisions(organization_id,brand_id,status);
`;
