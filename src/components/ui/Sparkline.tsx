// 표 셀 하나에 들어가는 초소형 추이 그래프 — 토픽이 많아져도 숫자
// 컬럼 옆에서 한눈에 스캔할 수 있게 한다(VIVI Topics 표의 Trend 컬럼 참고).
// 값이 1개 이하면 추세를 그릴 수 없으므로 대시로 표시한다.
export function Sparkline({ values, width = 64, height = 20 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) {
    return <span className="text-xs text-neutral-300">–</span>;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);

  const points = values
    .map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const trendingUp = values[values.length - 1] >= values[0];

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <polyline
        points={points}
        fill="none"
        stroke={trendingUp ? "#059669" : "#dc2626"}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
