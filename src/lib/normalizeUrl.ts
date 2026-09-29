// 사용자가 스킴 없이 입력한 주소("example.com/path")에 https://를 붙인다. 빈 값·이미 http(s)인 값은 그대로 둔다.
export function normalizeUrl(input: string): string {
  const value = input.trim();
  if (!value) return "";
  return /^https?:\/\//i.test(value) ? value : `https://${value.replace(/^\/+/, "")}`;
}

// 저장된 주소에서 호스트명을 안전하게 꺼낸다. 스킴이 없거나 잘못된 값이면 undefined.
export function hostnameOfUrl(input: string): string | undefined {
  try {
    return new URL(normalizeUrl(input)).hostname || undefined;
  } catch {
    return undefined;
  }
}
