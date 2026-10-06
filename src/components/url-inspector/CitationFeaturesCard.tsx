import { Card } from "@/components/ui/Card";
import { CitationFeatureAnalysis } from "@/lib/citationFeatures";

const MIN_GROUP_PAGES = 3;

function rate(group: { pages: number; cited: number }) {
  return group.pages > 0 ? `${Math.round((group.cited / group.pages) * 100)}% (${group.cited}/${group.pages})` : "–";
}

// 크롤한 자사 페이지의 속성별로 "AI 답변에 인용된 페이지의 비율"을 비교한다.
export function CitationFeaturesCard({ analysis }: { analysis: CitationFeatureAnalysis }) {
  // 있는 쪽/없는 쪽 한 그룹이 비면 비교가 안 되니 표에서 뺀다.
  const comparable = analysis.features.filter((f) => f.liftPoints !== null);
  return (
    <Card>
      <h2 className="text-base font-bold text-neutral-900">인용되는 페이지의 특징</h2>
      <p className="mt-0.5 text-xs text-neutral-500">
        최근 사이트맵 크롤로 확인한 {analysis.totalPages}개 페이지 중 {analysis.citedPages}개가 AI 답변에 인용됐어요. 속성이 있는 페이지와 없는 페이지의 인용 비율을 비교해요.
      </p>
      {comparable.length === 0 ? (
        <p className="mt-4 text-xs text-neutral-500">
          아직 비교할 수 있는 속성이 없어요. 최근 크롤에 FAQ·목차·구조화 데이터 같은 속성이 없거나 모든 페이지가 같은 값이에요. 사이트맵을 다시 크롤링하면 채워져요.
        </p>
      ) : (
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[520px] text-xs">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-neutral-500">
              <th className="py-2 font-medium">페이지 특징</th>
              <th className="py-2 text-right font-medium">있는 페이지의 인용률</th>
              <th className="py-2 text-right font-medium">없는 페이지의 인용률</th>
              <th className="py-2 text-right font-medium">차이</th>
            </tr>
          </thead>
          <tbody>
            {comparable.map((f) => {
              const small = f.withFeature.pages < MIN_GROUP_PAGES || f.withoutFeature.pages < MIN_GROUP_PAGES;
              return (
                <tr key={f.id} className="border-b border-neutral-100 text-neutral-700">
                  <td className="py-2">{f.label}</td>
                  <td className="py-2 text-right tabular-nums">{rate(f.withFeature)}</td>
                  <td className="py-2 text-right tabular-nums">{rate(f.withoutFeature)}</td>
                  <td
                    className={`py-2 text-right tabular-nums ${
                      f.liftPoints === null || small ? "text-neutral-400" : f.liftPoints > 0 ? "text-emerald-600" : f.liftPoints < 0 ? "text-red-600" : ""
                    }`}
                  >
                    {f.liftPoints === null ? "–" : `${f.liftPoints > 0 ? "+" : ""}${f.liftPoints}%p`}
                    {small && f.liftPoints !== null ? " (표본 적음)" : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}
      <p className="mt-3 text-[11px] text-neutral-400">
        함께 나타나는 경향일 뿐 원인을 뜻하지는 않아요. 페이지 수가 적으면 결과가 크게 흔들릴 수 있어요.
      </p>
    </Card>
  );
}
