import assert from "node:assert/strict";
import test from "node:test";
import { verifyStageAAccessToken } from "./service.mjs";

test("Stage A 실행 토큰이 일치할 때만 접근을 허용한다", () => {
  const previous = process.env.DATAFORSEO_STAGE_A_TOKEN;
  process.env.DATAFORSEO_STAGE_A_TOKEN = "stage-a-test-token-1234567890";
  try {
    assert.equal(verifyStageAAccessToken("stage-a-test-token-1234567890"), true);
    assert.equal(verifyStageAAccessToken("stage-a-test-token-incorrect"), false);
    assert.equal(verifyStageAAccessToken(null), false);
  } finally {
    if (previous === undefined) delete process.env.DATAFORSEO_STAGE_A_TOKEN;
    else process.env.DATAFORSEO_STAGE_A_TOKEN = previous;
  }
});
