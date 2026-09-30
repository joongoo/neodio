import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { Pool } from "pg";
import { NextRequest } from "next/server";
import type { AioCitation } from "../../db/types";

// YouTube AIO 트래커 저장소 + API 라우트 — 실제 Postgres, 이 파일 전용
// 스키마(api.test.ts와 같은 격리 방식). YouTube 조회가 필요한 채널 추가
// 성공 경로는 네트워크를 타므로 여기선 저장 함수로 직접 넣는다.
const baseUrl = process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL;
if (!baseUrl) throw new Error("POSTGRES_URL is required to run AIO store tests — see docs/database.md");
const schema = `test_aio_${randomUUID().replaceAll("-", "_")}`;
const scopedUrl = `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}options=-c%20search_path%3D${schema}`;
process.env.POSTGRES_URL = scopedUrl;
process.env.POSTGRES_URL_NON_POOLING = scopedUrl;

let store: typeof import("./store");
let config: typeof import("../brandAioConfig");
let metrics: typeof import("./metrics");
let keywordsRoute: typeof import("../../../app/api/youtube-aio/keywords/route");
let manageSyncRoute: typeof import("../../../app/api/youtube-manage/sync/route");
let manageVideosRoute: typeof import("../../../app/api/youtube-manage/videos/route");
let managePromptsRoute: typeof import("../../../app/api/youtube-manage/prompts/route");
let manage: typeof import("./videoManage");
let bulkSurfacesRoute: typeof import("../../../app/api/tracked-topics/surfaces/route");
let workLogsRoute: typeof import("../../../app/api/youtube-aio/work-logs/route");
let snapshotRoute: typeof import("../../../app/api/youtube-aio/snapshot/route");
let settingsRoute: typeof import("../../../app/api/brands-management/brands/[brandId]/aio-settings/route");
let channelsRoute: typeof import("../../../app/api/brands-management/brands/[brandId]/youtube-channels/route");
let getPromptStore: typeof import("../database").getPromptStore;
let brandId: string;

before(async () => {
  const setup = new Pool({ connectionString: baseUrl });
  await setup.query(`CREATE SCHEMA "${schema}"`);
  await setup.end();
  store = await import("./store");
  config = await import("../brandAioConfig");
  metrics = await import("./metrics");
  keywordsRoute = await import("../../../app/api/youtube-aio/keywords/route");
  manageSyncRoute = await import("../../../app/api/youtube-manage/sync/route");
  manageVideosRoute = await import("../../../app/api/youtube-manage/videos/route");
  managePromptsRoute = await import("../../../app/api/youtube-manage/prompts/route");
  manage = await import("./videoManage");
  bulkSurfacesRoute = await import("../../../app/api/tracked-topics/surfaces/route");
  workLogsRoute = await import("../../../app/api/youtube-aio/work-logs/route");
  snapshotRoute = await import("../../../app/api/youtube-aio/snapshot/route");
  settingsRoute = await import("../../../app/api/brands-management/brands/[brandId]/aio-settings/route");
  channelsRoute = await import("../../../app/api/brands-management/brands/[brandId]/youtube-channels/route");
  ({ getPromptStore } = await import("../database"));
  const brand = await (await getPromptStore()).createBrand("neodigm", {
    name: "Salesforce",
    url: "https://www.salesforce.com",
    sitemapUrl: "",
    description: "",
    industry: "",
    markets: [],
    status: "active",
    aliases: [],
    otherBrands: [{ name: "HubSpot", aliases: [] }],
    urls: [],
    socialAccounts: [],
    earnedContentSources: [],
    cdnConnected: false,
    gscConnected: false,
    analyticsConnected: false,
  });
  brandId = brand.id;
});

after(async () => {
  await (await getPromptStore()).close();
  const cleanup = new Pool({ connectionString: baseUrl });
  await cleanup.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await cleanup.end();
});

