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
-- YouTube 관리: 채널 영상 동기화로 가져온 게시일·설명, 그리고 "체크"(예상 프롬프트를 만들고 인용을 추적할 영상) 표시.
-- 직접 등록한 영상은 이미 추적 대상이므로 checked 기본값은 true, 동기화가 새로 넣는 영상만 false로 넣는다.
ALTER TABLE youtube_videos ADD COLUMN IF NOT EXISTS published_at TEXT;
ALTER TABLE youtube_videos ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE brand_videos ADD COLUMN IF NOT EXISTS checked BOOLEAN NOT NULL DEFAULT true;
-- 프롬프트(질의)는 prompts 한 곳에서 등록하고, 어느 플랫폼에서 수집할지는 추적(prompt_tracking)마다 정한다.
CREATE TABLE IF NOT EXISTS prompt_tracking_surfaces (
  tracking_id TEXT NOT NULL REFERENCES prompt_tracking(id) ON DELETE CASCADE,
  surface TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(tracking_id,surface)
);
-- 플랫폼 종류는 코드(src/lib/promptSurfaces.ts)가 검증한다 — 플랫폼이 늘 때마다 제약을 고치지 않도록 CHECK를 없앴다.
ALTER TABLE prompt_tracking_surfaces DROP CONSTRAINT IF EXISTS prompt_tracking_surfaces_surface_check;
-- AIO 키워드를 프롬프트로 통합하는 동안 두 저장소를 잇는 열 — 이관이 끝나면 aio_keywords를 없앤다(docs/prompt-surfaces-plan.md).
ALTER TABLE aio_keywords ADD COLUMN IF NOT EXISTS prompt_id TEXT REFERENCES prompts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS aio_keywords_prompt ON aio_keywords(prompt_id);
CREATE INDEX IF NOT EXISTS aio_citations_video ON aio_citations(video_id);
CREATE INDEX IF NOT EXISTS aio_work_logs_video ON aio_video_work_logs(brand_id,video_id,work_date);
CREATE INDEX IF NOT EXISTS detected_brand_decisions_status ON detected_brand_decisions(organization_id,brand_id,status);
-- 설정 변경 이력(프롬프트 세트·토픽 묶음·브랜드 설정) — 쓰기 직전·직후 값을 그대로 남겨 "언제 무엇이 어떻게 바뀌었는지"를 볼 수 있게 한다.
-- 수집된 답변(prompt_runs)은 바뀌지 않는 원본이라 여기 담지 않는다. 이력은 소급해서 만들 수 없어 먼저 쌓기 시작한다.
CREATE TABLE IF NOT EXISTS change_log (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id), brand_id TEXT,
  entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, op TEXT NOT NULL CHECK(op IN ('create','update','delete')),
  summary TEXT NOT NULL, before_json JSONB, after_json JSONB,
  actor_id TEXT REFERENCES actors(id), at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS change_log_org_at ON change_log(organization_id,at DESC);
-- 유저 수정 이력: 로그인한 사용자가 한 변경은 actor_user_id로 남기고, 어느 조직에도 속하지 않은 유저의 변경(할당 대기자 수정 등)은 조직 없이 기록한다.
ALTER TABLE change_log ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE change_log ADD COLUMN IF NOT EXISTS actor_user_id TEXT;
CREATE INDEX IF NOT EXISTS change_log_entity ON change_log(entity_type,entity_id,at DESC);
-- 클라이언트 보고용 리포트 — 생성 시점의 지표를 snapshot_json에 고정해 나중에 데이터·설정이 바뀌어도 이미 보낸 보고서 숫자가 달라지지 않게 한다.
-- 운영 DB는 다른 앱과 공유돼 reports 같은 이름이 겹칠 수 있어 neodio_ 접두사를 쓴다.
CREATE TABLE IF NOT EXISTS neodio_reports (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id), brand_id TEXT NOT NULL,
  title TEXT NOT NULL, range TEXT NOT NULL, filters_json JSONB NOT NULL,
  snapshot_json JSONB NOT NULL, sections_json JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','final')),
  created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, finalized_at TEXT
);
CREATE INDEX IF NOT EXISTS neodio_reports_brand ON neodio_reports(organization_id,brand_id,created_at DESC);
-- 이름 붙인 설정 버전 — 저장 시점의 설정 전체를 함께 보관해 나중에 비교·복원할 수 있다.
CREATE TABLE IF NOT EXISTS config_versions (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id), brand_id TEXT,
  version INTEGER NOT NULL, label TEXT NOT NULL, note TEXT,
  created_by TEXT REFERENCES actors(id), created_at TEXT NOT NULL, content_json JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS config_versions_org ON config_versions(organization_id,brand_id,version DESC);
