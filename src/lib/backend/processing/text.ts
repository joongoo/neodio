import { BrandSeed, Sentiment } from "@/lib/db/types";

const positiveTerms = [
  "추천",
  "강점",
  "지원",
  "제공",
  "최적화",
  "전문",
  "통합",
  "자동화",
  "personalized",
  "recommended",
  "supports",
  "strong",
];

const negativeTerms = ["부족", "누락", "문제", "제외", "어렵", "제한", "위험", "blocked", "missing", "weak"];

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeText(value: string) {
  return value.toLocaleLowerCase("ko-KR").replace(/\s+/g, " ").trim();
}

export function brandPatterns(brand: BrandSeed) {
  return [brand.name, brand.domain, ...brand.aliases].filter(Boolean);
}

export function findBrandMentions(text: string, brands: BrandSeed[]) {
  const normalized = normalizeText(text);

  return brands
    .map((brand) => {
      const firstIndex = brandPatterns(brand).reduce<number | null>((best, pattern) => {
        const escaped = escapeRegex(pattern.toLocaleLowerCase("ko-KR"));
        const regex = new RegExp(`${escaped}(?:은|는|이|가|을|를|의|과|와|로|으로)?`, "i");
        const match = normalized.match(regex);
        if (!match || match.index === undefined) return best;
        return best === null ? match.index : Math.min(best, match.index);
      }, null);

      return {
        brand,
        index: firstIndex,
      };
    })
    .sort((a, b) => {
      if (a.index === null && b.index === null) return 0;
      if (a.index === null) return 1;
      if (b.index === null) return -1;
      return a.index - b.index;
    });
}

/** 감성 판정의 근거 — 브랜드 주변 구간(앞 180자·뒤 360자)에서 찾은 긍정/부정 키워드. */
export function sentimentEvidence(text: string, brand: BrandSeed) {
  const normalized = normalizeText(text);
  const brandIndex = findBrandMentions(text, [brand])[0]?.index;
  const start = brandIndex === null || brandIndex === undefined ? 0 : Math.max(0, brandIndex - 180);
  const end = brandIndex === null || brandIndex === undefined ? normalized.length : brandIndex + 360;
  const windowText = normalized.slice(start, end);
  return {
    windowText,
    positiveTerms: positiveTerms.filter((term) => windowText.includes(term)),
    negativeTerms: negativeTerms.filter((term) => windowText.includes(term)),
  };
}

export function classifySentiment(text: string, brand: BrandSeed): { sentiment: Sentiment; score: number } {
  const { positiveTerms: positiveHits, negativeTerms: negativeHits } = sentimentEvidence(text, brand);

  if (negativeHits.length > positiveHits.length) return { sentiment: "negative", score: 0.25 };
  if (positiveHits.length > negativeHits.length) return { sentiment: "positive", score: 0.78 };
  return { sentiment: "neutral", score: 0.55 };
}
