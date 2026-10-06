import assert from "node:assert/strict";
import test from "node:test";
import { pageTable, tableQueryFrom } from "./serverPaging";

const rows = Array.from({ length: 95 }, (_, i) => ({ url: `https://example.com/page-${i + 1}` }));
const match = (row: { url: string }, q: string) => row.url.toLowerCase().includes(q);

test("기본은 10개씩 첫 페이지", () => {
  const p = pageTable(rows, {}, match);
  assert.equal(p.rows.length, 10);
  assert.equal(p.pageCount, 10);
  assert.equal(p.total, 95);
  assert.equal(p.filteredTotal, 95);
});

test("페이지·크기 지정과 범위 보정", () => {
  assert.equal(pageTable(rows, { page: "10", size: "10" }, match).rows.length, 5);
  assert.equal(pageTable(rows, { page: "99", size: "25" }, match).page, 4);
  assert.equal(pageTable(rows, { page: "-3" }, match).page, 1);
  assert.equal(pageTable(rows, { size: "7" }, match).pageSize, 10); // 허용 안 된 크기
});

test("검색은 전체 수와 필터 수를 따로 센다(대소문자 무시)", () => {
  const p = pageTable(rows, { q: "PAGE-9" }, match);
  assert.equal(p.filteredTotal, 7); // 9, 90~95
  assert.equal(p.total, 95);
  assert.equal(p.search, "PAGE-9");
});

test("표 접두사로 주소 파라미터를 꺼낸다", () => {
  const q = tableQueryFrom({ ownPage: "2", ownSize: "25", ownQ: "a", tpPage: "3" }, "own");
  assert.deepEqual(q, { page: "2", size: "25", q: "a" });
  assert.equal(tableQueryFrom({ tpPage: "3" }, "tp").page, "3");
});
