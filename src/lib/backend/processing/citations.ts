import { BrandSeed, CitationSeed, PromptRunSeed, RawCitationMetadata } from "@/lib/db/types";

function hostnameFor(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function normalizeHostname(hostname: string) {
  return hostname.toLocaleLowerCase("en-US").replace(/^www\./, "");
}

function inferBrandId(domain: string, brands: BrandSeed[]) {
  const normalized = normalizeHostname(domain);
  return (
    brands.find((brand) => {
      const brandDomain = normalizeHostname(brand.domain);
      return normalized === brandDomain || normalized.endsWith(`.${brandDomain}`);
    })?.id ?? null
  );
}

function metadataCitations(run: PromptRunSeed) {
  return run.rawMetadata.citations ?? [];
}

function urlCitationsFromText(text: string): RawCitationMetadata[] {
  const matches = text.match(/https?:\/\/[^\s)]+/g) ?? [];
  return matches.map((url) => ({
    title: hostnameFor(url),
    url,
    domain: hostnameFor(url),
    isOwnDomain: normalizeHostname(hostnameFor(url)).endsWith("neodigm.com"),
  }));
}

export function extractCitationsFromRun(run: PromptRunSeed, brands: BrandSeed[]): CitationSeed[] {
  const seen = new Set<string>();
  const rawCitations = [...metadataCitations(run), ...urlCitationsFromText(run.rawResponse)];

  return rawCitations
    .filter((citation) => citation.url && citation.domain)
    .filter((citation) => {
      if (seen.has(citation.url)) return false;
      seen.add(citation.url);
      return true;
    })
    .map((citation, index) => ({
      id: `citation-${run.id}-${index + 1}`,
      promptRunId: run.id,
      brandId: inferBrandId(citation.domain, brands),
      domain: citation.domain,
      pageUrl: citation.url,
      title: citation.title || citation.domain,
      isOwnDomain: citation.isOwnDomain || normalizeHostname(citation.domain).endsWith("neodigm.com"),
    }));
}