-- 회원·권한(docs/auth-and-roles.md) — 운영 DB는 다른 앱과 공유돼 users·sessions 같은 이름이 이미 쓰이고 있어, 새 테이블은 모두 neodio_ 접두사를 쓴다(이름 충돌로 스키마 초기화가 통째로 실패한 적이 있다).
-- 이메일 없이 아이디+비밀번호로 가입하고, 오너·직원이 역할·브랜드를 할당해야 접근한다.
CREATE TABLE IF NOT EXISTS neodio_users (
  id TEXT PRIMARY KEY, login_id TEXT NOT NULL, name TEXT NOT NULL, password_hash TEXT NOT NULL,
  must_change_password BOOLEAN NOT NULL DEFAULT false,
  platform_role TEXT NOT NULL DEFAULT 'none' CHECK(platform_role IN ('none','staff')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),
  created_at TEXT NOT NULL, last_login_at TEXT, deleted_at TEXT
);
-- 처음엔 로그인 키 컬럼이 email이었다 — 이미 만들어진 테이블은 login_id로 이름을 바꾸고 옛 인덱스를 지운다(여러 번 실행돼도 안전).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='neodio_users' AND column_name='email')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='neodio_users' AND column_name='login_id') THEN
    ALTER TABLE neodio_users RENAME COLUMN email TO login_id;
  END IF;
END $$;
DROP INDEX IF EXISTS neodio_users_email;
CREATE UNIQUE INDEX IF NOT EXISTS neodio_users_login_id ON neodio_users(lower(login_id));
-- 세션 토큰은 해시로만 저장한다(DB가 새도 쿠키 값을 알 수 없다).
CREATE TABLE IF NOT EXISTS neodio_sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES neodio_users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL, expires_at TEXT NOT NULL, user_agent TEXT
);
CREATE INDEX IF NOT EXISTS neodio_sessions_user ON neodio_sessions(user_id);
-- role은 admin|viewer. 오너는 organizations.owner_user_id로 지정하고 반드시 admin이어야 한다(코드에서 검증).
CREATE TABLE IF NOT EXISTS neodio_memberships (
  user_id TEXT NOT NULL REFERENCES neodio_users(id) ON DELETE CASCADE, organization_id TEXT NOT NULL REFERENCES organizations(id),
  role TEXT NOT NULL CHECK(role IN ('admin','viewer')), created_at TEXT NOT NULL, created_by TEXT,
  PRIMARY KEY(user_id,organization_id)
);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS owner_user_id TEXT REFERENCES neodio_users(id);
-- admin·viewer가 접근할 수 있는 브랜드(오너·직원은 이 표와 무관하게 전체). 지정은 오너만 한다.
CREATE TABLE IF NOT EXISTS neodio_membership_brands (
  user_id TEXT NOT NULL, organization_id TEXT NOT NULL, brand_id TEXT NOT NULL,
  granted_by TEXT, granted_at TEXT NOT NULL,
  PRIMARY KEY(user_id,organization_id,brand_id),
  FOREIGN KEY(user_id,organization_id) REFERENCES neodio_memberships(user_id,organization_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS neodio_audit_log (
  id TEXT PRIMARY KEY, organization_id TEXT, actor_user_id TEXT, action TEXT NOT NULL,
  target_type TEXT, target_id TEXT, detail_json JSONB, at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS neodio_audit_log_org_at ON neodio_audit_log(organization_id,at DESC);
ALTER TABLE actors ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES neodio_users(id);
-- 로그인·가입 시도 제한 — 키(이메일·IP·사용자)별 실패 횟수와 잠금 시각. 서버리스에서는 메모리가 공유되지 않아 DB에 둔다.
CREATE TABLE IF NOT EXISTS neodio_auth_throttle (
  key TEXT PRIMARY KEY, fail_count INTEGER NOT NULL, window_start BIGINT NOT NULL, locked_until BIGINT NOT NULL, updated_at TEXT NOT NULL
);
`;
