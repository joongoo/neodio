import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { put } from "@vercel/blob";
import type { ProviderArtifactKind, ProviderArtifactRecord, ProviderTaskRecord } from "./types";

export interface ArtifactStore {
  save(task: ProviderTaskRecord, kind: ProviderArtifactKind, body: string, contentType: string): Promise<ProviderArtifactRecord>;
}

function artifactRecord(task: ProviderTaskRecord, kind: ProviderArtifactKind, body: string, contentType: string, objectKey: string): ProviderArtifactRecord {
  const checksumSha256 = createHash("sha256").update(body, "utf8").digest("hex");
  return {
    id: `artifact-${createHash("sha256").update(`${task.id}:${kind}`).digest("hex").slice(0, 24)}`,
    providerTaskId: task.id,
    kind,
    objectKey,
    contentType,
    encoding: "utf-8",
    byteSize: Buffer.byteLength(body, "utf8"),
    checksumSha256,
    createdAt: new Date().toISOString(),
    expiresAt: null,
  };
}

export class VercelBlobArtifactStore implements ArtifactStore {
  async save(task: ProviderTaskRecord, kind: ProviderArtifactKind, body: string, contentType: string): Promise<ProviderArtifactRecord> {
    if (!process.env.BLOB_READ_WRITE_TOKEN && !(process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN)) {
      throw new Error("DataForSEO 원본 저장을 위한 Vercel Blob 인증이 없습니다.");
    }
    const extension = kind === "html" ? "html" : "json";
    const objectKey = `dataforseo/${encodeURIComponent(task.organizationId)}/${task.id}/${kind}.${extension}`;
    await put(objectKey, body, { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType });
    return artifactRecord(task, kind, body, contentType, objectKey);
  }
}

/** 로컬·self-hosted 환경에서 원본을 영속 파일로 보관한다. `.data`는 git에서 제외된다. */
export class LocalArtifactStore implements ArtifactStore {
  constructor(private readonly root = process.env.DATAFORSEO_ARTIFACT_DIR || path.join(process.cwd(), ".data", "dataforseo")) {}

  async save(task: ProviderTaskRecord, kind: ProviderArtifactKind, body: string, contentType: string): Promise<ProviderArtifactRecord> {
    const extension = kind === "html" ? "html" : "json";
    const organization = encodeURIComponent(task.organizationId);
    const relativePath = path.join(/* turbopackIgnore: true */ organization, task.id, `${kind}.${extension}`);
    const absolutePath = path.resolve(this.root, relativePath);
    const resolvedRoot = path.resolve(this.root);
    if (absolutePath !== resolvedRoot && !absolutePath.startsWith(`${resolvedRoot}${path.sep}`)) {
      throw new Error("DataForSEO artifact 경로가 저장소 밖을 가리킵니다.");
    }
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, body, "utf8");
    const objectKey = `local:${relativePath.split(path.sep).join("/")}`;
    return artifactRecord(task, kind, body, contentType, objectKey);
  }
}

/** 네트워크를 사용하지 않는 단위 테스트·로컬 replay용 저장소. */
export class MemoryArtifactStore implements ArtifactStore {
  readonly bodies = new Map<string, string>();

  async save(task: ProviderTaskRecord, kind: ProviderArtifactKind, body: string, contentType: string): Promise<ProviderArtifactRecord> {
    const objectKey = `memory://${task.id}/${kind}`;
    this.bodies.set(objectKey, body);
    return artifactRecord(task, kind, body, contentType, objectKey);
  }
}
