import assert from "node:assert/strict";
import test from "node:test";
import { buildGeminiOverview, geminiDate, type GeminiObservation } from "./geminiCitationMetrics";

const ownUrl = "https://www.youtube.com/watch?v=abcdefghijk";
const unknownUrl = "https://youtu.be/zyxwvutsrqp";
function run(id: string, promptId: string, urls: string[], patch: Partial<GeminiObservation> = {}): GeminiObservation {
  return { id, promptId, query: promptId, runAt: "2026-11-20T01:00:00Z", status: "success", webSearch: true,
    citations: urls.map(url => ({ url, title: url, domain: "", isOwnDomain: false })), ...patch };
}
const meta = [{ videoId: "abcdefghijk", channelId: "own", title: "우리 영상", channelTitle: "우리 채널" }];

test("latest prompt snapshots exclude failed and unsearched answers and deduplicate video URL variants", () => {
  const result = buildGeminiOverview([
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
  assert.deepEqual(result.sourceCounts, { own: 1, other: 0, unknown: 1, web: 1 });
  assert.equal(result.videos.find(v => v.videoId === "abcdefghijk")?.prompts, 1);
  assert.equal(result.trend[0].youtubeRate, 0);
  assert.equal(result.trend[2].youtubeRate, null, "unmeasured dates are gaps, not zero");
});

test("latest failure does not silently fall back to a previous successful answer", () => {
  const data = buildGeminiOverview([run("old", "p", [ownUrl]), run("failed", "p", [], { runAt: "2026-11-20T02:00:00Z", status: "failed" })], meta, ["own"], []);
  assert.equal(data.measured, 0);
  assert.equal(data.youtubeRate, null);
  assert.equal(data.ownRate, null);
  assert.equal(data.videos.length, 0);
});

test("KST dates, channel ownership and unknown channel configuration stay explicit", () => {
  assert.equal(geminiDate("2026-11-19T15:00:00Z"), "2026-11-20");
  const empty = buildGeminiOverview([], [], [], []);
  assert.equal(empty.youtubeRate, null);
  const unconfigured = buildGeminiOverview([run("r", "p", [ownUrl])], meta, [], []);
  assert.equal(unconfigured.ownRate, null);
  assert.equal(unconfigured.sourceCounts.unknown, 1);
  const other = buildGeminiOverview([run("r", "p", [ownUrl])], meta, ["different"], []);
  assert.equal(other.sourceCounts.other, 1);
  assert.equal(other.ownRate, 0);
});