const request = (pathname: string, method = "GET", body?: unknown) =>
  new NextRequest(`http://localhost${pathname}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const params = (id: string) => ({ params: Promise.resolve({ brandId: id }) });

const ownVideo = (position: number): AioCitation => ({
  position,
  url: "https://www.youtube.com/watch?v=aaaaaaaaaaa&t=134",
  domain: "youtube.com",
  title: "연동 가이드",
  sourceType: "own_video",
  videoId: "aaaaaaaaaaa",
  channelId: "UCUpquzY878NEaZm5bc7m2sQ",
  startSeconds: 134,
});
const blog: AioCitation = { position: 1, url: "https://blog.example.com/", domain: "blog.example.com", title: "블로그", sourceType: "other", videoId: null, channelId: null, startSeconds: null };

test("YouTube channels and AIO settings per brand", async () => {
  assert.deepEqual(await config.listBrandYoutubeChannels(brandId), []);
  // bad input is rejected before any network lookup
  const bad = await channelsRoute.POST(request(`/api/x`, "POST", { input: "https://www.salesforce.com" }), params(brandId));
  assert.equal(bad.status, 400);
  const missing = await channelsRoute.POST(request(`/api/x`, "POST", { input: "@salesforce" }), params("no-such-brand"));
  assert.equal(missing.status, 404);

  const channel = { channelId: "UCUpquzY878NEaZm5bc7m2sQ", handle: "@salesforce", title: "Salesforce", thumbnailUrl: null };
  await config.addBrandYoutubeChannel(brandId, channel);
  await config.addBrandYoutubeChannel(brandId, { ...channel, title: "Salesforce (renamed)" }); // upsert, not duplicate
  const channels = await config.listBrandYoutubeChannels(brandId);
  assert.equal(channels.length, 1);
  assert.equal(channels[0].title, "Salesforce (renamed)");

  assert.deepEqual(await config.getBrandAioSettings(brandId), config.DEFAULT_AIO_SETTINGS);
  const invalid = await settingsRoute.PUT(request(`/api/x`, "PUT", { country: "korea", language: "ko", devices: ["mobile"] }), params(brandId));
  assert.equal(invalid.status, 400);
  const noDevice = await settingsRoute.PUT(request(`/api/x`, "PUT", { country: "kr", language: "ko", devices: [] }), params(brandId));
  assert.equal(noDevice.status, 400);
  const ok = await settingsRoute.PUT(
    request(`/api/x`, "PUT", { country: "KR", language: "ko", devices: ["desktop", "mobile", "tablet"], optimizationDate: "2026-09-01" }),
    params(brandId)
  );
  assert.equal(ok.status, 200);
  assert.deepEqual(await config.getBrandAioSettings(brandId), {
    country: "kr",
    language: "ko",
    devices: ["desktop", "mobile"],
    optimizationDate: "2026-09-01",
    saved: true,
  });

  const removed = await channelsRoute.DELETE(request(`/api/x?channelId=${channel.channelId}`, "DELETE"), params(brandId));
  assert.equal(removed.status, 200);
  assert.deepEqual(await config.listBrandYoutubeChannels(brandId), []);
});

test("keywords: bulk add, normalized dedupe, archive and reactivate", async () => {
  const added = await keywordsRoute.POST(
    request("/api/youtube-aio/keywords", "POST", { brandId, group: "howto", keywords: "Slack 세일즈포스 연동\n  slack   세일즈포스 연동 \n\nCRM 도입 절차" })
  );
  assert.equal(added.status, 200);
  assert.deepEqual(await added.json(), { added: 2 });
  assert.equal((await keywordsRoute.POST(request("/api/youtube-aio/keywords", "POST", { brandId, group: "nope", keywords: "x" }))).status, 400);
  assert.equal((await keywordsRoute.POST(request("/api/youtube-aio/keywords", "POST", { brandId, group: "howto", keywords: "\n \n" }))).status, 400);

  let keywords = await store.listAioKeywords(brandId);
  assert.deepEqual(keywords.map((k) => [k.keyword, k.group]).sort(), [["CRM 도입 절차", "howto"], ["Slack 세일즈포스 연동", "howto"]]);
  const crm = keywords.find((k) => k.keyword === "CRM 도입 절차")!;
  await keywordsRoute.DELETE(request(`/api/youtube-aio/keywords?brandId=${brandId}&id=${crm.id}`, "DELETE"));
  assert.equal((await store.listAioKeywords(brandId)).length, 1);

  await store.addAioKeywords(brandId, ["crm 도입 절차"], "category");
  keywords = await store.listAioKeywords(brandId);
  assert.equal(keywords.length, 2);
  const reactivated = keywords.find((k) => k.id === crm.id)!;
  assert.equal(reactivated.group, "category");
});

test("observations: one per keyword/device/day, failures never overwrite a success", async () => {
  const [keyword] = await store.listAioKeywords(brandId);
  const base = { keywordId: keyword.id, device: "mobile" as const, country: "kr", language: "ko", aioText: "본문", screenshotPath: null, htmlPath: null, errorMessage: null };
  // 2026-09-20T23:30Z is already 9/21 in Seoul
  const first = await store.saveAioObservation(brandId, { ...base, collectedAt: "2026-09-20T23:30:00.000Z", status: "aio_present", paragraphs: [{ text: "문장", sources: [2] }], citations: [blog, ownVideo(2)] });
  assert.ok(first);
  const failed = await store.saveAioObservation(brandId, { ...base, collectedAt: "2026-09-21T02:00:00.000Z", status: "failed", paragraphs: [], citations: [], errorMessage: "captcha" });
  assert.equal(failed, null);
  const replaced = await store.saveAioObservation(brandId, { ...base, collectedAt: "2026-09-21T03:00:00.000Z", status: "aio_present", paragraphs: [], citations: [ownVideo(1)] });
  assert.ok(replaced);

  const observations = await store.listAioObservations(brandId, { fromDate: "2026-09-01", toDate: "2026-09-30" });
  assert.equal(observations.length, 1);
  assert.equal(observations[0].id, replaced);
  assert.equal(observations[0].collectedDate, "2026-09-21");
  assert.deepEqual(observations[0].citations.map((c) => [c.position, c.sourceType, c.startSeconds]), [[1, "own_video", 134]]);

  await store.saveAioObservation(brandId, { ...base, collectedAt: "2026-09-14T01:00:00.000Z", status: "aio_present", paragraphs: [], citations: [blog] });
  assert.deepEqual([...(await store.firstOwnCitationDates(brandId, ["aaaaaaaaaaa"]))], [["aaaaaaaaaaa", "2026-09-21"]]);
  assert.deepEqual([...(await store.collectedToday(brandId, "2026-09-21"))], [`${keyword.id}:mobile`]);

  // store → metrics end to end
  const overview = metrics.buildAioOverview({
    keywords: [keyword],
    observations: await store.listAioObservations(brandId, { fromDate: "2026-09-01", toDate: "2026-09-21" }),
    today: "2026-09-21",
    weeks: 2,
    optimizationDate: null,
  });
  assert.equal(overview.ownCitation.rate, 1);
  assert.deepEqual(overview.rows[0].change, { kind: "new", from: null, to: 1 });
});

test("work logs and snapshot path guard", async () => {
  const bad = await workLogsRoute.POST(request("/api/youtube-aio/work-logs", "POST", { brandId, videoId: "short", workDate: "2026-09-01", workType: "자막" }));
  assert.equal(bad.status, 400);
  const ok = await workLogsRoute.POST(
    request("/api/youtube-aio/work-logs", "POST", { brandId, videoId: "aaaaaaaaaaa", workDate: "2026-09-01", workType: "자막(SRT) 업로드", note: " " })
  );
  assert.equal(ok.status, 200);
  const logs = await store.listWorkLogs(brandId, ["aaaaaaaaaaa"]);
  assert.deepEqual(logs.map((l) => [l.workDate, l.workType, l.note]), [["2026-09-01", "자막(SRT) 업로드", null]]);
  await workLogsRoute.DELETE(request(`/api/youtube-aio/work-logs?brandId=${brandId}&id=${logs[0].id}`, "DELETE"));
  assert.deepEqual(await store.listWorkLogs(brandId, ["aaaaaaaaaaa"]), []);

  const [keyword] = await store.listAioKeywords(brandId);
  const outside = await store.saveAioObservation(brandId, {
    keywordId: keyword.id,
    device: "desktop",
    country: "kr",
    language: "ko",
    collectedAt: "2026-09-21T01:00:00.000Z",
    status: "aio_absent",
    aioText: null,
    paragraphs: [],
    citations: [],
    screenshotPath: path.resolve("package.json"),
    htmlPath: null,
    errorMessage: null,
  });
  const res = await snapshotRoute.GET(request(`/api/youtube-aio/snapshot?brandId=${brandId}&id=${outside}`));
  assert.equal(res.status, 400);
  const other = await snapshotRoute.GET(request(`/api/youtube-aio/snapshot?brandId=other&id=${outside}`));
  assert.equal(other.status, 404);
});

test("removing a YouTube channel also removes its social account; citation stats per channel", async () => {
  const s = await getPromptStore();
  await config.addBrandYoutubeChannel(brandId, { channelId: "UCUpquzY878NEaZm5bc7m2sQ", handle: "@salesforce", title: "Salesforce", thumbnailUrl: null });
  await s.updateBrand("neodigm", brandId, {
    socialAccounts: [
      { platform: "YouTube", handle: "https://www.youtube.com/@Salesforce" },
      { platform: "LinkedIn", handle: "salesforce" },
    ],
  });

  const stats = await store.channelCitationStats(brandId, ["UCUpquzY878NEaZm5bc7m2sQ", "UCnothingnothingnothing1"], "2026-09-01");
  assert.deepEqual(Object.fromEntries(stats!), {
    UCUpquzY878NEaZm5bc7m2sQ: { keywords: 1, videos: 1, lastCitedDate: "2026-09-21" },
    UCnothingnothingnothing1: { keywords: 0, videos: 0, lastCitedDate: null },
  });
  assert.equal(await store.channelCitationStats(brandId, ["UCUpquzY878NEaZm5bc7m2sQ"], "2026-12-01"), null);

  const res = await channelsRoute.DELETE(request(`/api/x?channelId=UCUpquzY878NEaZm5bc7m2sQ`, "DELETE"), params(brandId));
  const body = await res.json();
  assert.deepEqual(body.channels, []);
  assert.deepEqual(body.socialAccounts, [{ platform: "LinkedIn", handle: "salesforce" }]);
});

test("tracked videos: register, archive, reactivate; citation summaries from citation rows", async () => {
  const video = { videoId: "bbbbbbbbbbb", channelId: "UCotherotherotherother01", channelTitle: "파트너 채널", title: "파트너 영상", thumbnailUrl: "https://i.ytimg.com/vi/bbbbbbbbbbb/hqdefault.jpg" };
  assert.equal(await store.addBrandVideo(brandId, video), "added");
  assert.equal(await store.addBrandVideo(brandId, video), "exists");
  await store.archiveBrandVideo(brandId, video.videoId);
  assert.deepEqual(await store.listBrandVideos(brandId), []);
  assert.equal(await store.addBrandVideo(brandId, video), "reactivated");
  // 수집기 판정은 채널 이름 없이 캐시한다 — 기존 이름을 지우지 않는다.
  await store.cacheVideo({ ...video, channelTitle: undefined, title: "파트너 영상 (수정)" });
  const [listed] = await store.listBrandVideos(brandId);
  assert.deepEqual([listed.videoId, listed.title, listed.channelTitle], ["bbbbbbbbbbb", "파트너 영상 (수정)", "파트너 채널"]);

  await store.addAioKeywords(brandId, ["영상 키워드 A", "영상 키워드 B"], "howto");
  const keywords = await store.listAioKeywords(brandId);
  const a = keywords.find((k) => k.keyword === "영상 키워드 A")!;
  const b = keywords.find((k) => k.keyword === "영상 키워드 B")!;
  // 인용 분류와 무관하게 영상 ID로 모은다(타 채널 영상은 other_youtube).
  const cite = (position: number, t: number | null): AioCitation => ({
    position,
    url: `https://www.youtube.com/watch?v=bbbbbbbbbbb${t === null ? "" : `&t=${t}`}`,
    domain: "youtube.com",
    title: "파트너 영상",
    sourceType: "other_youtube",
    videoId: "bbbbbbbbbbb",
    channelId: video.channelId,
    startSeconds: t,
  });
  const save = (keywordId: string, device: "mobile" | "desktop", date: string, citations: AioCitation[]) =>
    store.saveAioObservation(brandId, {
      keywordId,
      device,
      country: "kr",
      language: "ko",
      collectedAt: `${date}T03:00:00.000Z`,
      status: "aio_present",
      aioText: "본문",
      paragraphs: [],
      citations,
      screenshotPath: null,
      htmlPath: null,
      errorMessage: null,
    });
  await save(b.id, "mobile", "2026-09-05", [cite(1, null)]); // 등록 전·가장 이른 인용 (나중에 보관할 키워드)
  await save(a.id, "mobile", "2026-09-10", [blog, cite(3, 60)]);
  await save(b.id, "mobile", "2026-09-19", [cite(1, null)]);
  await save(a.id, "mobile", "2026-09-20", [cite(2, 90), cite(4, 30), blog]);
  await save(b.id, "desktop", "2026-09-20", [cite(1, 15)]);
  await store.archiveAioKeyword(brandId, b.id);

  const mobile = await store.videoCitationSummaries(brandId, ["bbbbbbbbbbb", "ccccccccccc"], "mobile", "2026-09-15");
  // 최근 값은 활성 키워드(A)만, 첫 인용일은 보관된 B의 9/5까지 포함.
  assert.deepEqual(Object.fromEntries(mobile), {
    bbbbbbbbbbb: { recentKeywords: 1, recentBestPosition: 2, firstCitedDate: "2026-09-05", lastCitedDate: "2026-09-20" },
  });
  const desktop = await store.videoCitationSummaries(brandId, ["bbbbbbbbbbb"], "desktop", "2026-09-15");
  assert.deepEqual(desktop.get("bbbbbbbbbbb"), { recentKeywords: 0, recentBestPosition: null, firstCitedDate: "2026-09-20", lastCitedDate: "2026-09-20" });

  assert.deepEqual(await store.videoKeywordCitations(brandId, "bbbbbbbbbbb", "mobile"), [
    { keywordId: a.id, keyword: "영상 키워드 A", group: "howto", lastCitedDate: "2026-09-20", lastPosition: 2, startSeconds: [30, 90], citedDays: 2 },
  ]);
  assert.deepEqual(await store.videoKeywordCitations(brandId, "bbbbbbbbbbb", "desktop"), []);

  assert.equal(await store.hasMeasurementSince(brandId, "mobile", "2026-09-15"), true);
  assert.equal(await store.hasMeasurementSince(brandId, "mobile", "2026-09-25"), false);
});

