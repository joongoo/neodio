import { Card } from "@/components/ui/Card";
import { ModelTopicMatrix } from "@/lib/db";
import { MIN_RELIABLE_RUNS } from "@/lib/visibilityStats";

// 셀 색 = 가시성(언급 실행 / 전체 실행). 실행이 적은 셀은 우연일 수 있어 옅게 처리하고,
// 그 엔진에서 한 번도 수집하지 않은 조합은 0%가 아니라 "–"로 구분한다.
const MIN_CELL_RUNS = 3;

function cellStyle(rate: number, total: number) {
  const alpha = total < MIN_CELL_RUNS ? 0.25 : 1;
  return { backgroundColor: `rgba(16, 185, 129, ${(0.08 + (rate / 100) * 0.62) * alpha})` };
}

export function ModelTopicHeatmap({ matrix }: { matrix: ModelTopicMatrix }) {
  const totalRuns = matrix.rows.reduce((sum, r) => sum + r.totalRuns, 0);
  return (
    <Card>
      <h2 className="text-base font-bold text-neutral-900">엔진별 질의 가시성</h2>
      <p className="mt-0.5 text-xs text-neutral-500">
        질의마다 엔진별로 우리 브랜드가 언급된 답변의 비율이에요. 짙을수록 잘 노출돼요. 실행이 {MIN_CELL_RUNS}개 미만인 칸은 옅게, 수집하지 않은 칸은 &ldquo;–&rdquo;로 표시해요.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[520px] border-separate border-spacing-1 text-xs">
          <thead>
            <tr className="text-neutral-500">
              <th className="text-left font-medium">질의</th>
              {matrix.models.map((m) => (
                <th key={m} className="px-2 text-center font-medium">
                  {m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((row) => (
              <tr key={row.topic}>
                <td className="max-w-[260px] truncate pr-3 text-neutral-700" title={row.topic}>
                  {row.topic}
                </td>
                {matrix.models.map((m) => {
                  const cell = row.cells[m];
                  if (!cell) {
                    return (
                      <td key={m} className="rounded bg-neutral-50 py-1.5 text-center text-neutral-300">
                        –
                      </td>
                    );
                  }
                  const rate = Math.round((cell.hit / cell.total) * 100);
                  return (
                    <td
                      key={m}
                      className="rounded py-1.5 text-center tabular-nums text-neutral-800"
                      style={cellStyle(rate, cell.total)}
                      title={`${cell.hit}/${cell.total}개 답변에서 언급`}
                    >
                      {rate}%<span className="ml-1 text-[10px] text-neutral-500">({cell.total})</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalRuns < MIN_RELIABLE_RUNS && <p className="mt-2 text-[11px] text-neutral-400">수집이 적어 비율이 크게 흔들릴 수 있어요.</p>}
    </Card>
  );
}
