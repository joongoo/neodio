import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { PromptLibraryRow } from "@/lib/db/types";

// "토픽 추적하기"(가시성 개요) 클릭은 이전엔 클라이언트 로컬 state만 바꾸고
// 아무 데도 저장되지 않았다 — 새로고침하면 사라지고, 프롬프트 라이브러리에도
// 안 나타났다. 수집 로그와 같은 패턴(.tmp에 실 파일로 저장, 서버 컴포넌트가
// 읽어서 mock과 합침)으로 실제로 프롬프트 라이브러리에 반영되게 한다.
const TRACKED_DIR = ".tmp/tracked-topics";

// `topicName`이 있으면 토픽 행 전체 추적(그 토픽의 프롬프트마다 한 번씩 호출)
// — 서브카테고리에 "토픽: X" 형태로 어느 토픽에서 왔는지 남긴다.
// `subcategoryOverride`가 있으면 그 값을 그대로 쓴다 — 호출부가 이미
// "인용 테스트: Databricks CIO Forum 사례"처럼 완성된 라벨을 만들어 보낼 때,
// 여기서 "토픽: "을 또 덧씌워 이중 접두어가 되는 걸 막기 위함. 둘 다 없으면
// 개별 프롬프트만 추적한 경우로 간주해 출처만 남긴다. `source`는 "추적"
// 버튼을 누른 화면 — 가시성 개요/프롬프트 전략처럼 호출부가 다르면
// 서브카테고리에 정확한 출처가 남아야 하므로 하드코딩하지 않고 호출부에서
// 넘겨받는다.
//
// 여기로 들어오는 프롬프트는 전부 GSC 실측 검색어, LLM 브레인스토밍,
// 가시성 개요의 실측 토픽처럼 데이터/AI 파이프라인에서 나온 것이지 사용자가
// 프롬프트 라이브러리 화면에서 직접 타이핑한 게 아니다 — 그래서 origin은
// 항상 "ai_generated". 진짜 수동 입력은 AddPromptModal 경로에서만 발생한다.
// 프롬프트 라이브러리에 새 행을 실제로 저장한다 — "추적"뿐 아니라 수동
// 추가/CSV 가져오기도 전부 이 함수를 거친다. 이전엔 수동 추가·CSV 가져오기가
// 클라이언트 로컬 state에만 남아서 새로고침하면 통째로 사라졌다(추적된
// 프롬프트만 .tmp에 남아 있었음) — 지금은 셋 다 같은 방식으로 실 파일에
// 저장돼 새로고침해도 유지된다.
export async function saveLibraryRow(row: Omit<PromptLibraryRow, "id">): Promise<PromptLibraryRow> {
  await mkdir(path.join(process.cwd(), TRACKED_DIR), { recursive: true });
  const fullRow: PromptLibraryRow = {
    id: `tracked-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ...row,
  };
  const filePath = path.join(process.cwd(), TRACKED_DIR, `${fullRow.id}.json`);
  await writeFile(filePath, `${JSON.stringify(fullRow, null, 2)}\n`, "utf8");
  return fullRow;
}

// `topicName`이 있으면 토픽 행 전체 추적(그 토픽의 프롬프트마다 한 번씩 호출)
// — 서브카테고리에 "토픽: X" 형태로 어느 토픽에서 왔는지 남긴다.
// `subcategoryOverride`가 있으면 그 값을 그대로 쓴다 — 호출부가 이미
// "인용 테스트: Databricks CIO Forum 사례"처럼 완성된 라벨을 만들어 보낼 때,
// 여기서 "토픽: "을 또 덧씌워 이중 접두어가 되는 걸 막기 위함. 둘 다 없으면
// 개별 프롬프트만 추적한 경우로 간주해 출처만 남긴다. `source`는 "추적"
// 버튼을 누른 화면 — 가시성 개요/프롬프트 전략처럼 호출부가 다르면
// 서브카테고리에 정확한 출처가 남아야 하므로 하드코딩하지 않고 호출부에서
// 넘겨받는다.
//
// 여기로 들어오는 프롬프트는 전부 GSC 실측 검색어, LLM 브레인스토밍,
// 가시성 개요의 실측 토픽처럼 데이터/AI 파이프라인에서 나온 것이지 사용자가
// 프롬프트 라이브러리 화면에서 직접 타이핑한 게 아니다 — 그래서 origin은
// 항상 "ai_generated". 진짜 수동 입력은 AddPromptModal 경로에서만 발생한다.
export async function trackTopic(
  promptText: string,
  category: string,
  options: { topicName?: string; subcategoryOverride?: string; source: string } = { source: "추적" }
): Promise<PromptLibraryRow> {
  const subcategory =
    options.subcategoryOverride ?? (options.topicName ? `토픽: ${options.topicName}` : `${options.source}에서 추적`);
  return saveLibraryRow({
    prompt: promptText,
    origin: "ai_generated",
    category,
    subcategory,
    lastModifiedAt: new Date().toISOString().slice(0, 10),
    lastModifiedBy: "나",
  });
}

export async function listTrackedTopics(): Promise<PromptLibraryRow[]> {
  const dir = path.join(process.cwd(), TRACKED_DIR);
  const filenames = await readdir(dir).catch(() => []);
  const rows = await Promise.all(
    filenames
      .filter((f) => f.endsWith(".json"))
      .map(async (filename) => {
        try {
          return JSON.parse(await readFile(path.join(dir, filename), "utf8")) as PromptLibraryRow;
        } catch {
          return null;
        }
      })
  );
  // readdir 순서는 파일시스템 순서라 추적 순서와 무관하다 — 방금 "전체 추적"한
  // 항목이 목록 뒤쪽(2~3페이지)에 묻혀서 "추가가 안 됐다"고 오해하기 쉬웠다.
  // id가 `tracked-<13자리 timestamp>-<rand>` 형식이라 문자열 내림차순 정렬이
  // 곧 최신순 정렬이다 — 최근 추적한 항목이 항상 맨 위(1페이지)에 오도록.
  return rows.filter((r): r is PromptLibraryRow => r !== null).sort((a, b) => (a.id < b.id ? 1 : -1));
}

// 프롬프트 편집도 실제로 파일에 반영한다 — id가 tracked-*가 아니면(mock 시드
// 행) 저장할 파일이 없으니 조용히 무시한다.
export async function updateLibraryRow(
  id: string,
  patch: Pick<PromptLibraryRow, "prompt" | "category" | "subcategory">
): Promise<PromptLibraryRow | null> {
  const filePath = path.join(process.cwd(), TRACKED_DIR, `${id}.json`);
  const existing = await readFile(filePath, "utf8").catch(() => null);
  if (!existing) return null;
  const row: PromptLibraryRow = {
    ...(JSON.parse(existing) as PromptLibraryRow),
    ...patch,
    lastModifiedAt: new Date().toISOString().slice(0, 10),
    lastModifiedBy: "나",
  };
  await writeFile(filePath, `${JSON.stringify(row, null, 2)}\n`, "utf8");
  return row;
}

// 프롬프트 라이브러리에서 추적된 프롬프트를 삭제하면 실제로 .tmp 파일도
// 지운다 — 이전엔 클라이언트 로컬 state만 지워져서 새로고침하면 다시
// 나타났고, 프롬프트 전략 쪽에서 "이미 추가됨"으로 계속 숨겨진 채 남아있게
// 되는 불일치도 생겼다.
export async function deleteTrackedTopic(id: string): Promise<void> {
  const filePath = path.join(process.cwd(), TRACKED_DIR, `${id}.json`);
  await unlink(filePath).catch(() => {});
}
