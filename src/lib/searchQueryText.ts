// 프롬프트 라이브러리에 들어가는 문구를 "실제 사용자가 검색창에 입력할 텍스트"로 다듬는다 — 순수 함수.
// 설명용 괄호와 문장 끝 마침표는 사람이 검색할 때 쓰지 않으므로 뺀다. Next.js·kakao.com·v2.0처럼
// 글자·숫자 사이에 낀 점은 이름의 일부라 남긴다.

const PAREN_PAIRS = /[(（][^()（）]*[)）]/g;

export function toSearchQueryText(text: string): string {
  let out = text;
  // 괄호 안 설명까지 함께 뺀다(바깥 괄호가 남지 않도록 안쪽부터 반복).
  for (let guard = 0; guard < 5 && PAREN_PAIRS.test(out); guard++) out = out.replace(PAREN_PAIRS, " ");
  out = out.replace(/[()（）]/g, " "); // 짝이 안 맞아 남은 괄호
  out = out.replace(/。/g, " ");
  out = out.replace(/(?<![A-Za-z0-9가-힣])\.+|\.+(?![A-Za-z0-9가-힣])/g, " "); // 글자·숫자 사이가 아닌 점(문장 끝·말줄임)
  out = out.replace(/\s+/g, " ").trim();
  return out || text.trim();
}

/** 정리하면 달라지는 문구인가 — 라이브러리의 기존 항목을 훑어 정리 후보를 찾는 데 쓴다. */
export const needsSearchQueryCleanup = (text: string) => toSearchQueryText(text) !== text.trim();
