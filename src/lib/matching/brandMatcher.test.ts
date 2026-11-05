import test from "node:test";
import assert from "node:assert/strict";
import { classifyAlias, firstMention, matchAliases, MATCHER_RULE_VERSION, normalizeWithMap, shadowCompare } from "./brandMatcher";

const spans = (text: string, aliases: string[], opt = {}) => matchAliases(text, aliases, opt).spans.map((s) => text.slice(s.start, s.end));

test("별칭 문자 체계 분류", () => {
  assert.equal(classifyAlias("네오다임"), "hangul");
  assert.equal(classifyAlias("Neodigm"), "latin");
  assert.equal(classifyAlias("HubSpot2"), "latin");
  assert.equal(classifyAlias("日本語"), "cjk");
  assert.equal(classifyAlias("네오 Adobe"), "mixed");
});

test("라틴: 앞뒤가 영숫자면 일치하지 않는다(부분 문자열 오탐 방지)", () => {
  assert.deepEqual(spans("Use IBM tools", ["IBM"]), ["IBM"]);
  assert.deepEqual(spans("rubbish and ibmx and xibm", ["IBM"]), []);
  const r = matchAliases("xibm", ["IBM"]);
  assert.equal(r.excluded[0].reason, "latin-boundary");
});

test("라틴 뒤에 한글 조사가 붙어도 일치한다", () => {
  assert.deepEqual(spans("HubSpot은 CRM이다", ["HubSpot"]), ["HubSpot"]);
  assert.deepEqual(spans("네오다임의 사례", ["네오다임"]), ["네오다임"]);
});

test("대소문자·전각 문자 통일, 오프셋은 원문 기준", () => {
  const text = "소개:   ＨｕｂＳｐｏｔ 는 좋다";
  const r = matchAliases(text, ["hubspot"]);
  assert.equal(r.spans.length, 1);
  assert.equal(text.slice(r.spans[0].start, r.spans[0].end), "ＨｕｂＳｐｏｔ");
  const n = normalizeWithMap("a   b");
  assert.equal(n.text, "a b");
  assert.equal(n.map[2], 4);
});

test("인용 칩(이름 +N)은 본문 언급이 아니다 — 제외 사유가 남는다", () => {
  const r = matchAliases("전략으로 전환해야 합니다. Neodigm +1 여러 기업이", ["Neodigm"]);
  assert.equal(r.spans.length, 0);
  assert.equal(r.excluded[0].reason, "citation-chip");
  assert.deepEqual(spans("Leadinfo +2 현재 운영하시는", ["Leadinfo"]), []);
});

test("칩이 있어도 본문에 실제 언급이 있으면 언급이다", () => {
  const text = "Neodigm +1 ... 추천 업체는 Neodigm 입니다.";
  const r = matchAliases(text, ["Neodigm"]);
  assert.equal(r.spans.length, 1);
  assert.equal(r.excluded.length, 1);
  assert.equal(text.slice(r.spans[0].start - 0, r.spans[0].start + 7), "Neodigm");
  assert.ok(r.spans[0].start > 10);
});

test("칩 같지만 칩이 아닌 표현은 제외하지 않는다", () => {
  assert.deepEqual(spans("Neodigm +1점 상승", ["Neodigm"]), ["Neodigm"]);
  assert.deepEqual(spans("Neodigm + 파트너", ["Neodigm"]), ["Neodigm"]);
  assert.deepEqual(spans("Neodigm +10% 성장", ["Neodigm"]), ["Neodigm"]);
});

test("도메인 표기(associative.in, www.brand)는 본문 언급이 아니다", () => {
  assert.deepEqual(spans("연동 associative.in 에셋", ["Associative"]), []);
  assert.deepEqual(spans("https://neodigm 문서", ["Neodigm"]), []);
  assert.deepEqual(spans("www.neodigm 문서", ["Neodigm"]), []);
  assert.equal(matchAliases("associative.in", ["Associative"]).excluded[0].reason, "domain-like");
});

test("도메인 별칭 자체는 도메인으로 일치한다", () => {
  assert.deepEqual(spans("자세한 내용은 neodigm.com 참고", ["neodigm.com"]), ["neodigm.com"]);
  assert.deepEqual(spans("xneodigm.com", ["neodigm.com"]), []);
});

test("문장 끝 마침표 뒤는 도메인으로 보지 않는다", () => {
  assert.deepEqual(spans("추천은 Neodigm. 그리고", ["Neodigm"]), ["Neodigm"]);
  assert.deepEqual(spans("추천은 Neodigm.com 입니다", ["Neodigm"]), []);
});

test("겹치면 긴 별칭이 이기고 같은 위치는 한 번만", () => {
  const r = matchAliases("네오다임 코리아 소개", ["네오다임", "네오다임 코리아"]);
  assert.equal(r.spans.length, 1);
  assert.equal(r.spans[0].alias, "네오다임 코리아");
});

test("한글 복합어: 기본은 부분 일치 유지, particle 옵션이면 복합어 제외", () => {
  assert.deepEqual(spans("네오다임코리아 소개", ["네오다임"]), ["네오다임"]);
  assert.deepEqual(spans("네오다임코리아 소개", ["네오다임"], { hangulTrailing: "particle" }), []);
  assert.deepEqual(spans("네오다임은 좋다", ["네오다임"], { hangulTrailing: "particle" }), ["네오다임"]);
  assert.deepEqual(spans("네오다임에서 진행", ["네오다임"], { hangulTrailing: "particle" }), ["네오다임"]);
});

test("짧은 라틴 별칭 대소문자 옵션", () => {
  assert.deepEqual(spans("SAP 도입", ["SAP"], { shortLatinExactCase: { maxLen: 4 } }), ["SAP"]);
  assert.deepEqual(spans("sap flow", ["SAP"], { shortLatinExactCase: { maxLen: 4 } }), []);
  assert.deepEqual(spans("sap flow", ["SAP"]), ["sap"]);
});

test("근거: 스니펫·규칙 id·규칙 버전", () => {
  const r = matchAliases("추천 업체는 HubSpot 입니다.", ["HubSpot"]);
  assert.equal(r.ruleVersion, MATCHER_RULE_VERSION);
  assert.equal(r.spans[0].rule, "latin-boundary");
  assert.match(r.spans[0].snippet, /HubSpot/);
});

test("빈 입력·빈 별칭", () => {
  assert.deepEqual(matchAliases("", ["A"]).spans, []);
  assert.deepEqual(matchAliases("본문", ["", "  "]).spans, []);
  assert.equal(firstMention("본문", []), null);
});

test("그림자 비교: 새 규칙에서 사라진 일치 목록", () => {
  const items = [
    { id: "a", text: "Neodigm +1 소개", aliases: ["Neodigm"] },
    { id: "b", text: "추천은 Neodigm 입니다", aliases: ["Neodigm"] },
    { id: "c", text: "xibm", aliases: ["IBM"] },
  ];
  const d = shadowCompare(items, { excludeNonProse: false }, {});
  assert.equal(d.lost.length, 1);
  assert.match(d.lost[0], /^a@/);
  assert.equal(d.gained.length, 0);
  assert.equal(d.unchanged, 1);
});
