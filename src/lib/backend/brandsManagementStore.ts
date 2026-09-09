import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { brandsManagementByOrg } from "@/lib/db/data/brandsManagement";
import { ManagedBrand } from "@/lib/db/types";

// 브랜드 관리 화면의 브랜드 추가/편집/삭제는 이전엔 클라이언트 로컬
// state로만 처리돼서 새로고침하면 사라졌다 — mock 시드(brandsManagement.ts)는
// 코드에 박혀 있어 직접 지울 수 없으니, deletedLibraryRows.ts와 같은 방식으로
// "추가된 브랜드"/"브랜드별 patch"/"삭제된 브랜드 id" 3개 파일만 실 파일로
// 남기고, 읽을 때 시드 위에 얹어서 최종 상태를 계산한다.
const ADDED_FILE = ".tmp/brands-management-added.json";
const PATCHES_FILE = ".tmp/brands-management-patches.json";
const DELETED_FILE = ".tmp/brands-management-deleted.json";

async function readJson<T>(file: string, fallback: T): Promise<T> {
  const filePath = path.join(process.cwd(), file);
  const raw = await readFile(filePath, "utf8").catch(() => null);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  const filePath = path.join(process.cwd(), file);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readAdded(): Promise<ManagedBrand[]> {
  return readJson<ManagedBrand[]>(ADDED_FILE, []);
}

async function readPatches(): Promise<Record<string, Partial<ManagedBrand>>> {
  return readJson<Record<string, Partial<ManagedBrand>>>(PATCHES_FILE, {});
}

async function readDeleted(): Promise<Set<string>> {
  return new Set(await readJson<string[]>(DELETED_FILE, []));
}

export async function getManagedBrands(orgId: string): Promise<ManagedBrand[]> {
  const seedBrands = brandsManagementByOrg[orgId]?.brands ?? [];
  const [added, patches, deleted] = await Promise.all([readAdded(), readPatches(), readDeleted()]);
  return [...seedBrands, ...added]
    .filter((b) => !deleted.has(b.id))
    .map((b) => ({ ...b, ...(patches[b.id] ?? {}) }));
}

export async function getManagedBrand(orgId: string, brandId: string): Promise<ManagedBrand | null> {
  const brands = await getManagedBrands(orgId);
  return brands.find((b) => b.id === brandId) ?? null;
}

export async function createManagedBrand(brand: Omit<ManagedBrand, "id">): Promise<ManagedBrand> {
  const added = await readAdded();
  const newBrand: ManagedBrand = { id: `brand-${Date.now()}`, ...brand };
  added.push(newBrand);
  await writeJson(ADDED_FILE, added);
  return newBrand;
}

export async function updateManagedBrand(brandId: string, patch: Partial<ManagedBrand>): Promise<void> {
  const patches = await readPatches();
  patches[brandId] = { ...patches[brandId], ...patch };
  await writeJson(PATCHES_FILE, patches);
}

export async function deleteManagedBrand(brandId: string): Promise<void> {
  const deleted = await readDeleted();
  deleted.add(brandId);
  await writeJson(DELETED_FILE, [...deleted]);
}
