import assert from "node:assert/strict";
import test from "node:test";
import { Suspense } from "react";
import { PassThrough } from "node:stream";
import { renderToPipeableStream, renderToStaticMarkup } from "react-dom/server";
import { CollectionActivityIndicator } from "./CollectionActivityIndicator";
import { CollectionActivitySlot } from "./CollectionActivitySlot";
import { loadSidebarActivity } from "@/lib/backend/dataforseo/sidebarActivity";
import type { CollectionActivityStatus } from "@/lib/collectionActivityStatus";

test("sidebar shows spinner and exclamation independently with no numeric badge", () => {
  const cancelling = renderToStaticMarkup(<CollectionActivityIndicator state={{ status: "ready", running: true, attention: false, cancelling: true }} />);
  assert.ok(cancelling.includes("수집 취소 중")); assert.ok(cancelling.includes("animate-spin")); assert.ok(!cancelling.includes("lucide-circle-alert"));
  for (const running of [false, true]) for (const attention of [false, true]) {
    const html = renderToStaticMarkup(<CollectionActivityIndicator state={{ status: "ready", running, attention }} />);
    assert.equal(html.includes("lucide-loader-circle"), running);
    assert.equal(html.includes("lucide-circle-alert"), attention);
    assert.equal(html.includes("animate-spin"), running);
    assert.ok(!html.includes("99+"));
    assert.ok(!html.includes("건"));
    if (!running && !attention) assert.equal(html, "");
  }
  for (const status of ["loading", "unavailable"] as const) {
    const html = renderToStaticMarkup(<CollectionActivityIndicator state={{ status }} />);
    assert.ok(html.includes(status === "loading" ? "수집 상태 확인 중" : "수집 상태 확인 불가"));
    assert.ok(!html.includes("animate-spin"));
    assert.ok(!html.includes("lucide-circle-alert"));
  }
});

test("sidebar status reader skips unscoped brands and isolates read/logging failure", async () => {
  let reads = 0;
  const read = async (org: string, brand: string) => { reads++; assert.equal(org, "org"); assert.equal(brand, "brand"); return { running: true, attention: false }; };
  assert.deepEqual(await loadSidebarActivity("org", null, { read }), { status: "ready", running: false, attention: false });
  assert.equal(reads, 0);
  assert.deepEqual(await loadSidebarActivity("org", "brand", { read }), { status: "ready", running: true, attention: false });
  assert.equal(reads, 1);
  let logs = 0;
  const broken = await loadSidebarActivity("org", "brand", { read: async () => { throw Error("DB error"); }, logError: () => { logs++; throw Error("logger error"); } });
  assert.deepEqual(broken, { status: "unavailable" });
  assert.equal(logs, 1);
});

test("slow sidebar reads fall back without retries and late errors are handled", async () => {
  let reads = 0;
  let fail!: (error: Error) => void;
  const pending = new Promise<{ running: boolean; attention: boolean }>((_, reject) => { fail = reject; });
  const result = await loadSidebarActivity("org", "brand", { read: () => { reads++; return pending; }, timeoutMs: 10, logError: () => {} });
  assert.deepEqual(result, { status: "unavailable" });
  fail(Error("late database failure"));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(reads, 1);
});

test("streaming sends menu and main content before collection status resolves", async () => {
  let finish!: (state: CollectionActivityStatus) => void;
  const pending = new Promise<CollectionActivityStatus>(resolve => { finish = resolve; });
  const output = new PassThrough();
  let html = "";
  let shellReady!: () => void;
  const shell = new Promise<void>(resolve => { shellReady = resolve; });
  const ended = new Promise<void>((resolve, reject) => { output.on("end", resolve); output.on("error", reject); });
  output.on("data", chunk => { html += chunk.toString(); });
  const stream = renderToPipeableStream(<><nav>Collection menu <Suspense fallback={<CollectionActivityIndicator state={{ status: "loading" }} />}>
    <CollectionActivitySlot orgId="org" brandId="brand" load={() => pending} />
  </Suspense></nav><main>Other menu content</main></>, { onShellReady() { stream.pipe(output); shellReady(); }, onError(error) { output.destroy(error as Error); } });
  try {
    await shell;
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(html.includes("Other menu content"));
    assert.ok(html.includes("Collection menu"));
    assert.ok(html.includes("수집 상태 확인 중"));
    finish({ status: "ready", running: true, attention: true });
    await ended;
    assert.ok(html.includes("수집 진행 중"));
    assert.ok(html.includes("확인 필요한 수집 항목 있음"));
  } finally { finish({ status: "unavailable" }); stream.abort(); output.destroy(); }
});