test("AIO keywords are prompts with the AIO surface: adding creates the tracked prompt, archiving turns the surface off, re-adding restores it", async () => {
  const s = await getPromptStore();
  const orgId = "neodigm";
  const surfacesOf = async (text: string) => {
    const [row] = (await s.library(orgId, brandId)).filter((r) => r.prompt === text);
    return row ? row.surfaces : null;
  };

  await store.addAioKeywords(brandId, ["통합 검색어 A", "통합 검색어 B"], "comparison");
  assert.deepEqual(await surfacesOf("통합 검색어 A"), ["google-aio"], "a new AIO keyword shows up in the prompt library with only the AIO surface");
  const [a] = (await store.listAioKeywords(brandId)).filter((k) => k.keyword === "통합 검색어 A");
  const [{ prompt_id: linked }] = await s.query<{ prompt_id: string | null }>("SELECT prompt_id FROM aio_keywords WHERE id=$1", [a.id]);
  assert.ok(linked, "and the keyword points at its prompt");
  const [{ search_intent: intent }] = await s.query<{ search_intent: string | null }>("SELECT search_intent FROM prompts WHERE id=$1", [linked!]);
  assert.equal(intent, "업체 비교", "the group became the search intent");

  // 라이브러리에 이미 AI 답변 표면으로 있던 프롬프트에 같은 검색어를 AIO로 추가하면 표면만 더해진다.
  await s.track(orgId, { text: "함께 쓰는 질의" }, { brandId, origin: "manual" });
  await store.addAioKeywords(brandId, ["함께 쓰는 질의"], "category");
  assert.deepEqual(await surfacesOf("함께 쓰는 질의"), ["google-aio", "google-ai-mode", "naver-ai"]);

  await store.archiveAioKeyword(brandId, a.id);
  assert.equal(await surfacesOf("통합 검색어 A"), null, "an AIO-only prompt leaves the library when its keyword is archived");
  const [shared] = (await store.listAioKeywords(brandId)).filter((k) => k.keyword === "함께 쓰는 질의");
  await store.archiveAioKeyword(brandId, shared.id);
  assert.deepEqual(await surfacesOf("함께 쓰는 질의"), ["google-ai-mode", "naver-ai"], "a prompt with other surfaces stays and loses only the AIO one");

  await store.addAioKeywords(brandId, ["통합 검색어 A"], "comparison");
  assert.deepEqual(await surfacesOf("통합 검색어 A"), ["google-aio"], "adding it again restores the tracked prompt and its AIO surface");
  assert.equal((await store.listAioKeywords(brandId)).filter((k) => k.keyword === "통합 검색어 A").length, 1, "without duplicating the keyword");
});

