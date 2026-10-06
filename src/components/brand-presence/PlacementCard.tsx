import { Card } from "@/components/ui/Card";
import { EARLY_RATIO, PlacementSummary } from "@/lib/placement";

const show = (value: number | null, suffix = "") => (value === null ? "–" : `${value}${suffix}`);

// 언급 여부(가시성)와 별개로, 언급된 답변 안에서 얼마나 앞에·위에 나오는지 보여준다.
export function PlacementCard({ rows }: { rows: PlacementSummary[] }) {
  return (
    <Card>
      <h2 className="text-base font-bold text-neutral-900">노출 위치</h2>
      <p className="mt-0.5 text-xs text-neutral-500">
        우리 브랜드가 언급된 답변에서 얼마나 눈에 띄는지 보여줘요. 순서는 경쟁사와 함께 나온 답변만 비교하고(1이 가장 먼저), 인용 순서는 출처 목록에서 우리 도메인이 처음 나온 자리예요.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] text-xs">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-neutral-500">
              <th className="py-2 font-medium">엔진</th>
              <th className="py-2 text-right font-medium">언급 답변</th>
              <th className="py-2 text-right font-medium">경쟁사 중 1번째</th>
              <th className="py-2 text-right font-medium">평균 언급 순서</th>
              <th className="py-2 text-right font-medium">앞 {Math.round(EARLY_RATIO * 100)}% 안 등장</th>
              <th className="py-2 text-right font-medium">인용 답변</th>
              <th className="py-2 text-right font-medium">평균 인용 순서</th>
              <th className="py-2 text-right font-medium">인용 3위 이내</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.label} className={`border-b border-neutral-100 text-neutral-700 ${i === 0 ? "font-semibold" : ""}`}>
                <td className="py-2">{r.label}</td>
                <td className="py-2 text-right tabular-nums">
                  {r.mentioned}/{r.answers}
                </td>
                <td className="py-2 text-right tabular-nums" title={`경쟁사와 함께 나온 답변 ${r.contested}개 기준`}>
                  {show(r.firstShare, "%")}
                  {r.contested > 0 && <span className="ml-1 text-neutral-400">({r.contested})</span>}
                </td>
                <td className="py-2 text-right tabular-nums">{show(r.avgRank)}</td>
                <td className="py-2 text-right tabular-nums">{show(r.earlyShare, "%")}</td>
                <td className="py-2 text-right tabular-nums">{r.cited}</td>
                <td className="py-2 text-right tabular-nums">{show(r.avgCitationPosition)}</td>
                <td className="py-2 text-right tabular-nums">{show(r.top3CitationShare, "%")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[11px] text-neutral-400">괄호는 비교에 쓴 답변 수예요. 표본이 적으면 비율이 크게 흔들려요.</p>
    </Card>
  );
}
