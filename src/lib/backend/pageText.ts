// 콘텐츠 수정 가이드의 근거가 되는 "페이지 본문 발췌" — 서버가 URL을 대신 열어 텍스트만 뽑는다.
// 서버가 임의 주소를 열어 주는 통로가 되면 안 되므로(SSRF) 조직의 브랜드에 등록된 도메인
// (브랜드 URL·등록 URL의 호스트와 그 하위 도메인)만, http/https로, 리다이렉트도 매번 같은 검사를 거쳐 가져온다.

const MAX_BYTES = 1_500_000;
const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 10_000;
export const MAX_EXCERPT_CHARS = 8_000;

export function hostOf(url: string): string | null {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** 등록된 도메인 자신이거나 그 하위 도메인이면 허용. IP 주소·localhost는 항상 거부한다. */
export function isAllowedHost(host: string, allowedHosts: Iterable<string>): boolean {
  if (host === "localhost" || /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":") || !host.includes(".")) return false;
  for (const allowed of allowedHosts) {
    const base = allowed.replace(/^www\./, "");
    if (host === allowed || host === base || host.endsWith(`.${base}`)) return true;
  }
  return false;
}

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };

/** HTML → 제목·설명·헤딩 구조·본문 텍스트 발췌. 스크립트/스타일/내비게이션은 뺀다. */
export function extractPageText(html: string, maxChars = MAX_EXCERPT_CHARS): string {
  const decode = (text: string) => text.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m] ?? m);
  const strip = (text: string) => decode(text.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
  const title = strip(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const description = decode(html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i)?.[1] ?? "").trim();
  const headings = [...html.matchAll(/<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi)]
    .map((m) => `${"#".repeat(Number(m[1]))} ${strip(m[2])}`)
    .filter((line) => line.length > 2);
  const body = strip(
    html
      .replace(/<(script|style|noscript|svg|nav|footer|header|form|iframe)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<\/(p|div|li|h[1-6]|br|tr|section|article)>/gi, "$&\n")
  );
  const parts = [
    title && `제목: ${title}`,
    description && `메타 설명: ${description}`,
    headings.length > 0 && `헤딩 구조:\n${headings.slice(0, 40).join("\n")}`,
    body && `본문:\n${body}`,
  ].filter(Boolean) as string[];
  const text = parts.join("\n\n");
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n…(이하 생략)` : text;
}

export class PageFetchError extends Error {}

export async function fetchPageText(url: string, allowedHosts: Iterable<string>): Promise<string> {
  const allowed = [...allowedHosts];
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const host = hostOf(current);
    if (!host || !/^https?:\/\//i.test(current) || !isAllowedHost(host, allowed)) {
      throw new PageFetchError("등록된 브랜드 도메인의 페이지만 가져올 수 있습니다.");
    }
    const res = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "User-Agent": "NeodioContentGuide/1.0", Accept: "text/html,application/xhtml+xml" },
    }).catch(() => {
      throw new PageFetchError("페이지를 가져오지 못했습니다.");
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      current = new URL(res.headers.get("location")!, current).toString();
      continue;
    }
    if (!res.ok) throw new PageFetchError(`페이지를 가져오지 못했습니다 (HTTP ${res.status}).`);
    if (!/html|xml/i.test(res.headers.get("content-type") ?? "")) throw new PageFetchError("HTML 페이지가 아닙니다.");
    const reader = res.body?.getReader();
    if (!reader) throw new PageFetchError("페이지를 가져오지 못했습니다.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.byteLength;
    }
    await reader.cancel().catch(() => undefined);
    return extractPageText(new TextDecoder("utf-8").decode(Buffer.concat(chunks)));
  }
  throw new PageFetchError("리다이렉트가 너무 많습니다.");
}
