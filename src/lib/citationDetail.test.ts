import assert from "node:assert/strict";
import test from "node:test";
import { buildCitationDetail } from "./citationDetail";
import type { CitationObservation } from "./citationMetrics";
import { citationDetailHref } from "./citationNavigation";

const dates = Array.from({ length: 7 }, (_, i) => `2026-11-${14 + i}`);
const videoUrl = "https://youtu.be/abcdefghijk";
const videos = [{ videoId: "abcdefghijk", channelId: "ours", channelTitle: "우리 채널", title: "영상" }];
function observation(id: string, day: string, urls: string[], patch: Partial<CitationObservation> = {}): CitationObservation {
  return { id, promptId: "prompt", query: "question", runAt: `${day}T01:00:00Z`, status: "success", webSearch: true, answerPresent: true,
    citations: urls.map(url => ({ title: "source", url, domain: "", isOwnDomain: false })), ...patch };
}

test("detail history distinguishes missing, failed, searchless, unknown and absent results", () => {
  const current = observation("own", dates[6], [videoUrl]);
  const data = buildCitationDetail(current, [current,
    observation("failed", dates[0], [], { status: "failed" }),
    observation("searchless", dates[1], [], { webSearch: false }),
    observation("unknown", dates[2], ["https://youtu.be/zyxwvutsrqp"]),
    observation("absent", dates[3], [], { answerPresent: false }),
    observation("no-video", dates[4], []),
  ], videos, ["ours"], dates);
  assert.deepEqual(data.history.map(day => day.state), ["failed", "searchless", "unknown", "absent", "none", "unmeasured", "own"]);
  assert.deepEqual(data.retention, { numerator: 1, denominator: 3, rate: 1 / 3 });
  assert.equal(data.history[0].runId, "failed");
  assert.equal(data.history[5].runId, null);
});

test("selected snapshot remains exact while same-prompt history and video reverse lookup use recorded identities", () => {
  const selected = observation("older-snapshot", dates[1], [videoUrl]);
  const recent = [selected, observation("newest", dates[6], []),
    observation("other", dates[0], [videoUrl], { promptId: "other-prompt", query: "question" })];
  const data = buildCitationDetail(selected, recent, videos, ["ours"], dates);
  assert.equal(data.current.id, "older-snapshot");
  assert.equal(data.current.hasOwn, true);
  assert.equal(data.history.at(-1)?.state, "none");
  assert.equal(data.ownVideos[0].firstInPeriod, dates[0]);
  assert.deepEqual(data.ownVideos[0].otherPrompts, [{ id: "other", query: "question" }]);
  assert.equal(data.history[0].state, "unmeasured", "another prompt's result cannot fill a missing collection day");
});

test("unknown channel configuration never reports a zero own-channel retention rate", () => {
  const o = observation("r", dates[6], [videoUrl]);
  const data = buildCitationDetail(o, [o], videos, [], dates);
  assert.equal(data.retention.rate, null);
  assert.equal(data.ownVideos.length, 0);
});

test("detail navigation encodes record identity and keeps list filters", () => {
  const href = citationDetailHref("/org/brand/citations", "aio:record/part", "naver-aio", { q: "a&b", range: "2w", size: "25", promptPage: "3", run: "foreign" });
  const url = new URL(href, "https://example.com");
  assert.equal(url.pathname, "/org/brand/citations/aio%3Arecord%2Fpart");
  assert.equal(url.searchParams.get("q"), "a&b");
  assert.equal(url.searchParams.get("engine"), "naver-aio");
  assert.equal(url.searchParams.get("promptPage"), "3");
  assert.equal(url.searchParams.get("size"), "25");
  assert.equal(url.searchParams.get("run"), null);
});