test("the AIO screens read the prompt text from the library, and a prompt added without a group gets no classification", async () => {
  const s = await getPromptStore();
  const orgId = "neodigm";

  await store.addAioKeywords(brandId, ["그룹 없이 추가한 프롬프트"]);
  const [plain] = await s.query<{ topic_id: string | null; search_intent: string | null }>(
    "SELECT topic_id,search_intent FROM prompts WHERE organization_id=$1 AND text='그룹 없이 추가한 프롬프트'", [orgId]);
  assert.deepEqual([plain.topic_id, plain.search_intent], [null, null], "no group means no topic or intent is invented");
  assert.ok((await store.listAioKeywords(brandId)).some((k) => k.keyword === "그룹 없이 추가한 프롬프트"));

  // 라이브러리에서 문장을 고치면 AIO 목록과 영상별 키워드 조회에도 새 문장이 보인다.
  const row = (await s.library(orgId, brandId)).find((r) => r.prompt === "그룹 없이 추가한 프롬프트")!;
  await s.updateLibrary(orgId, row.id, { prompt: "고친 프롬프트 문장", category: row.category, topic: row.topic });
  const names = (await store.listAioKeywords(brandId)).map((k) => k.keyword);
  assert.ok(names.includes("고친 프롬프트 문장"), "the edited text is shown");
  assert.ok(!names.includes("그룹 없이 추가한 프롬프트"), "not the old one");

  // 같은 검색어를 다시 추가해도(그룹 없이) 이미 있는 키워드의 그룹은 바뀌지 않는다.
  await store.addAioKeywords(brandId, ["통합 검색어 B"], "howto");
  await store.addAioKeywords(brandId, ["통합 검색어 B"]);
  const [b] = await s.query<{ keyword_group: string }>("SELECT keyword_group FROM aio_keywords WHERE brand_id=$1 AND normalized_keyword='통합 검색어 b'", [brandId]);
  assert.equal(b.keyword_group, "howto");
});

