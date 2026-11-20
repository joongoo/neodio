import assert from "node:assert/strict";
import test from "node:test";
import { buildDeviceCitationOverview, citationDevice, supportsCitationDevices } from "./citationDevices";
import type { CitationObservation } from "./citationMetrics";
import { citationDetailHref } from "./citationNavigation";

test("device filtering happens before prompt snapshots, rates, sources, videos and daily trend", () => {
  const observations: CitationObservation[] = [
    { id: "mobile", device: "mobile", promptId: "prompt", query: "query", runAt: "2026-11-20T01:00:00Z", status: "success", webSearch: true, answerPresent: true,
      citations: [{ url: "https://youtu.be/abcdefghijk", title: "video", domain: "youtu.be", isOwnDomain: false }] },
    { id: "pc", device: "desktop", promptId: "prompt", query: "query", runAt: "2026-11-20T02:00:00Z", status: "success", webSearch: true, answerPresent: true, citations: [] },
    { id: "mobile-error", device: "mobile", promptId: "prompt", query: "query", runAt: "2026-11-20T03:00:00Z", status: "failed", webSearch: true, answerPresent: null, citations: [] },
    { id: "unknown", promptId: "old", query: "historical", runAt: "2026-11-20T04:00:00Z", status: "success", webSearch: true, answerPresent: true, citations: [] },
  ];
  const videos = [{ videoId: "abcdefghijk", title: "video", channelTitle: "channel", channelId: "our-channel" }];
  const build = (device: "all" | "desktop" | "mobile") => buildDeviceCitationOverview(observations, videos, ["our-channel"], ["2026-11-20"], [{ id: "prompt", query: "query" }], "google-aio", device);
  const all = build("all");
  assert.equal(all.rows.length, 2);
  assert.equal(all.rows.find(r => r.promptId === "prompt")?.id, "pc");
  assert.equal(all.ownRate, 0);
  assert.equal(all.hasUnknownDevice, true);
  const mobile = build("mobile");
  assert.equal(mobile.rows.length, 1, "unknown-device history is never assigned to a device");
  assert.equal(mobile.rows[0].id, "mobile");
  assert.equal(mobile.rows[0].latestAttemptFailed, true);
  assert.equal(mobile.ownRate, 1);
  assert.equal(mobile.videos.length, 1);
  assert.equal(mobile.sourceCounts.own, 1);
  assert.equal(mobile.trend[0].ownRate, 1);
  assert.equal(build("desktop").videos.length, 0);
  assert.deepEqual(mobile.deviceSummaries.map(s => [s.device, s.ownRate]), [["desktop", 0], ["mobile", 1]], "comparison always includes both devices");
});

test("supported engines accept only known device filters and navigation preserves them", () => {
  for (const engine of ["google-aio", "google-ai-mode", "naver-aio"] as const) {
    assert.equal(supportsCitationDevices(engine), true);
    assert.equal(citationDevice("mobile", engine), "mobile");
    for (const value of ["bad", ["mobile"], undefined]) assert.equal(citationDevice(value, engine), "all");
    const url = new URL(citationDetailHref("/org/brand/citations", "run", engine, { device: "mobile", q: "search" }), "https://example.com");
    assert.equal(url.searchParams.get("device"), "mobile");
    assert.equal(url.searchParams.get("q"), "search");
  }
  for (const engine of ["gemini", "naver-ai"] as const) {
    assert.equal(supportsCitationDevices(engine), false);
    assert.equal(citationDevice("mobile", engine), "all");
    const empty = buildDeviceCitationOverview([], [], [], [], [], engine, "mobile");
    assert.deepEqual(empty.deviceSummaries, []);
    const url = new URL(citationDetailHref("/org/brand/citations", "run", engine, { device: "mobile" }), "https://example.com");
    assert.equal(url.searchParams.has("device"), false);
  }
});
