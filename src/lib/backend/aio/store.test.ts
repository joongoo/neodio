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

test("deleting a brand removes its AIO data", async () => {
  const s = await getPromptStore();
  await s.deleteBrand("neodigm", brandId);
  for (const table of ["aio_keywords", "aio_observations", "aio_video_work_logs", "brand_aio_settings", "brand_youtube_channels"]) {
    const [row] = await s.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table} WHERE brand_id=$1`, [brandId]);
    assert.equal(row.n, 0, table);
  }
  const [citations] = await s.query<{ n: number }>("SELECT count(*)::int AS n FROM aio_citations");
  assert.equal(citations.n, 0);
});
