import assert from "node:assert/strict";
import test from "node:test";
import { analyzeRunPlacement, summarizePlacements } from "./placement";
import type { BrandSeed } from "@/lib/db/types";

const brand = (id: string, name: string, own = false): BrandSeed => ({
  id,
  organizationId: "o",
  name,
  domain: "",
  isOwnBrand: own,
  status: "active",
  category: "",
  aliases: [],
});
const brands = [brand("own", "네오다임", true), brand("a", "알파"), brand("b", "베타")];

test("경쟁사보다 먼저 나오면 rank 1, 뒤에 나오면 뒤 순서", () => {
  const first = analyzeRunPlacement("네오다임을 추천합니다. 알파도 있습니다.", brands, "own", []);
  assert.equal(first.rank, 1);
  assert.equal(first.competitorsPresent, 1);
  const later = analyzeRunPlacement("알파와 베타가 있고 네오다임도 있습니다.", brands, "own", []);
  assert.equal(later.rank, 3);
  assert.ok(later.offsetRatio! > first.offsetRatio!);
});

test("언급이 없으면 mentioned=false, 인용 순서는 첫 자사 도메인 기준", () => {
  const none = analyzeRunPlacement("알파만 나옵니다", brands, "own", [{ isOwnDomain: false }, { isOwnDomain: true }]);
  assert.equal(none.mentioned, false);
  assert.equal(none.rank, null);
  assert.equal(none.firstOwnCitationPosition, 2);
});

test("요약은 경쟁사와 함께 나온 답변만 순서 비교에 쓴다", () => {
  const placements = [
    analyzeRunPlacement("네오다임 단독", brands, "own", []), // 비교 대상 없음
    analyzeRunPlacement("네오다임 그리고 알파", brands, "own", [{ isOwnDomain: true }]),
    analyzeRunPlacement("알파 그리고 네오다임", brands, "own", [{ isOwnDomain: false }, { isOwnDomain: false }, { isOwnDomain: false }, { isOwnDomain: true }]),
    analyzeRunPlacement("아무도 없음", brands, "own", []),
  ];
  const s = summarizePlacements("전체", placements);
  assert.equal(s.answers, 4);
  assert.equal(s.mentioned, 3);
  assert.equal(s.contested, 2);
  assert.equal(s.firstShare, 50);
  assert.equal(s.avgRank, 1.5);
  assert.equal(s.cited, 2);
  assert.equal(s.avgCitationPosition, 2.5);
  assert.equal(s.top3CitationShare, 50);
});
