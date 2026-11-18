import assert from "node:assert/strict";
import test from "node:test";
import { isRetryFailure, isRetrySelectable, retrySelectionCost, type RetrySelectionItem } from "./requestRetrySelection";

const item = (status: RetrySelectionItem["status"], executionKind: RetrySelectionItem["executionKind"] = "serp-api"): RetrySelectionItem => ({ id: "task", query: "query", surface: "google-aio", device: "mobile", status, executionKind });

test("failure selection covers both collection methods but excludes unknown submissions and recoverable artifacts", () => {
  for (const kind of ["legacy", "serp-api"] as const) {
    for (const status of ["provider_failed", "parse_failed"] as const) {
      assert.ok(isRetryFailure(item(status, kind)));
      assert.ok(isRetrySelectable(item(status, kind)));
    }
    for (const status of ["completed", "submission_unknown", "artifact_failed", "projection_failed", "queued", "submitting", "normalized", "raw_saved"] as const) {
      assert.equal(isRetryFailure(item(status, kind)), false);
      assert.equal(isRetrySelectable(item(status, kind)), false);
    }
    assert.equal(isRetryFailure(item("cancelled", kind)), false);
    assert.ok(isRetrySelectable(item("cancelled", kind)));
  }
  assert.ok(isRetrySelectable(item("reserved", "legacy")));
  assert.equal(isRetrySelectable(item("reserved")), false);
  assert.equal(isRetrySelectable(item("collecting")), false);
});

test("retry estimate counts selected device rows once and excludes local collection", () => {
  const mobile = item("provider_failed");
  const desktop = { ...mobile, id: "desktop", device: "desktop" };
  assert.equal(retrySelectionCost([mobile]), 0.0012);
  assert.equal(retrySelectionCost([mobile, desktop]), 0.0024);
  assert.equal(retrySelectionCost([mobile, desktop, { ...mobile, surface: "google-ai-mode" }, { ...mobile, surface: "naver-aio" }, item("parse_failed", "legacy")]).toFixed(4), "0.0042");
  assert.equal(retrySelectionCost([item("parse_failed", "legacy")]), 0);
});
