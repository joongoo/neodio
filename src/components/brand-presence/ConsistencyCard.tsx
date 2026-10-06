import { Card } from "@/components/ui/Card";
import { ConsistencySummary } from "@/lib/db";

const pct = (n: number, total: number) => (total > 0 ? `${Math.round((n / total) * 100)}%` : "–");

// AI 답변은 같은 질문에도 매번 달라진다 — 한 번 수집한 결과만으로 "언급된다/안 된다"를 단정하면
// 틀릴 수 있어서, 반복 수집한 질의에서 자사 언급이 얼마나 안정적인지 보여준다.
export function ConsistencyCard({ data }: { data: ConsistencySummary }) {
  const parts = [
    { label: "매번 언급", value: data.always, tone: "text-emerald-600" },
    { label: "가끔 언급", value: data.sometimes, tone: "text-amber-600" },
    { label: "한 번도 언급 안 됨", value: data.never, tone: "text-neutral-500" },
  ];
  return (
    <Card>
      <h2 className="text-base font-bold text-neutral-900">답변 일관성</h2>
      <p className="mt-0.5 text-xs text-neutral-500">
        같은 질의를 같은 엔진에 여러 번 물었을 때 우리 브랜드가 매번 나오는지 보여줘요. &ldquo;가끔 언급&rdquo;이 많을수록 한 번의 수집 결과로 판단하기 어려워요.
      </p>
      {data.repeatedPairs === 0 ? (
        <p className="mt-4 text-xs text-neutral-500">
          아직 같은 질의를 2번 이상 수집한 조합이 없어요. 같은 질의를 며칠 간격으로 반복 수집하면 여기서 안정성을 볼 수 있어요.
        </p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-3 gap-3">
            {parts.map((p) => (
              <div key={p.label} className="rounded-lg border border-neutral-200 p-3">
                <p className="text-[11px] text-neutral-500">{p.label}</p>
                <p className={`mt-1 text-xl font-bold tabular-nums ${p.tone}`}>
                  {p.value}
                  <span className="ml-1 text-xs font-medium text-neutral-400">({pct(p.value, data.repeatedPairs)})</span>
                </p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-neutral-400">
            반복 수집된 질의×엔진 {data.repeatedPairs}개 기준이에요. 한 번만 수집돼 안정성을 알 수 없는 조합은 {data.singleRunPairs}개(전체 {data.pairs}개)예요.
          </p>
          {data.flaky.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[480px] text-xs">
                <thead>
                  <tr className="border-b border-neutral-200 text-left text-neutral-500">
                    <th className="py-2 font-medium">질의</th>
                    <th className="py-2 font-medium">엔진</th>
                    <th className="py-2 text-right font-medium">언급된 횟수</th>
                  </tr>
                </thead>
                <tbody>
                  {data.flaky.map((f) => (
                    <tr key={`${f.query}-${f.model}`} className="border-b border-neutral-100 text-neutral-700">
                      <td className="max-w-[360px] truncate py-2 pr-3" title={f.query}>
                        {f.query}
                      </td>
                      <td className="py-2">{f.model}</td>
                      <td className="py-2 text-right tabular-nums">
                        {f.hit}/{f.total}회
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
