import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// "토픽 기회"용으로 만든 콘텐츠 페이지 URL을 토픽 텍스트에 매핑해서 저장한다
// — 실행마다 다시 계산되는 real-topic-rows(getRealTopicRows)는 안정적인
// id가 없어서(토픽 텍스트 자체가 곧 id) 텍스트를 키로 쓴다.
const FILE_PATH = ".tmp/topic-opportunity-targets.json";

async function readAll(): Promise<Record<string, string>> {
  const filePath = path.join(process.cwd(), FILE_PATH);
  const raw = await readFile(filePath, "utf8").catch(() => null);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

// 실 DB로 옮길 때 조직별로 행을 나눠야 하므로, 지금은 조직이 하나뿐이라도
// 키에 orgId를 미리 섞어 넣는다.
function scopedKey(orgId: string, topic: string): string {
  return `${orgId}::${topic}`;
}

export async function getTopicOpportunityTargets(orgId: string): Promise<Record<string, string>> {
  const all = await readAll();
  const prefix = `${orgId}::`;
  const byTopic: Record<string, string> = {};
  for (const [key, url] of Object.entries(all)) {
    if (key.startsWith(prefix)) byTopic[key.slice(prefix.length)] = url;
  }
  return byTopic;
}

export async function setTopicOpportunityTarget(orgId: string, topic: string, targetUrl: string): Promise<void> {
  const filePath = path.join(process.cwd(), FILE_PATH);
  await mkdir(path.dirname(filePath), { recursive: true });
  const all = await readAll();
  const key = scopedKey(orgId, topic);
  if (targetUrl.trim()) all[key] = targetUrl.trim();
  else delete all[key];
  await writeFile(filePath, `${JSON.stringify(all, null, 2)}\n`, "utf8");
}
