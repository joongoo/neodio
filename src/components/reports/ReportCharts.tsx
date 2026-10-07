// 보고서용 차트 — 화면에 보일 때만 그리는 차트 라이브러리 대신 순수 SVG/CSS로 그린다(인쇄·PDF에서도 항상 그려진다).

export interface Series {
  name: string;
  color: string;
  points: { label: string; value: number }[];
}

/** 주별 추이 선 그래프 — 여러 선을 같은 0~max 축에 그린다. */
export function TrendChart({ series, height = 160, unit = "" }: { series: Series[]; height?: number; unit?: string }) {
  const labels = series[0]?.points.map((p) => p.label) ?? [];
  if (labels.length === 0) return <p className="text-xs text-neutral-400">추이를 그릴 데이터가 없어요.</p>;
  const width = 560;
  const pad = { top: 12, right: 28, bottom: 26, left: 36 };
  const max = Math.max(10, ...series.flatMap((s) => s.points.map((p) => p.value)));
  const top = Math.ceil(max / 10) * 10;
  const x = (i: number) => pad.left + (labels.length === 1 ? (width - pad.left - pad.right) / 2 : (i * (width - pad.left - pad.right)) / (labels.length - 1));
  const y = (v: number) => pad.top + (1 - v / top) * (height - pad.top - pad.bottom);
  const ticks = [0, top / 2, top];
  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="주별 추이">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke="#e5e7eb" strokeWidth="1" />
            <text x={pad.left - 6} y={y(t) + 3} textAnchor="end" fontSize="9" fill="#6b7280">{t}{unit}</text>
          </g>
        ))}
        {labels.map((label, i) => (
          <text key={label + i} x={x(i)} y={height - 8} textAnchor="middle" fontSize="9" fill="#6b7280">{label}</text>
        ))}
        {series.map((s) => (
          <g key={s.name}>
            <polyline fill="none" stroke={s.color} strokeWidth="2" points={s.points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ")} />
            {s.points.map((p, i) => (
              <circle key={i} cx={x(i)} cy={y(p.value)} r="3" fill={s.color} />
            ))}
          </g>
        ))}
      </svg>
      <div className="mt-1 flex flex-wrap gap-4 text-[11px] text-neutral-600">
        {series.map((s) => (
          <span key={s.name} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4" style={{ backgroundColor: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}

/** 가로 막대 목록 — 라벨, 막대, 값. 자사 행은 강조한다. */
export function RateBars({ rows, max = 100, unit = "%" }: { rows: { label: string; value: number; highlight?: boolean; note?: string }[]; max?: number; unit?: string }) {
  if (rows.length === 0) return <p className="text-xs text-neutral-400">표시할 데이터가 없어요.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => (
        <li key={row.label} className="grid grid-cols-[150px_1fr_64px] items-center gap-3 text-xs">
          <span className={`truncate ${row.highlight ? "font-semibold text-neutral-900" : "text-neutral-600"}`} title={row.label}>{row.label}</span>
          <span className="h-3 rounded bg-neutral-100">
            <span className="block h-3 rounded" style={{ width: `${Math.max(0, Math.min(100, (row.value / max) * 100))}%`, backgroundColor: row.highlight ? "#1e293b" : "#94a3b8" }} />
          </span>
          <span className="text-right tabular-nums text-neutral-700">{row.value}{unit}{row.note ? <span className="ml-1 text-[10px] text-neutral-400">{row.note}</span> : null}</span>
        </li>
      ))}
    </ul>
  );
}
