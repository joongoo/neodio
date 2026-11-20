import assert from "node:assert/strict";
import test from "node:test";
import { buildCitationOverview, citationDate, type CitationObservation } from "./citationMetrics";

const ownUrl = "https://www.youtube.com/watch?v=abcdefghijk";
const unknownUrl = "https://youtu.be/zyxwvutsrqp";
function run(id: string, promptId: string, urls: string[], patch: Partial<CitationObservation> = {}): CitationObservation {
  return { id, promptId, query: promptId, runAt: "2026-11-20T01:00:00Z", status: "success", webSearch: true,
    citations: urls.map(url => ({ url, title: url, domain: "", isOwnDomain: false })), ...patch };
}
const meta = [{ videoId: "abcdefghijk", channelId: "own", title: "우리 영상", channelTitle: "우리 채널" }];

test("latest prompt snapshots exclude failed and unsearched answers and deduplicate video URL variants", () => {
  const result = buildCitationOverview([
    run("old", "p1", [], { runAt: "2026-11-19T01:00:00Z" }),
    run("new", "p1", [ownUrl, "https://youtu.be/abcdefghijk?t=10"]),
    run("fail", "p2", [ownUrl], { status: "failed" }),
    run("fallback", "p3", [], { webSearch: false }),
    run("missing", "p4", [], { webSearch: null }),
    run("web", "p5", ["https://example.com"]),
    run("unknown", "p6", [unknownUrl]),
  ], meta, ["own"], ["2026-11-19", "2026-11-20", "2026-11-21"]);
  assert.equal(result.rows.length, 6);
  assert.equal(result.measured, 3);
  assert.equal(result.excluded, 3);
  assert.equal(result.youtubeRate, 2 / 3);
  assert.equal(result.ownRate, 1 / 2, "uncertain negatives are not treated as own-channel misses");
  assert.equal(result.ownVideos, 1);
  assert.equal(result.unknownVideos, 1);
  assert.deepEqual(result.sourceCounts, { own: 1, other: 0, unknown: 1, own_web: 0, competitor: 0, web: 1 });
  assert.equal(result.videos.find(v => v.videoId === "abcdefghijk")?.prompts, 1);
  assert.equal(result.trend[0].youtubeRate, 0);
  assert.equal(result.trend[2].youtubeRate, null, "unmeasured dates are gaps, not zero");
});

test("latest successful observation survives a later collection failure, matching Google AIO", () => {
  const data = buildCitationOverview([run("old", "p", [ownUrl]), run("failed", "p", [], { runAt: "2026-11-20T02:00:00Z", status: "failed" })], meta, ["own"], []);
  assert.equal(data.measured, 1);
  assert.equal(data.youtubeRate, 1);
  assert.equal(data.ownRate, 1);
  assert.equal(data.videos.length, 1);
  assert.equal(data.rows[0].latestAttemptFailed, true);
});

test("KST dates, channel ownership and unknown channel configuration stay explicit", () => {
  assert.equal(citationDate("2026-11-19T15:00:00Z"), "2026-11-20");
  const empty = buildCitationOverview([], [], [], []);
  assert.equal(empty.youtubeRate, null);
  const unconfigured = buildCitationOverview([run("r", "p", [ownUrl])], meta, [], []);
  assert.equal(unconfigured.ownRate, null);
  assert.equal(unconfigured.sourceCounts.unknown, 1);
  const other = buildCitationOverview([run("r", "p", [ownUrl])], meta, ["different"], []);
  assert.equal(other.sourceCounts.other, 1);
  assert.equal(other.ownRate, 0);
});

test("uncollected prompts and absent AI answers are visible but excluded from citation denominators", () => {
  const data = buildCitationOverview([
    run("absent", "p1", [], { answerPresent: false }),
    run("unknown", "p2", [], { answerPresent: null }),
    run("answer", "p3", [], { answerPresent: true }),
  ], [], ["own"], ["2026-11-20"], [{ id: "waiting", query: "waiting" }]);
  assert.equal(data.rows.length, 4);
  assert.equal(data.measured, 1);
  assert.equal(data.youtubeRate, 0);
  assert.equal(data.exposureRate, 1 / 2, "AIO exposure includes absent observations and excludes unknown or uncollected results");
  assert.equal(data.exposureMeasured, 2);
  assert.equal(data.rows.find(row => row.promptId === "waiting")?.status, "uncollected");
});
