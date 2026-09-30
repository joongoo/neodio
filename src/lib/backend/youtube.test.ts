import assert from "node:assert/strict";
import { test } from "node:test";
import { parseChannelInput, parsePlaylistPage, parseTimestamp, parseYoutubeVideoUrl } from "./youtube";

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

test("parsePlaylistPage keeps public videos and skips deleted/private ones", () => {
  const thumbs = { medium: { url: "https://i.ytimg.com/vi/aaaaaaaaaaa/mqdefault.jpg" } };
  const videos = parsePlaylistPage(
    {
      items: [
        { snippet: { title: "공개 영상", description: "설명", publishedAt: "2026-01-01T00:00:00Z", thumbnails: thumbs, videoOwnerChannelId: "UCUpquzY878NEaZm5bc7m2sQ", videoOwnerChannelTitle: "Salesforce" }, contentDetails: { videoId: "aaaaaaaaaaa", videoPublishedAt: "2026-09-01T00:00:00Z" } },
        { snippet: { title: "Private video", description: "", thumbnails: thumbs }, contentDetails: { videoId: "bbbbbbbbbbb" } },
        { snippet: { title: "Deleted video", description: "" }, contentDetails: { videoId: "ccccccccccc" } },
        { snippet: { title: "ID가 이상한 영상", thumbnails: thumbs }, contentDetails: { videoId: "short" } },
        { snippet: { title: "썸네일 없는 영상" }, contentDetails: { videoId: "ddddddddddd" } },
      ],
    },
    "UCfallbackfallbackfallb",
    "Fallback"
  );
  assert.deepEqual(videos, [
    {
      videoId: "aaaaaaaaaaa",
      channelId: "UCUpquzY878NEaZm5bc7m2sQ",
      channelTitle: "Salesforce",
      title: "공개 영상",
      thumbnailUrl: "https://i.ytimg.com/vi/aaaaaaaaaaa/mqdefault.jpg",
      publishedAt: "2026-09-01T00:00:00Z", // 영상 게시일이 재생목록에 담긴 날보다 우선
      description: "설명",
    },
  ]);
});
