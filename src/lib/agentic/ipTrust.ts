// 기록된 IP가 "진짜 클라이언트 IP"인지 점검한다(명세 §5.1).
// CDN·프록시 뒤 서버 로그는 IP가 프록시 주소일 수 있고, 그대로 진위를 판정하면 모든 봇이 "의심"이 된다.
//
// 신호: 소수의 IP가 요청 대부분을 차지하면서 그 뒤에 **서로 다른 UA가 많이** 있다.
// (봇 한두 개가 사이트 트래픽 대부분을 차지하는 작은 사이트는 UA가 다양하지 않아 오탐하지 않는다.)
// 임계값은 제안 단계의 값이며 실제 로그로 보정해야 한다.

export type IpTrustStatus = "trusted" | "suspected-proxy" | "insufficient-sample" | "no-ip";

export interface IpTrustOptions {
  /** 판단에 필요한 최소 요청 수(미만이면 판단 보류) */
  minSample: number;
  topN: number;
  /** 상위 N개 IP가 차지하는 비율이 이 값을 넘고 */
  topShareThreshold: number;
  /** 그 IP들 뒤의 서로 다른 UA 수가 이 값 이상이면 프록시로 의심 */
  minDistinctUas: number;
  /** 추적하는 고유 IP 상한(폭주 방지). 넘으면 새 IP는 '기타'로 센다 */
  maxTrackedIps: number;
  maxUasPerIp: number;
}

export const DEFAULT_IP_TRUST_OPTIONS: IpTrustOptions = {
  minSample: 200,
  topN: 3,
  topShareThreshold: 0.5,
  minDistinctUas: 10,
  maxTrackedIps: 200_000,
  maxUasPerIp: 50,
};

export interface IpTrustReport {
  status: IpTrustStatus;
  total: number;
  withIp: number;
  topShare: number;
  distinctUasBehindTop: number;
}

/** 스트리밍으로 한 줄씩 넣고 마지막에 결과를 얻는다. 메모리는 상한으로 묶는다. */
export class IpTrustAccumulator {
  private total = 0;
  private withIp = 0;
  private perIp = new Map<string, { count: number; uas: Set<string> }>();

  constructor(private readonly options: IpTrustOptions = DEFAULT_IP_TRUST_OPTIONS) {}

  add(ip: string | undefined, ua: string): void {
    this.total++;
    if (!ip) return;
    this.withIp++;
    let slot = this.perIp.get(ip);
    if (!slot) {
      if (this.perIp.size >= this.options.maxTrackedIps) return;
      slot = { count: 0, uas: new Set() };
      this.perIp.set(ip, slot);
    }
    slot.count++;
    if (slot.uas.size < this.options.maxUasPerIp) slot.uas.add(ua);
  }

  report(): IpTrustReport {
    const o = this.options;
    const empty = { total: this.total, withIp: this.withIp, topShare: 0, distinctUasBehindTop: 0 };
    if (this.total === 0 || this.withIp === 0) return { status: "no-ip", ...empty };
    if (this.withIp < o.minSample) return { status: "insufficient-sample", ...empty };
    const top = [...this.perIp.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, o.topN);
    const topCount = top.reduce((s, [, v]) => s + v.count, 0);
    const topShare = topCount / this.withIp;
    const uas = new Set<string>();
    for (const [, v] of top) v.uas.forEach((u) => uas.add(u));
    const suspected = topShare > o.topShareThreshold && uas.size >= o.minDistinctUas;
    return { status: suspected ? "suspected-proxy" : "trusted", total: this.total, withIp: this.withIp, topShare, distinctUasBehindTop: uas.size };
  }
}
