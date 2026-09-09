import { AlertTriangle, FileWarning, ListTree, MessageCircleQuestion, Target, Type, Images } from "lucide-react";
import { getRealTopicRows } from "@/lib/backend/collectionStatsReader";
import { isDemoMode } from "@/lib/backend/demoMode";
import { DEFAULT_ORG_ID, db } from "@/lib/db";
import { getRealRobotsTxtOpportunity } from "@/lib/backend/robotsTxtReader";
import {
  buildComplexityOpportunity,
  buildContentRecoveryFromCrawlHistory,
  buildFaqOpportunity,
  buildMultimediaOpportunity,
  buildTocOpportunity,
  getSitemapCrawlHistory,
} from "@/lib/backend/sitemapCrawlReader";
import { ContentAuditOpportunity } from "@/lib/db";
import { getTopicOpportunityTargets } from "@/lib/backend/topicOpportunityTargets";
import { listTrackedTopics } from "@/lib/backend/trackedTopics";
import { getDeletedLibraryRowIds } from "@/lib/backend/deletedLibraryRows";
import { getExcludedUrls } from "@/lib/backend/contentAuditExclusions";

function auditStatus(data: ContentAuditOpportunity | null): OpportunityCard["status"] {
  if (data === null) return { text: "크롤 안 함", tone: "neutral" };
  return data.affectedUrls > 0 ? { text: `${data.affectedUrls}개 URL 수정 필요`, tone: "warn" } : { text: "모두 수정 완료", tone: "ok" };
}

// 실 수집 데이터(.tmp/*-ai, .tmp/sitemap-crawl)가 새로 생길 수 있으므로
// 캐시하지 않는다 — 카드별 상태값이 최신을 반영해야 한다.
export const dynamic = "force-dynamic";

interface OpportunityCard {
  href: string;
  icon: typeof FileWarning;
  title: string;
  description: string;
  category: string;
  /** 오른쪽에 보여줄 상태값 — 색상은 tone으로 구분. */
  status: { text: string; tone: "ok" | "warn" | "neutral" };
}

