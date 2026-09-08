import { BlockedAgentRow, RobotsTxtLine, RobotsTxtOpportunity } from "@/lib/db/types";

// 우리 사이트의 robots.txt를 직접 fetch해서 파싱 — 3rd-party 데이터나 API
// 키가 필요 없는 유일한 "기술적 기회" 진단이라 P0에 그대로 들어갈 수 있다
// (neodigm_p0_scope.md §1). 알려진 AI 크롤러 user-agent가 Disallow로
// 막혀 있으면 그 규칙을 "차단된 트래픽"으로 집계한다.
const AI_AGENTS = ["GPTBot", "OAI-SearchBot", "OAI-User", "ClaudeBot", "Google-Extended", "PerplexityBot", "Applebot-Extended"];

function isAiAgent(agent: string) {
  return AI_AGENTS.some((a) => a.toLowerCase() === agent.trim().toLowerCase());
}

export async function getRealRobotsTxtOpportunity(domain: string): Promise<RobotsTxtOpportunity | null> {
  let text: string;
  try {
    const res = await fetch(`https://${domain}/robots.txt`, { cache: "no-store" });
    if (!res.ok) return null;
    text = await res.text();
  } catch {
    return null;
  }
  if (!text.trim()) return null;

  let currentAgent = "*";
  let sitemapUrl = "";
  const lines: RobotsTxtLine[] = [];
  const blockedByAgent = new Map<string, string[]>();

  text.split("\n").forEach((raw, idx) => {
    const line = raw.trim();
    let blocksAgent = false;

    if (/^user-agent:/i.test(line)) {
      currentAgent = line.split(":").slice(1).join(":").trim();
    } else if (/^disallow:/i.test(line)) {
      const path = line.split(":").slice(1).join(":").trim();
      if (path && isAiAgent(currentAgent)) {
        blocksAgent = true;
        const rules = blockedByAgent.get(currentAgent) ?? [];
        rules.push(path);
        blockedByAgent.set(currentAgent, rules);
      }
    } else if (/^sitemap:/i.test(line)) {
      sitemapUrl = line.split(":").slice(1).join(":").trim();
    }

    lines.push({ lineNumber: idx + 1, text: raw, blocksAgent });
  });

  const blockedTraffic: BlockedAgentRow[] = Array.from(blockedByAgent.entries()).map(([agent, rules]) => ({
    agent,
    blockedUrls: rules.length,
    rule: rules.map((r) => `Disallow: ${r}`).join(", "),
  }));

  const totalUrls = blockedTraffic.reduce((sum, b) => sum + b.blockedUrls, 0);
  const blockedAgentsCount = blockedTraffic.length;

  return {
    title: "robots.txt로 차단된 트래픽",
    description: "사이트의 robots.txt로 차단된 트래픽 분석입니다.",
    summary:
      blockedAgentsCount > 0
        ? `robots.txt로 차단된 URL ${totalUrls}개를 발견했으며, 이는 AI 에이전트 ${blockedAgentsCount}개에 영향을 미쳐 검색엔진 및 AI 크롤러로부터의 잠재적 트래픽 손실을 나타냅니다.`
        : "알려진 AI 크롤러를 차단하는 규칙이 발견되지 않았습니다.",
    totalUrls,
    blockedAgentsCount,
    sitemapUrl,
    lines,
    blockedTraffic,
  };
}
