import { Card } from "@/components/ui/Card";
import { CollectionQualityRow } from "@/lib/db";

const pct = (value: number, total: number) => (total > 0 ? `${Math.round((value / total) * 100)}%` : "–");

export function CollectionQualityCard({ rows }: { rows: CollectionQualityRow[] }) {
  return (
    <Card>
      <h2 className="text-base font-bold text-neutral-900">수집 품질</h2>
      <p className="mt-0.5 text-xs text-neutral-500">
        엔진별로 수집이 얼마나 잘 됐는지 보여줘요. 가시성 비율은 &ldquo;AI가 답변한 실행&rdquo;을 기준으로 계산하니, 이 비중이 낮은 엔진끼리의 비교는 조심해서 보세요.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[480px] text-xs">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-neutral-500">
              <th className="py-2 font-medium">엔진</th>
              <th className="py-2 text-right font-medium">시도</th>
              <th className="py-2 text-right font-medium">AI 답변</th>
              <th className="py-2 text-right font-medium">AI 미답변</th>
              <th className="py-2 text-right font-medium">수집 실패</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.model} className="border-b border-neutral-100 text-neutral-700">
                <td className="py-2">{r.model}</td>
                <td className="py-2 text-right tabular-nums">{r.attempted.toLocaleString("ko-KR")}</td>
                <td className="py-2 text-right tabular-nums">
                  {r.answered.toLocaleString("ko-KR")} <span className="text-neutral-400">({pct(r.answered, r.attempted)})</span>
                </td>
                <td className="py-2 text-right tabular-nums">
                  {r.absent.toLocaleString("ko-KR")} <span className="text-neutral-400">({pct(r.absent, r.attempted)})</span>
                </td>
                <td className={`py-2 text-right tabular-nums ${r.error > 0 && r.error / r.attempted >= 0.2 ? "text-red-600" : ""}`}>
                  {r.error.toLocaleString("ko-KR")} <span className="text-neutral-400">({pct(r.error, r.attempted)})</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
