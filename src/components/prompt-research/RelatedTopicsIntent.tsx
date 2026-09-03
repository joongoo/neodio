"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// Matches Figma "Related Topics Intent" (node 646:12057, Prompt Research
// results) — a single-row 100%-stacked bar for informational/commercial/
// transactional intent share. Recharts-based (not CSS divs) so it gets the
// same hover-tooltip interaction as every other chart in the app. Values
// come from an LLM intent classification over the related topics, not a
// keyword-volume API (see neodigm_p0_scope.md).
const SEGMENTS = [
  { key: "informational", label: "정보성", color: "#ed6b21" },
  { key: "commercial", label: "상업성", color: "#99781a" },
  { key: "transactional", label: "거래성", color: "#e02699" },
] as const;

export function RelatedTopicsIntent({
  intent,
}: {
  intent: { informational: number; commercial: number; transactional: number };
}) {
  const total = intent.informational + intent.commercial + intent.transactional || 1;
  const data = SEGMENTS.map((seg) => ({
    name: seg.label,
    value: intent[seg.key],
    percent: Math.round((intent[seg.key] / total) * 100),
    color: seg.color,
  }));

  return (
    <div className="w-full rounded-xl border border-neutral-200 bg-white px-5 py-4">
      <h3 className="text-base font-bold text-neutral-900">관련 토픽 의도(Intent)</h3>
      <p className="mt-0.5 text-xs text-neutral-500">
        이 쿼리에 대한 각 검색 의도(Intent) 카테고리별 관련 토픽 비율입니다.
      </p>

      <ResponsiveContainer width="100%" height={56}>
        <BarChart data={[{ name: "intent", ...Object.fromEntries(data.map((d) => [d.name, d.value])) }]} layout="vertical" margin={{ top: 12, bottom: 0 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" hide />
          <Tooltip
            formatter={(value, name) => {
              const seg = data.find((d) => d.name === name);
              return [`${value} (${seg?.percent ?? 0}%)`, name];
            }}
          />
          {data.map((seg) => (
            <Bar key={seg.name} dataKey={seg.name} stackId="intent" fill={seg.color} barSize={12} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>

      <div className="mt-1 flex items-center justify-center gap-6">
        {data.map((seg) => (
          <div key={seg.name} className="flex items-center gap-1.5">
            <span className="size-2 rounded-sm" style={{ backgroundColor: seg.color }} />
            <span className="text-xs">
              <span className="text-neutral-600">{seg.name} </span>
              <span className="font-bold text-neutral-900">{seg.value} </span>
              <span className="text-neutral-500">({seg.percent}%)</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
