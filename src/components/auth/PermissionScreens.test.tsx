import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PermissionsProvider } from "./PermissionsProvider";
import { PromptLibraryClient } from "../prompt-library/PromptLibraryClient";
import { OrganizationsClient } from "../organizations/OrganizationsClient";
import { BrandsManagementClient } from "../brands-management/BrandsManagementClient";
import { GscConnectionCard } from "../brands-management/GscConnectionCard";

const router = { bfcacheId: "test", back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {} };
function render(children: ReactNode, canEdit = false, canManageOrg = false) {
  return renderToStaticMarkup(
    <AppRouterContext.Provider value={router}>
      <PermissionsProvider canEdit={canEdit} canManageOrg={canManageOrg}>{children}</PermissionsProvider>
    </AppRouterContext.Provider>,
  );
}
const library = <PromptLibraryClient initialRows={[{ id: "p1", prompt: "테스트 질문", category: "테스트", topic: "주제", origin: "manual", surfaces: [], lastModifiedAt: null, lastModifiedBy: null }]} health={null} topicOptionsByCategory={{}} uncategorizedTopicOptions={[]} collectionAgent={null} aioDeviceCount={1} brandId="brand" />;

test("viewer can browse and export prompts without edit or selection controls", () => {
  const html = render(library);
  for (const text of ["테스트 질문", "프롬프트 검색", "CSV 내보내기", "컬럼 설정"]) assert.ok(html.includes(text), text);
  for (const text of ["프롬프트 추가", "CSV 가져오기", "라이브러리 최적화", 'aria-label="편집"', 'aria-label="삭제"', 'type="checkbox"', "모두 선택"]) assert.ok(!html.includes(text), text);
});

test("editor retains prompt editing and collection selection controls", () => {
  const html = render(library, true);
  for (const text of ["프롬프트 추가", "CSV 가져오기", "라이브러리 최적화", 'aria-label="편집"', 'aria-label="삭제"', 'type="checkbox"', "모두 선택"]) assert.ok(html.includes(text), text);
});

const orgs = [{ id: "a", name: "조직 A", slug: "a", brandCount: 0 }, { id: "b", name: "조직 B", slug: "b", brandCount: 0 }];
test("organization owner only sees rename for owned organizations; creation and deletion require staff", () => {
  const owner = render(<OrganizationsClient initial={orgs} currentOrgId="a" canCreateDelete={false} manageableOrgIds={["a"]} />, true, true);
  assert.ok(owner.includes('aria-label="조직 A 이름 변경"'));
  for (const text of ['aria-label="조직 B 이름 변경"', 'aria-label="조직 A 삭제"', "조직 추가"]) assert.ok(!owner.includes(text), text);
  assert.ok(owner.includes("이 조직으로 전환"));
  const staff = render(<OrganizationsClient initial={orgs} currentOrgId="a" canCreateDelete manageableOrgIds={["a", "b"]} />, true, true);
  for (const text of ['aria-label="조직 B 이름 변경"', 'aria-label="조직 A 삭제"', "조직 추가"]) assert.ok(staff.includes(text), text);
});

test("brand creation is reserved for organization managers, while editors can create categories", () => {
  const screen = <BrandsManagementClient initial={{ brands: [], categories: [] }} />;
  const viewer = render(screen);
  assert.ok(!viewer.includes("카테고리 생성"));
  const editor = render(screen, true);
  assert.ok(editor.includes("카테고리 생성"));
  assert.ok(!editor.includes("브랜드 추가"));
  assert.ok(render(screen, true, true).includes("브랜드 추가"));
});

test("viewer sees GSC connection status without OAuth write entry point", () => {
  const screen = <GscConnectionCard gsc={null} brandId="brand" />;
  assert.ok(render(screen).includes("아직 연결되지 않았습니다"));
  assert.ok(!render(screen).includes("/oauth/start"));
  assert.ok(render(screen, true).includes("/oauth/start"));
});

test("프롬프트 리서치: viewer는 새 리서치를 실행할 수 없고, 편집 권한이 있으면 폼이 보인다", async () => {
  const { LivePromptResearch } = await import("../prompt-research/LivePromptResearch");
  const viewer = render(<LivePromptResearch />);
  assert.ok(viewer.includes("읽기 전용 권한에서는 새 프롬프트 리서치를 실행할 수 없어요"));
  for (const text of ["리서치하는 중", 'id="topic-input"', ">검색<"]) assert.ok(!viewer.includes(text), text);
  const editor = render(<LivePromptResearch />, true, false);
  assert.ok(editor.includes('id="topic-input"') && !editor.includes("읽기 전용 권한에서는"));
});
