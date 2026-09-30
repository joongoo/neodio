import { getPromptStore } from "./database";
import { getManagedBrandById } from "./brandsManagementStore";

// 브랜드별 GSC refresh_token 저장소. 예전엔 .tmp/gsc-tokens/*.json 파일로
// 뒀는데(수집 로그와 같은 패턴), Vercel의 읽기 전용 파일시스템에서
// mkdir ENOENT로 깨졌다 — DB 이관 때 이 파일은 놓쳤던 것. bridge_entries
// 테이블(조직/스코프/키 기반 범용 저장소)을 그대로 재사용한다.
// refresh_token은 절대 클라이언트로 내려보내지 않는다 — 이 파일은 서버
// 전용 코드에서만 import.
const SCOPE = "gsc-tokens";

export interface GscTokenRecord {
  organizationId: string;
  brandId: string;
  refreshToken: string;
  accountEmail: string;
  property: string;
  connectedAt: string;
}

export async function saveGscToken(record: GscTokenRecord): Promise<void> {
  const store = await getPromptStore();
  await store.putBridge(record.organizationId, SCOPE, { [record.brandId]: record });
}

export async function getGscToken(brandId: string): Promise<GscTokenRecord | null> {
  const brand = await getManagedBrandById(brandId);
  if (!brand) return null;
  const store = await getPromptStore();
  const entries = await store.bridgeScope<GscTokenRecord>(brand.organizationId, SCOPE);
  const record = entries[brandId] ?? null;
  // 기존 레코드에 organizationId가 없어도 읽을 수 있게 한다.
  return record ? { ...record, organizationId: record.organizationId ?? brand.organizationId } : null;
}

export async function deleteGscToken(brandId: string): Promise<void> {
  const brand = await getManagedBrandById(brandId);
  if (!brand) return;
  const store = await getPromptStore();
  await store.query("DELETE FROM bridge_entries WHERE organization_id=$1 AND scope=$2 AND entry_key=$3", [brand.organizationId, SCOPE, brandId]);
}
