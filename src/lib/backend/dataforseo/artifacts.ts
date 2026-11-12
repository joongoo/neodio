import { createHash } from "node:crypto";
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

/** 네트워크를 사용하지 않는 단위 테스트·로컬 replay용 저장소. */
export class MemoryArtifactStore implements ArtifactStore {
  readonly bodies = new Map<string, string>();

  async save(task: ProviderTaskRecord, kind: ProviderArtifactKind, body: string, contentType: string): Promise<ProviderArtifactRecord> {
    const objectKey = `memory://${task.id}/${kind}`;
    this.bodies.set(objectKey, body);
    return artifactRecord(task, kind, body, contentType, objectKey);
  }
}
