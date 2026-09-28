import assert from "node:assert/strict";
import { test } from "node:test";
import { AioCitation, AioKeyword, AioObservation, AioSourceType } from "@/lib/db/types";
import { addDays, buildAioOverview, buildHistory, retention } from "./metrics";

const kw = (id: string): AioKeyword => ({ id, keyword: `키워드 ${id}`, group: "howto", createdAt: "2026-09-01" });

function cite(position: number, sourceType: AioSourceType, videoId: string | null = null): AioCitation {
  return { position, url: `https://example.com/${position}`, domain: "example.com", title: `t${position}`, sourceType, videoId, channelId: null, startSeconds: null };
}

let seq = 0;
function obs(keywordId: string, date: string, status: AioObservation["status"], citations: AioCitation[] = []): AioObservation {
  seq += 1;
  return {
    id: `o${seq}`,
    keywordId,
    device: "mobile",
    collectedAt: `${date}T01:00:00.000Z`,
    collectedDate: date,
    status,
    aioText: null,
    paragraphs: [],
    citations,
    hasScreenshot: false,
    errorMessage: null,
  };
}

const today = "2026-09-21";

test("rates use AIO-present keywords as the denominator; failures and unmeasured don't count", () => {
  const overview = buildAioOverview({
    keywords: [kw("a"), kw("b"), kw("c"), kw("d"), kw("e")],
    observations: [
      obs("a", today, "aio_present", [cite(1, "own_video", "v1"), cite(2, "own_web"), cite(3, "other")]),
      obs("b", today, "aio_present", [cite(1, "other_youtube", "v9"), cite(2, "competitor")]),
      obs("c", today, "aio_present", [cite(1, "other")]),
      obs("d", today, "aio_absent"),
      // e: only a failed collection → unmeasured
      obs("e", today, "failed"),
    ],
    today,
    weeks: 2,
    optimizationDate: null,
  });
  assert.equal(overview.trackedKeywords, 5);
  assert.equal(overview.measuredKeywords, 4);
  assert.deepEqual(overview.aioExposure, { numerator: 3, denominator: 4, rate: 0.75 });
  assert.deepEqual(overview.youtubeCitation, { numerator: 2, denominator: 3, rate: 2 / 3 });
  assert.deepEqual(overview.ownCitation, { numerator: 1, denominator: 3, rate: 1 / 3 });
  assert.deepEqual(overview.shareOfVoice, { numerator: 1, denominator: 6, rate: 1 / 6 });
  assert.equal(overview.citedOwnVideos, 1);
  assert.equal(overview.averageOwnPosition, 1);
  assert.equal(overview.sourceShare.reduce((sum, s) => sum + s.count, 0), 6);

  const rowE = overview.rows.find((r) => r.keywordId === "e")!;
  assert.equal(rowE.status, "unmeasured");
  const rowD = overview.rows.find((r) => r.keywordId === "d")!;
  assert.equal(rowD.status, "aio_absent");
  assert.equal(rowD.hasYoutube, null);
  const rowB = overview.rows.find((r) => r.keywordId === "b")!;
  assert.match(rowB.alternative ?? "", /^대신 인용: 타 채널 영상/);
});

test("no data at all is unmeasured (null), not 0%", () => {
  const overview = buildAioOverview({ keywords: [kw("a")], observations: [], today, weeks: 1, optimizationDate: null });
  assert.equal(overview.aioExposure.rate, null);
  assert.equal(overview.ownCitation.rate, null);
  assert.equal(overview.ownCitationChange.pp, null);
  assert.equal(overview.trend[0].ownCitation, null);
  assert.equal(overview.trendGranularity, "day");
  assert.equal(overview.trend.length, 7);
});