test("adding a same-text prompt to the library does not switch off an AIO keyword that is not linked yet", async () => {
  const s = await getPromptStore();
  await s.query(
    "INSERT INTO aio_keywords (id,brand_id,keyword,normalized_keyword,keyword_group,status,created_at) VALUES ('aiokw-legacy',$1,'기존 AIO 키워드','기존 aio 키워드','category','active','2026-09-01T00:00:00.000Z')",
    [brandId]
  );
  await s.track("neodigm", { text: "기존 AIO 키워드" }, { brandId, origin: "manual" });
  const [row] = await s.query<{ status: string; prompt_id: string | null }>("SELECT status,prompt_id FROM aio_keywords WHERE id='aiokw-legacy'");
  assert.equal(row.status, "active", "the unlinked keyword keeps collecting");
  assert.equal(row.prompt_id, null);
});

test("YouTube 관리: synced videos start unchecked, checking is per video, expected prompts register with their surfaces and link back to the video", async () => {
  const channelId = "UCownownownownownown01";
  const synced = (videoId: string, title: string) => ({
    videoId, channelId, channelTitle: "Salesforce", title, thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
    publishedAt: videoId === "sync1111111" ? "2026-09-01T00:00:00Z" : "2026-09-20T00:00:00Z", description: "설명 앞부분",
  });
  assert.deepEqual(await manage.saveSyncedVideos(brandId, [synced("sync1111111", "첫 영상"), synced("sync2222222", "둘째 영상")]), { added: 2, total: 2 });
  // 다시 가져오면 새로 들어온 것만 센다 — 제목은 갱신되고 체크는 그대로.
  await manage.setVideosChecked(brandId, ["sync1111111"], true);
  assert.deepEqual(await manage.saveSyncedVideos(brandId, [synced("sync1111111", "첫 영상 (수정)"), synced("sync3333333", "셋째 영상")]), { added: 1, total: 2 });
  const listed = await manage.listManagedVideos(brandId);
  const syncedRows = listed.filter((v) => v.videoId.startsWith("sync"));
  assert.deepEqual(syncedRows.map((v) => [v.videoId, v.title, v.checked, v.promptCount]), [
    ["sync2222222", "둘째 영상", false, 0], // 게시일이 최신인 순(같은 날이면 ID 순)
    ["sync3333333", "셋째 영상", false, 0],
    ["sync1111111", "첫 영상 (수정)", true, 0],
  ]);
  assert.equal(listed.find((v) => v.videoId === "bbbbbbbbbbb")?.checked, true, "a manually registered video is already checked");
  assert.equal(listed.find((v) => v.videoId === "sync1111111")?.description, "설명 앞부분");

  // 체크 API
  assert.equal((await manageVideosRoute.PATCH(request("/x", "PATCH", { brandId: "nope", videoIds: ["sync2222222"], checked: true }))).status, 404);
  assert.equal((await manageVideosRoute.PATCH(request("/x", "PATCH", { brandId, videoIds: [], checked: true }))).status, 400);
  assert.deepEqual(await (await manageVideosRoute.PATCH(request("/x", "PATCH", { brandId, videoIds: ["sync2222222", "sync1111111", "unknown0000"], checked: true }))).json(), { changed: 1 });
  assert.deepEqual(await (await manageVideosRoute.PATCH(request("/x", "PATCH", { brandId, videoIds: ["sync2222222"], checked: false }))).json(), { changed: 1 });

  // 가져오기 API — 키가 없으면 안내, 채널이 없으면 400
  assert.equal((await manageSyncRoute.POST(request("/x", "POST", { brandId: "nope" }))).status, 404);
  assert.equal((await manageSyncRoute.POST(request("/x", "POST", { brandId }))).status, 400);
  await config.addBrandYoutubeChannel(brandId, { channelId, handle: "@salesforce", title: "Salesforce", thumbnailUrl: null });
  const savedKey = process.env.YOUTUBE_API_KEY;
  delete process.env.YOUTUBE_API_KEY;
  assert.equal((await manageSyncRoute.POST(request("/x", "POST", { brandId }))).status, 503);
  if (savedKey !== undefined) process.env.YOUTUBE_API_KEY = savedKey;
  await config.removeBrandYoutubeChannel(brandId, channelId);

  // 예상 프롬프트 등록
  const post = (prompts: unknown) => managePromptsRoute.POST(request("/x", "POST", { brandId, prompts }));
  assert.equal((await post([{ videoId: "unknown0000", text: "남의 영상", surfaces: ["google-aio"] }])).status, 400);
  assert.equal((await post([{ videoId: "sync1111111", text: "표면 없음", surfaces: [] }])).status, 400);
  assert.equal((await post([])).status, 400);
  const ok = await post([
    { videoId: "sync1111111", text: "Slack 세일즈포스 연동 방법", surfaces: ["google-aio"] },
    { videoId: "sync1111111", text: "세일즈포스에서 Slack 알림을 받으려면 어떻게 설정하나요?", surfaces: ["google-ai-mode", "naver-ai"] },
  ]);
  assert.deepEqual(await ok.json(), { registered: 2 });

  const s = await getPromptStore();
  const library = await s.library("neodigm", brandId);
  const aioRow = library.find((r) => r.prompt === "Slack 세일즈포스 연동 방법")!;
  assert.deepEqual(aioRow.surfaces, ["google-aio"]);
  assert.equal(aioRow.category, "YouTube 영상");
  assert.equal(aioRow.topic, "첫 영상 (수정)");
  assert.equal((await manage.listManagedVideos(brandId)).find((v) => v.videoId === "sync1111111")?.promptCount, 2);

  // 영상 상세: 등록한 프롬프트, AIO 수집 여부, 인용 결과
  let rows = await manage.videoPromptRows(brandId, "sync1111111", "mobile");
  assert.deepEqual(rows.map((r) => [r.text, r.surfaces, r.aioTracked, r.aioMeasured, r.lastCitedDate]), [
    ["Slack 세일즈포스 연동 방법", ["google-aio"], true, false, null],
    ["세일즈포스에서 Slack 알림을 받으려면 어떻게 설정하나요?", ["google-ai-mode", "naver-ai"], false, false, null],
  ]);
  const keyword = (await store.listAioKeywords(brandId)).find((k) => k.keyword === "Slack 세일즈포스 연동 방법")!;
  const cited: AioCitation = { position: 2, url: "https://www.youtube.com/watch?v=sync1111111", domain: "youtube.com", title: "첫 영상", sourceType: "own_video", videoId: "sync1111111", channelId, startSeconds: null };
  const save = (date: string, citations: AioCitation[]) =>
    store.saveAioObservation(brandId, { keywordId: keyword.id, device: "mobile", country: "kr", language: "ko", collectedAt: `${date}T03:00:00.000Z`, status: "aio_present", aioText: "본문", paragraphs: [], citations, screenshotPath: null, htmlPath: null, errorMessage: null });
  await save("2026-09-20", [{ ...cited, position: 3 }]);
  await save("2026-09-25", []); // 수집했지만 인용 안 됨 — 마지막 인용일은 그대로
  rows = await manage.videoPromptRows(brandId, "sync1111111", "mobile");
  assert.deepEqual([rows[0].aioMeasured, rows[0].lastCitedDate, rows[0].lastPosition], [true, "2026-09-20", 3]);
  const desktop = await manage.videoPromptRows(brandId, "sync1111111", "desktop");
  assert.deepEqual([desktop[0].aioMeasured, desktop[0].lastCitedDate], [false, null], "measurement is per device");
  // 다른 영상의 상세에는 나타나지 않는다.
  assert.deepEqual(await manage.videoPromptRows(brandId, "sync2222222", "mobile"), []);
  // 인용 키워드 표(기존 함수)에도 프롬프트 문장으로 나온다.
  const byKeyword = await store.videoKeywordCitations(brandId, "sync1111111", "mobile");
  assert.deepEqual(byKeyword.map((k) => [k.keyword, k.lastPosition]), [["Slack 세일즈포스 연동 방법", 3]]);
});

