import assert from "node:assert/strict";
import { test } from "node:test";
import { buildJudgeContext, classifyWebSource, judgeCitations } from "./judge";

const SF = "UCUpquzY878NEaZm5bc7m2sQ";
const context = buildJudgeContext(
  {
    url: "https://www.salesforce.com",
    urls: ["https://trailhead.salesforce.com", "https://slack.com/intl/ko-kr"],
    otherBrands: [
      { name: "HubSpot", aliases: ["허브스팟"] },
      { name: "Zoho CRM", aliases: [] },
      { name: "MS", aliases: [] },
    ],
  },
  [SF]
);

test("buildJudgeContext normalizes own domains and competitor tokens", () => {
  assert.deepEqual(context.ownDomains, ["salesforce.com", "trailhead.salesforce.com", "slack.com"]);
  // Korean aliases and <3-char names can't be matched against a domain.
  assert.deepEqual(context.competitorTokens, ["hubspot", "zohocrm"]);
});

test("classifyWebSource", () => {
  assert.equal(classifyWebSource("www.salesforce.com", context), "own_web");
  assert.equal(classifyWebSource("help.salesforce.com", context), "own_web");
  assert.equal(classifyWebSource("notsalesforce.com", context), "other");
  assert.equal(classifyWebSource("blog.hubspot.com", context), "competitor");
  assert.equal(classifyWebSource("hubspot.kr", context), "competitor");
  assert.equal(classifyWebSource("blog.naver.com", context), "other");
  assert.equal(classifyWebSource("", context), "other");
});

test("judgeCitations decides own video by channel ID, not by domain", async () => {
  const videos: Record<string, { channelId: string; title: string }> = {
    aaaaaaaaaaa: { channelId: SF, title: "Slack–Salesforce 연동 가이드" },
    bbbbbbbbbbb: { channelId: "UCotherotherotherother1", title: "타 채널 튜토리얼" },
  };
  const citations = await judgeCitations(
    [
      { position: 1, title: "YouTube · Salesforce", url: "https://www.youtube.com/watch?v=aaaaaaaaaaa&t=134", domain: "youtube.com" },
      { position: 2, title: "도움말", url: "https://help.salesforce.com/s/articleView", domain: "help.salesforce.com" },
      { position: 3, title: "YouTube · 타 채널", url: "https://youtu.be/bbbbbbbbbbb", domain: "youtu.be" },
      { position: 4, title: "", url: "https://www.youtube.com/shorts/ccccccccccc", domain: "youtube.com" },
    ],
    context,
    async (id) => (videos[id] ? { videoId: id, thumbnailUrl: "", ...videos[id] } : null)
  );
  assert.deepEqual(
    citations.map((c) => [c.position, c.sourceType, c.videoId, c.startSeconds, c.title]),
    [
      [1, "own_video", "aaaaaaaaaaa", 134, "Slack–Salesforce 연동 가이드"],
      [2, "own_web", null, null, "도움말"],
      [3, "other_youtube", "bbbbbbbbbbb", null, "타 채널 튜토리얼"],
      // Lookup failed → still YouTube, just not provably ours.
      [4, "other_youtube", "ccccccccccc", null, ""],
    ]
  );
});