test("7-day change: new, lost, up, same, and none when AIO is absent", () => {
  const weekAgo = addDays(today, -7);
  const overview = buildAioOverview({
    keywords: [kw("new"), kw("lost"), kw("up"), kw("same"), kw("absent")],
    observations: [
      obs("absent", weekAgo, "aio_absent"),
      obs("absent", today, "aio_absent"),
      obs("new", weekAgo, "aio_present", [cite(1, "other")]),
      obs("new", today, "aio_present", [cite(1, "own_video", "v1")]),
      obs("lost", weekAgo, "aio_present", [cite(2, "own_video", "v2")]),
      obs("lost", today, "aio_present", [cite(1, "other")]),
      obs("up", weekAgo, "aio_present", [cite(1, "other"), cite(2, "other"), cite(3, "own_video", "v3")]),
      obs("up", today, "aio_present", [cite(1, "other"), cite(2, "own_video", "v3")]),
      obs("same", weekAgo, "aio_present", [cite(1, "other")]),
      obs("same", today, "aio_present", [cite(1, "other")]),
    ],
    today,
    weeks: 2,
    optimizationDate: null,
  });
  const change = Object.fromEntries(overview.rows.map((r) => [r.keywordId, r.change]));
  assert.deepEqual(change.new, { kind: "new", from: null, to: 1 });
  assert.deepEqual(change.lost, { kind: "lost", from: 2, to: null });
  assert.deepEqual(change.up, { kind: "up", from: 3, to: 2 });
  assert.equal(change.same.kind, "same");
  assert.equal(change.absent.kind, "none");
});

test("change vs optimization date is in percentage points over keyword-days", () => {
  const optimizationDate = "2026-09-10";
  const overview = buildAioOverview({
    keywords: [kw("a"), kw("b")],
    observations: [
      // before: 0 own of 2 AIO keyword-days
      obs("a", "2026-09-05", "aio_present", [cite(1, "other")]),
      obs("b", "2026-09-05", "aio_present", [cite(1, "other")]),
      // after: 1 own of 2
      obs("a", "2026-09-15", "aio_present", [cite(1, "own_video", "v1")]),
      obs("b", "2026-09-15", "aio_present", [cite(1, "other")]),
    ],
    today,
    weeks: 4,
    optimizationDate,
  });
  assert.deepEqual(overview.ownCitationChange, { pp: 50, basis: "optimization" });
  assert.equal(overview.trendGranularity, "week");
  assert.equal(overview.optimizationLabel, "9/6");
  assert.deepEqual(
    overview.trend.map((w) => [w.label, w.ownCitation]),
    [
      // 9/5 is a Saturday → the week of Sunday 8/30
      ["8/30", 0],
      ["9/6", null],
      ["9/13", 0.5],
      ["9/20", null],
    ]
  );
});

test("history and retention", () => {
  const history = buildHistory(
    [
      obs("a", addDays(today, -2), "aio_present", [cite(1, "own_video", "v1")]),
      obs("a", addDays(today, -1), "aio_present", [cite(1, "other_youtube", "v2")]),
      obs("a", today, "aio_absent"),
      obs("a", addDays(today, -3), "failed"),
    ],
    today,
    4
  );
  assert.deepEqual(
    history.map((h) => h.state),
    ["unmeasured", "own", "youtube", "absent"]
  );
  assert.deepEqual(retention(history), { numerator: 1, denominator: 3, rate: 1 / 3 });
});

test("short ranges trend by day, with the optimization date marked on its own day", () => {
  const overview = buildAioOverview({
    keywords: [kw("a")],
    observations: [
      obs("a", "2026-09-19", "aio_present", [cite(1, "other")]),
      obs("a", "2026-09-21", "aio_present", [cite(1, "own_video", "v1")]),
    ],
    today,
    weeks: 1,
    optimizationDate: "2026-09-20",
  });
  assert.equal(overview.trendGranularity, "day");
  assert.deepEqual(
    overview.trend.map((p) => [p.label, p.ownCitation]),
    [["9/15", null], ["9/16", null], ["9/17", null], ["9/18", null], ["9/19", 0], ["9/20", null], ["9/21", 1]]
  );
  assert.equal(overview.optimizationLabel, "9/20");
});
