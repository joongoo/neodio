import assert from "node:assert/strict";
import { test } from "node:test";
import { parseChannelInput, parseTimestamp, parseYoutubeVideoUrl } from "./youtube";

test("parseYoutubeVideoUrl reads every YouTube link shape AIO cites", () => {
  assert.deepEqual(parseYoutubeVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=134s"), { videoId: "dQw4w9WgXcQ", startSeconds: 134 });
  assert.deepEqual(parseYoutubeVideoUrl("https://youtu.be/dQw4w9WgXcQ?t=48"), { videoId: "dQw4w9WgXcQ", startSeconds: 48 });
  assert.deepEqual(parseYoutubeVideoUrl("https://m.youtube.com/watch?v=dQw4w9WgXcQ#t=1m30s"), { videoId: "dQw4w9WgXcQ", startSeconds: 90 });
  assert.deepEqual(parseYoutubeVideoUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ"), { videoId: "dQw4w9WgXcQ", startSeconds: null });
  assert.equal(parseYoutubeVideoUrl("https://www.youtube.com/@salesforce"), null);
  assert.equal(parseYoutubeVideoUrl("https://www.salesforce.com/watch?v=dQw4w9WgXcQ"), null);
  assert.equal(parseYoutubeVideoUrl("not a url"), null);
});

test("parseTimestamp", () => {
  assert.equal(parseTimestamp("1h2m3s"), 3723);
  assert.equal(parseTimestamp("358"), 358);
  assert.equal(parseTimestamp("abc"), null);
});

test("parseChannelInput accepts URL, handle and channel ID", () => {
  assert.deepEqual(parseChannelInput("https://www.youtube.com/@salesforce"), { kind: "handle", handle: "@salesforce" });
  assert.deepEqual(parseChannelInput("youtube.com/@SalesforceKorea/videos"), { kind: "handle", handle: "@SalesforceKorea" });
  assert.deepEqual(parseChannelInput("@salesforce"), { kind: "handle", handle: "@salesforce" });
  assert.deepEqual(parseChannelInput("UCUpquzY878NEaZm5bc7m2sQ"), { kind: "id", channelId: "UCUpquzY878NEaZm5bc7m2sQ" });
  assert.deepEqual(parseChannelInput("https://www.youtube.com/channel/UCUpquzY878NEaZm5bc7m2sQ"), { kind: "id", channelId: "UCUpquzY878NEaZm5bc7m2sQ" });
  assert.equal(parseChannelInput("https://www.salesforce.com"), null);
});
