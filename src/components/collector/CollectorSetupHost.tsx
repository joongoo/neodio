"use client";

import { useEffect, useState } from "react";
import { CircleCheck } from "lucide-react";
import { Modal, ModalCloseButton } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { CollectorProblem } from "@/components/prompt-library/AgentCollectionModal";
import { getAgentStatus } from "@/lib/collectorClient";
import { AIO_COLLECT_MIN_VERSION, SITEMAP_CRAWL_MIN_VERSION, compareVersions, type CollectorPlatform } from "@/lib/collectorAgent";
import { COLLECTOR_SETUP_EVENT, agentReadiness, type CollectorSetupDetail } from "@/lib/collectorSetup";

// 다시 확인할 때는 가장 높은 요구 버전을 기준으로 한다 — 어느 작업에서 열렸든 이 버전이면 둘 다 된다.
const RECHECK_MIN_VERSION = [SITEMAP_CRAWL_MIN_VERSION, AIO_COLLECT_MIN_VERSION].sort(compareVersions).at(-1)!;

// 화면 어디서든 수집기 준비가 필요할 때(사이트맵 크롤 등) 뜨는 설치 안내 창 — 앱 레이아웃에 한 번만 둔다.
// startSitemapCrawl이 수집기가 없거나 오래됐거나 Chrome이 없으면 이벤트로 이 창을 연다.
export function CollectorSetupHost() {
  const [detail, setDetail] = useState<CollectorSetupDetail | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [platforms, setPlatforms] = useState<CollectorPlatform[]>([]);

  useEffect(() => {
    function onSetup(event: Event) {
      setDetail((event as CustomEvent<CollectorSetupDetail>).detail);
      setReady(false);
      fetch("/api/collector-download/config")
        .then((res) => (res.ok ? res.json() : { platforms: [] }))
        .then((body) => setPlatforms(body.platforms ?? []))
        .catch(() => setPlatforms([]));
    }
    window.addEventListener(COLLECTOR_SETUP_EVENT, onSetup);
    return () => window.removeEventListener(COLLECTOR_SETUP_EVENT, onSetup);
  }, []);

  async function recheck() {
    setBusy(true);
    try {
      const status = await getAgentStatus();
      const reason = agentReadiness(status, RECHECK_MIN_VERSION);
      if (reason) setDetail({ reason, status });
      else setReady(true);
    } finally {
      setBusy(false);
    }
  }

  const close = () => setDetail(null);

  return (
    <Modal open={detail !== null} onClose={close}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-neutral-900">{ready ? "수집기가 준비됐습니다" : detail?.reason === "outdated" ? "수집기 업데이트가 필요합니다" : detail?.reason === "no_chrome" ? "Chrome이 필요합니다" : "수집기 설치가 필요합니다"}</h2>
        <ModalCloseButton onClose={close} />
      </div>
      {ready ? (
        <div className="mt-4 flex flex-col gap-4">
          <p className="flex items-center gap-2 text-sm text-neutral-700">
            <CircleCheck size={18} className="shrink-0 text-emerald-500" />이 PC의 수집기를 확인했습니다. 이전 화면으로 돌아가 크롤을 다시 시작해 주세요.
          </p>
          <div className="flex justify-end">
            <Button variant="primary" onClick={close}>
              확인
            </Button>
          </div>
        </div>
      ) : (
        detail && (
          <>
            <p className="mt-2 text-xs text-neutral-500">
              사이트 크롤과 AI Overview 수집은 이 PC에 설치한 수집기가 Chrome으로 진행하고, 결과는 이 화면이 서버에 저장합니다.
            </p>
            <CollectorProblem problem={detail.reason} status={detail.status} downloadPlatforms={platforms} busy={busy} onRetry={recheck} onBack={close} />
          </>
        )
      )}
    </Modal>
  );
}