test("라이브러리에서 고른 프롬프트: 표면 일괄 변경이 AIO 수집 대상과 맞물리고, AIO 수집은 켜진 것만 고른다", async () => {
  const s = await getPromptStore();
  const one = await s.track("neodigm", { text: "일괄 표면 프롬프트 하나" }, { brandId, origin: "manual" });
  const two = await s.track("neodigm", { text: "일괄 표면 프롬프트 둘" }, { brandId, origin: "manual" });
  assert.deepEqual(one.surfaces, ["google-ai-mode", "naver-ai"]);
  assert.deepEqual(await store.aioKeywordIdsForPrompts(brandId, [one.promptId, two.promptId]), [], "AIO 표면이 없으면 수집 대상이 아니다");

  const post = (body: unknown) => bulkSurfacesRoute.POST(request("/x", "POST", body));
  assert.equal((await post({ ids: [], surfaces: ["google-aio"] })).status, 400);
  assert.equal((await post({ ids: [one.id], surfaces: [] })).status, 400);
  assert.deepEqual(await (await post({ ids: [one.id, "tracked-none", one.id], surfaces: ["google-aio", "naver-ai"] })).json(), { changed: 1 });

  const surfaces = async (id: string) => (await s.library("neodigm", brandId)).find((r) => r.id === id)?.surfaces;
  assert.deepEqual(await surfaces(one.id), ["google-aio", "naver-ai"]);
  assert.deepEqual(await surfaces(two.id), ["google-ai-mode", "naver-ai"], "선택하지 않은 프롬프트는 그대로");
  const ids = await store.aioKeywordIdsForPrompts(brandId, [one.promptId, two.promptId]);
  assert.equal(ids.length, 1, "AIO가 켜진 프롬프트만 수집 대상으로 나온다");

  await post({ ids: [one.id], surfaces: ["naver-ai"] });
  assert.deepEqual(await store.aioKeywordIdsForPrompts(brandId, [one.promptId]), [], "AIO를 끄면 수집 대상에서 빠진다");
});

test("deleting a brand removes its AIO data", async () => {
  const s = await getPromptStore();
  await s.deleteBrand("neodigm", brandId);
  for (const table of ["aio_keywords", "aio_observations", "aio_video_work_logs", "brand_aio_settings", "brand_youtube_channels", "brand_videos"]) {
    const [row] = await s.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table} WHERE brand_id=$1`, [brandId]);
    assert.equal(row.n, 0, table);
  }
  const [citations] = await s.query<{ n: number }>("SELECT count(*)::int AS n FROM aio_citations");
  assert.equal(citations.n, 0);
});
