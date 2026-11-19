import assert from "node:assert/strict";
import test from "node:test";
import { isRetryFailure, isRetrySelectable, retrySelectionCost, reconcileRetrySelection, retryGroupSelected, mergeRetrySelection, isPendingSerpSelection, pendingSelectionCost, type RetrySelectionItem } from "./requestRetrySelection";

const item = (status: RetrySelectionItem["status"], executionKind: RetrySelectionItem["executionKind"] = "serp-api"): RetrySelectionItem => ({ id: "task", query: "query", surface: "google-aio", device: "mobile", status, executionKind });

test("failure selection covers both collection methods but excludes unknown submissions and recoverable artifacts", () => {
  for (const kind of ["legacy", "serp-api"] as const) {
    for (const status of ["provider_failed"] as const) {
      assert.ok(isRetryFailure(item(status, kind)));
      assert.ok(isRetrySelectable(item(status, kind)));
    }
    for (const status of ["parse_failed", "completed", "submission_unknown", "artifact_failed", "projection_failed", "queued", "submitting", "normalized", "raw_saved"] as const) {
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

test("failed and cancelled bulk groups accumulate and toggle independently", () => {
  const failed = [{ ...item("provider_failed"), id: "failed" }], cancelled = [{ ...item("cancelled"), id: "cancelled" }];
  let selected = mergeRetrySelection(new Map(), failed, true);
  assert.ok(retryGroupSelected(selected, failed)); assert.equal(retryGroupSelected(selected, cancelled), false);
  selected = mergeRetrySelection(selected, cancelled, true);
  assert.deepEqual([...selected.keys()], ["failed", "cancelled"]);
  assert.ok(retryGroupSelected(selected, failed)); assert.ok(retryGroupSelected(selected, cancelled));
  selected = mergeRetrySelection(selected, failed, false);
  assert.deepEqual([...selected.keys()], ["cancelled"]);
  assert.equal(retryGroupSelected(selected, failed), false); assert.ok(retryGroupSelected(selected, cancelled));
  assert.equal(retryGroupSelected(new Map(), []), false);
});

test("resubmitted originals are unselectable regardless of retry status", () => {
  for (const kind of ["legacy", "serp-api"] as const) {
    assert.equal(isRetrySelectable({ ...item("parse_failed", kind), hasRetry: true }), false);
    for (const status of ["reserved", "completed", "parse_failed", "cancelled"] as const) {
      assert.equal(isRetrySelectable({ ...item("parse_failed", kind), retries: [{ requestId: "retry", taskId: "retry-task", status }] }), false);
    }
  }
});

test("live row changes remove stale selected entries while preserving other pages", () => {
  const failed = item("parse_failed"), other = { ...item("cancelled"), id: "other-page" };
  const selected = new Map([[failed.id, failed], [other.id, other]]);
  const next = reconcileRetrySelection(selected, [{ ...failed, hasRetry: true }]);
  assert.deepEqual([...next.keys()], ["other-page"]);
  assert.equal(mergeRetrySelection(next, [{ ...failed, hasRetry: true }], true).has(failed.id), false);
});

test("only verified unclaimed SERP reservations form a pending action selection", () => {
  const pending = { ...item("reserved"), canManagePending: true, estimatedCostUsd: 0.0009 };
  assert.ok(isRetrySelectable(pending)); assert.ok(isPendingSerpSelection([pending]));
  assert.equal(pendingSelectionCost([pending]), 0.0009, "existing reservation estimate is preserved");
  assert.equal(isPendingSerpSelection([]), false);
  assert.equal(isPendingSerpSelection([pending, item("parse_failed")]), false);
  assert.equal(isPendingSerpSelection([pending, item("reserved", "legacy")]), false);
  assert.equal(isRetrySelectable({ ...pending, canManagePending: false }), false);
  assert.equal(isRetrySelectable({ ...pending, hasRetry: true }), false);
});
