import assert from "node:assert/strict";
import { test } from "node:test";
import { findChannelForSocial, isYoutubeSocial, socialForChannel, youtubeSocialKeys } from "./youtubeSocial";

const channel = { channelId: "UCUpquzY878NEaZm5bc7m2sQ", handle: "@salesforce", title: "Salesforce", thumbnailUrl: null, addedAt: "" };

test("isYoutubeSocial by platform or URL", () => {
  assert.equal(isYoutubeSocial({ platform: "YouTube", handle: "@salesforce" }), true);
  assert.equal(isYoutubeSocial({ platform: "유튜브", handle: "x" }), true);
  assert.equal(isYoutubeSocial({ platform: "기타", handle: "https://youtube.com/@salesforce" }), true);
  assert.equal(isYoutubeSocial({ platform: "LinkedIn", handle: "salesforce" }), false);
});

test("youtubeSocialKeys pulls handle and channel ID out of free text", () => {
  assert.deepEqual(youtubeSocialKeys("https://www.youtube.com/@Salesforce/videos"), ["@salesforce"]);
  assert.deepEqual(youtubeSocialKeys("https://www.youtube.com/channel/UCUpquzY878NEaZm5bc7m2sQ"), ["UCUpquzY878NEaZm5bc7m2sQ"]);
  assert.deepEqual(youtubeSocialKeys("salesforce"), []);
});

test("findChannelForSocial matches by handle (case-insensitive) or channel ID", () => {
  assert.equal(findChannelForSocial({ platform: "YouTube", handle: "@SalesForce" }, [channel]), channel);
  assert.equal(findChannelForSocial({ platform: "YouTube", handle: "youtube.com/channel/UCUpquzY878NEaZm5bc7m2sQ" }, [channel]), channel);
  assert.equal(findChannelForSocial({ platform: "YouTube", handle: "@SalesforceKorea" }, [channel]), null);
  // same text on a non-YouTube platform is not a YouTube channel
  assert.equal(findChannelForSocial({ platform: "X", handle: "@salesforce" }, [channel]), null);
  assert.deepEqual(socialForChannel(channel), { platform: "YouTube", handle: "@salesforce" });
  assert.deepEqual(socialForChannel({ channelId: "UCUpquzY878NEaZm5bc7m2sQ", handle: null }), {
    platform: "YouTube",
    handle: "https://www.youtube.com/channel/UCUpquzY878NEaZm5bc7m2sQ",
  });
});