// Figma "Opportunities Screen"(node 646:14727)은 온사이트 콘텐츠 최적화/
// 온사이트 기술 최적화/오프사이트 최적화 3개 섹션으로 기회를 묶어서
// 개별 카드로 나열한다. 우리는 실제로 진단 가능한 기회만 넣는다 —
// 오프사이트(Reddit/YouTube 감성 분석 등)는 각 플랫폼 API가 필요해서 P0
// 제외 (neodigm_p0_scope.md §2와 같은 이유). "기회 워크스페이스"(배포 전/후
// 지표 추적, 엣지 딜리버리, 에이전틱 트래픽)도 같은 이유로 제외.
export default async function OpportunitiesPage() {
  const demo = await isDemoMode();
  const org = await db.organizations.get(DEFAULT_ORG_ID);

  const [robotsTxt, crawlHistory, promptLibraryRowsRaw, trackedRows, deletedIds, targetUrls, excludedByMetric] = demo
    ? [null, [], [], [], new Set<string>(), {}, { complexity: new Set<string>(), faq: new Set<string>(), toc: new Set<string>(), multimedia: new Set<string>() }]
    : await Promise.all([
        org ? getRealRobotsTxtOpportunity(org.domain).catch(() => null) : Promise.resolve(null),
        org ? getSitemapCrawlHistory(org.domain).catch(() => []) : Promise.resolve([]),
        db.promptLibrary.list(DEFAULT_ORG_ID),
        listTrackedTopics(),
        getDeletedLibraryRowIds(),
        getTopicOpportunityTargets(),
        Promise.all([getExcludedUrls("complexity"), getExcludedUrls("faq"), getExcludedUrls("toc"), getExcludedUrls("multimedia")]).then(
          ([complexity, faq, toc, multimedia]) => ({ complexity, faq, toc, multimedia })
        ),
      ]);

  const libraryPrompts = [...promptLibraryRowsRaw.filter((r) => !deletedIds.has(r.id)), ...trackedRows].map((r) => r.prompt);
  const contentRecovery = buildContentRecoveryFromCrawlHistory(crawlHistory);
  const complexity = buildComplexityOpportunity(crawlHistory, excludedByMetric.complexity);
  const faq = buildFaqOpportunity(crawlHistory, excludedByMetric.faq);
  const toc = buildTocOpportunity(crawlHistory, excludedByMetric.toc);
  const multimedia = buildMultimediaOpportunity(crawlHistory, excludedByMetric.multimedia);

  const topicOpportunitiesReal = demo
    ? []
    : ((await getRealTopicRows({}, { libraryPrompts, targetUrls }).catch(() => null))?.opportunities ?? []);

  const contentCards: OpportunityCard[] = [
    {
      href: "/opportunities/complexity",
      icon: Type,
      title: "복잡한 콘텐츠 단순화",
      description: "문장/단어 길이가 짧을수록 LLM이 이해하고 인용하기 쉬워집니다.",
      category: "콘텐츠 최적화",
      status: auditStatus(complexity),
    },
    {
      href: "/opportunities/faq",
      icon: MessageCircleQuestion,
      title: "관련 FAQ 추가",
      description: "FAQ 섹션이 있으면 LLM이 질문-답변 형태로 바로 인용하기 쉬워집니다.",
      category: "콘텐츠 최적화",
      status: auditStatus(faq),
    },
    {
      href: "/opportunities/multimedia",
      icon: Images,
      title: "멀티미디어 가시성 보강",
      description: "이미지 alt 텍스트가 없으면 LLM이 이미지 속 정보를 이해할 수 없습니다.",
      category: "콘텐츠 최적화",
      status: auditStatus(multimedia),
    },
    {
      href: "/opportunities/toc",
      icon: ListTree,
      title: "목차(Table of Content) 추가",
      description: "목차가 있으면 LLM이 문서 구조를 파악하고 필요한 부분만 인용하기 쉬워집니다.",
      category: "기술적 SEO",
      status: auditStatus(toc),
    },
    ...topicOpportunitiesReal.map(
      (row): OpportunityCard => ({
        href: `/opportunities/topic/${encodeURIComponent(row.topic)}`,
        icon: Target,
        title: row.topic,
        description: `GSC/실측 수집에서 발견된 토픽이지만, 아직 우리 브랜드가 언급되지 않았습니다. (마켓: ${row.market})`,
        category: "AI 가시성",
        status: row.targetUrl
          ? row.targetUrlCitations
            ? { text: `인용 ${row.targetUrlCitations}회`, tone: "ok" }
            : { text: "인용 안 됨", tone: "warn" }
          : row.addedToLibrary
            ? { text: "콘텐츠 URL 미입력", tone: "warn" }
            : { text: "확인 필요", tone: "warn" },
      })
    ),
  ];

  const technicalCards: OpportunityCard[] = [
    {
      href: "/opportunities/robots-txt",
      icon: FileWarning,
      title: "robots.txt로 차단된 트래픽",
      description: "AI 에이전트가 robots.txt에 의해 접근을 차단당한 URL을 진단합니다.",
      category: "기술적 GEO",
      status:
        robotsTxt === null
          ? { text: "확인 필요", tone: "neutral" }
          : robotsTxt.blockedAgentsCount > 0
            ? { text: `${robotsTxt.blockedAgentsCount}개 에이전트 차단됨`, tone: "warn" }
            : { text: "차단 없음", tone: "ok" },
    },
    {
      href: "/opportunities/content-recovery",
      icon: AlertTriangle,
      title: "콘텐츠 가시성 회복",
      description: "AI 에이전트가 JavaScript를 실행하지 못해 놓치는 콘텐츠를 찾아 최적화합니다.",
      category: "기술적 GEO",
      status:
        contentRecovery === null
          ? { text: "크롤 안 함", tone: "neutral" }
          : contentRecovery.urls.filter((u) => u.status !== "optimized").length > 0
            ? { text: `${contentRecovery.urls.filter((u) => u.status !== "optimized").length}개 URL 수정 필요`, tone: "warn" }
            : { text: "모두 수정 완료", tone: "ok" },
    },
  ];

  const sections: { title: string; description: string; cards: OpportunityCard[] }[] = [
    {
      title: "온사이트 콘텐츠 최적화",
      description: "LLM이 콘텐츠를 더 잘 이해하고 사용자 의도와 매칭시킬 수 있도록 개선하는 기회입니다.",
      cards: contentCards,
    },
    {
      title: "온사이트 기술 최적화",
      description: "사이트가 LLM에게 오류 없이 접근 가능하도록 만드는 기본적인 GEO/SEO 기회입니다.",
      cards: technicalCards,
    },
  ];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">기회</h1>
        <p className="mt-1 text-sm text-neutral-500">지금 바로 진단하고 조치할 수 있는 기회입니다.</p>
      </div>

      {sections.map((section) => (
        <div key={section.title} className="flex flex-col gap-3">
          <div>
            <h2 className="text-base font-bold text-neutral-900">{section.title}</h2>
            <p className="mt-0.5 text-xs text-neutral-500">{section.description}</p>
          </div>

          {section.cards.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-200 p-5 text-center text-xs text-neutral-400">
              아직 발견된 기회가 없습니다.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {section.cards.map((opp, i) => (
                <a
                  key={`${opp.href}-${i}`}
                  href={opp.href}
                  className="flex items-center gap-4 rounded-xl border border-neutral-200 bg-white p-5 transition-colors hover:bg-neutral-50"
                >
                  <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-700">
                    <opp.icon size={18} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-neutral-900">{opp.title}</h3>
                      <span className="rounded-md border border-neutral-200 px-2 py-0.5 text-[11px] text-neutral-500">
                        {opp.category}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-neutral-500">{opp.description}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                      opp.status.tone === "ok"
                        ? "bg-emerald-50 text-emerald-700"
                        : opp.status.tone === "warn"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-neutral-100 text-neutral-500"
                    }`}
                  >
                    {opp.status.text}
                  </span>
                </a>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
