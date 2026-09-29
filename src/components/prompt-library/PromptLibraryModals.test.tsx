import assert from "node:assert/strict";
import { test } from "node:test";
import { parseImportFile } from "./PromptLibraryModals";

test("imports BOM-prefixed production exports and retains rows without a category", () => {
  const csv = [
    "\uFEFFprompt,category,topic,origin,lastModifiedAt,lastModifiedBy",
    '"B2B 마케팅에서 영업과 마케팅 데이터를 연결해 관리할 수 있는 솔루션을 추천해주세요.",마케팅 자동화,B2B 마케팅 자동화 도입,ai_generated,2026-09-29T01:18:57.396Z,',
    '"국내 B2B 마케팅 자동화 업체를 추천해주세요.",,Adobe Marketo 파트너 추천,ai_generated,2026-09-22T08:39:27.480Z,나',
  ].join("\n");

  assert.deepEqual(parseImportFile(csv), {
    rows: [
      {
        prompt: "B2B 마케팅에서 영업과 마케팅 데이터를 연결해 관리할 수 있는 솔루션을 추천해주세요.",
        category: "마케팅 자동화",
        topic: "B2B 마케팅 자동화 도입",
      },
      {
        prompt: "국내 B2B 마케팅 자동화 업체를 추천해주세요.",
        category: "",
        topic: "Adobe Marketo 파트너 추천",
      },
    ],
    error: null,
  });
});

test("imports a prompt-only CSV when optional classification columns are absent", () => {
  assert.deepEqual(parseImportFile("prompt\n\"질문 하나\""), {
    rows: [{ prompt: "질문 하나", category: "", topic: "" }],
    error: null,
  });
});