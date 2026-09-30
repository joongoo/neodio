"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, CircleCheck, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { Modal, ModalCloseButton } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import type { AioCollectJob, AioJobResult } from "@/lib/backend/aio/jobTypes";
import { cancelAioCollect, pollAioCollect, resumeAioCollect, startAioCollect } from "@/lib/aioCollectClient";
import { DEVICE_LABEL } from "./labels";

// "지금 수집" — 정기 수집(cron)을 기다리지 않고 바로 AIO를 수집한다.
// 전체 현황에서는 전체 키워드, 키워드 상세에서는 그 키워드만. 이 PC에서
// 실제 Chrome이 열리고, 여러 건이면 캡차를 피하려고 1~2분씩 쉬어 간다.
const POLL_MS = 2000;
const AVG_SECONDS_PER_SEARCH = 20;
const AVG_DELAY_SECONDS = 90;

export function AioCollectButton({
  brandId,
  keywordId,
  keywordLabel,
  searches,
  disabled,
  size = "md",
}: {
  brandId: string;
  /** 있으면 이 키워드만 수집 */
  keywordId?: string;
  keywordLabel?: string;
  /** 예상 검색 횟수(키워드 × 디바이스) — 확인 단계의 소요 시간 안내용 */
  searches: number;
  disabled?: boolean;
  size?: "md" | "sm";
}) {
  const router = useRouter();
  const [job, setJob] = useState<AioCollectJob | null>(null);
  const [open, setOpen] = useState(false);
  const [force, setForce] = useState(false);
  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const refreshedFor = useRef<string | null>(null);

  const running = job?.status === "running";

  const poll = useCallback(async (id: string) => {
    const next = await pollAioCollect(id);
    if (next) setJob(next);
  }, []);

  // 새로고침·다른 탭에서 돌아와도 진행 중인 수집을 이어서 보여준다.
  useEffect(() => {
    let alive = true;
    resumeAioCollect(brandId)
      .then((resumed) => {
        if (alive && resumed) setJob(resumed);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [brandId]);

  useEffect(() => {
    if (!job || !running) return;
    const timer = setInterval(() => {
      setNow(Date.now());
      void poll(job.id);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [job, running, poll]);

  // 끝나면 한 번만 화면 데이터를 다시 읽는다.
  useEffect(() => {
    if (job && !running && job.results.length > 0 && refreshedFor.current !== job.id) {
      refreshedFor.current = job.id;
      router.refresh();
    }
  }, [job, running, router]);

  async function start() {
    setStarting(true);
    setError(null);
    const started = await startAioCollect({ brandId, keywordId, force });
    setStarting(false);
    if (!started.ok) {
      if (started.handled) {
        setOpen(false);
        return;
      }
      setError(started.error);
      if (started.jobId) void poll(started.jobId);
      return;
    }
    setJob(started.job);
  }

  async function cancel() {
    if (!job) return;
    setCancelling(true);
    await cancelAioCollect(job.id);
    await poll(job.id);
    setCancelling(false);
  }

  function close() {
    setOpen(false);
    setError(null);
    if (job && !running) setJob(null);
  }

  const estimateMinutes = Math.max(1, Math.round((searches * AVG_SECONDS_PER_SEARCH + Math.max(0, searches - 1) * AVG_DELAY_SECONDS) / 60));

  return (
    <>
      <Button
        variant="secondary"
        size={size}
        icon={running ? <Loader2 size={size === "sm" ? 14 : 16} className="animate-spin" /> : <RefreshCw size={size === "sm" ? 14 : 16} />}
        onClick={() => setOpen(true)}
        disabled={disabled && !running}
      >
        {running ? `수집 중 ${job.results.length}/${job.total || "…"}` : keywordId ? "이 키워드 지금 수집" : "지금 수집"}
      </Button>

      <Modal open={open} onClose={running ? () => setOpen(false) : close}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-neutral-900">{job ? `AIO 수집 · ${job.label}` : "AI Overview 지금 수집"}</h2>
          <ModalCloseButton onClose={running ? () => setOpen(false) : close} />
        </div>

        {!job ? (
          <div className="mt-4 flex flex-col gap-4">
            <p className="text-sm text-neutral-700">
              {keywordId ? (
                <>
                  <b>&quot;{keywordLabel}&quot;</b>을(를) 지금 Google에서 검색해 AI Overview 인용을 기록합니다. 오늘 이미 수집했다면 새 결과로 바꿉니다.
                </>
              ) : (
                <>
                  등록된 키워드를 지금 Google에서 검색해 AI Overview 인용을 기록합니다. 검색 <b>{searches}회</b>, 약 <b>{estimateMinutes}분</b>{" "}
                  걸립니다(캡차를 피하려고 검색 사이 1~2분씩 쉽니다).
                </>
              )}
            </p>
            {!keywordId && (
              <label className="flex items-center gap-2 text-sm text-neutral-700">
                <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} className="size-4 cursor-pointer accent-slate-800" />
                오늘 이미 수집한 키워드도 다시 수집
              </label>
            )}
            <p className="rounded-md bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
              수집 중에는 이 PC에서 시크릿 Chrome 창이 열립니다 — 자동으로 닫히니 직접 닫지 마세요. Google이 캡차를 띄우면 그 자리에서 멈추고, 남은
              키워드는 다음 수집 때 이어서 진행됩니다.
            </p>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={close}>
                취소
              </Button>
              <Button variant="primary" onClick={start} disabled={starting}>
                {starting ? "시작 중…" : "수집 시작"}
              </Button>
            </div>
          </div>
        ) : (
          <JobProgress job={job} now={now} cancelling={cancelling} onCancel={cancel} onClose={close} />
        )}
      </Modal>
    </>
  );
}

function JobProgress({
  job,
  now,
  cancelling,
  onCancel,
  onClose,
}: {
  job: AioCollectJob;
  now: number;
  cancelling: boolean;
  onCancel: () => void;
  onClose: () => void;
}) {
  const running = job.status === "running";
  const done = job.results.length;
  const percent = job.total > 0 ? Math.round((done / job.total) * 100) : running ? 0 : 100;
  const waitSeconds = job.waitUntil ? Math.max(0, Math.ceil((job.waitUntil - now) / 1000)) : null;

  return (
    <div className="mt-4 flex flex-col gap-4">
      {running ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 font-medium text-neutral-800">
              <Loader2 size={16} className="animate-spin text-slate-600" />
              {job.current
                ? `"${job.current.keyword}" (${DEVICE_LABEL[job.current.device]}) 검색 중…`
                : waitSeconds !== null
                  ? `다음 검색까지 ${waitSeconds}초 대기`
                  : "준비 중…"}
            </span>
            <span className="tabular-nums text-neutral-500">
              {done}/{job.total || "…"}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
            <div className="h-full rounded-full bg-slate-700 transition-all" style={{ width: `${percent}%` }} />
          </div>
          <p className="text-xs text-neutral-500">이 창을 닫아도 수집은 계속됩니다. 버튼을 다시 누르면 진행 상황을 볼 수 있습니다.</p>
        </div>
      ) : (
        <FinishedBanner job={job} />
      )}

      {job.results.length > 0 && (
        <ul className="flex max-h-60 flex-col divide-y divide-neutral-100 overflow-y-auto rounded-lg border border-neutral-200">
          {job.results.map((result, i) => (
            <ResultRow key={i} result={result} />
          ))}
        </ul>
      )}

      <div className="flex justify-end gap-2">
        {running ? (
          <Button variant="secondary" icon={<Ban size={16} />} onClick={onCancel} disabled={cancelling}>
            {cancelling ? "중단 중…" : "수집 중단"}
          </Button>
        ) : (
          <Button variant="primary" onClick={onClose}>
            확인
          </Button>
        )}
      </div>
    </div>
  );
}

function FinishedBanner({ job }: { job: AioCollectJob }) {
  if (job.status === "done") {
    return (
      <p className="flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
        <CircleCheck size={18} />
        {job.total === 0 ? "오늘 이미 모든 키워드를 수집했습니다. 다시 수집하려면 옵션을 켜고 시작하세요." : `수집 완료 — ${job.results.length}건이 화면에 반영됐습니다.`}
      </p>
    );
  }
  if (job.status === "captcha") {
    return (
      <p className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
        <TriangleAlert size={18} className="mt-0.5 shrink-0" />
        Google이 캡차(비정상 트래픽 확인)를 띄워 수집을 멈췄습니다. 같은 IP에서 계속 요청하면 차단이 길어지니, 잠시(수십 분~몇 시간) 뒤에 다시 시도하세요.
      </p>
    );
  }
  if (job.status === "cancelled") {
    return (
      <p className="flex items-center gap-2 rounded-md bg-neutral-100 px-3 py-2.5 text-sm text-neutral-700">
        <Ban size={18} />
        수집을 중단했습니다. 그 전까지 수집한 {job.results.length}건은 저장됐습니다.
      </p>
    );
  }
  return (
    <p className="flex items-start gap-2 rounded-md bg-red-50 px-3 py-2.5 text-sm text-red-700">
      <TriangleAlert size={18} className="mt-0.5 shrink-0" />
      {job.error ?? "수집 중 오류가 발생했습니다."}
    </p>
  );
}

function ResultRow({ result }: { result: AioJobResult }) {
  const own = result.ownPositions.length > 0;
  const summary =
    result.status === "aio_present"
      ? `AIO 노출 · 출처 ${result.sources} · YouTube ${result.youtube} · ${own ? `우리 영상 ${result.ownPositions.join(",")}위` : "우리 영상 없음"}`
      : result.status === "aio_absent"
        ? "AIO 없음"
        : result.captcha
          ? "캡차로 실패"
          : `실패${result.message ? ` · ${result.message}` : ""}`;
  return (
    <li className="flex items-center gap-3 px-3 py-2 text-sm">
      <span
        className={cn(
          "size-2 shrink-0 rounded-full",
          result.status === "failed" ? "bg-red-500" : own ? "bg-blue-600" : result.status === "aio_present" ? "bg-emerald-500" : "bg-neutral-300"
        )}
      />
      <span className="min-w-0 flex-1 truncate font-medium text-neutral-800" title={result.keyword}>
        {result.keyword} <span className="font-normal text-neutral-400">· {DEVICE_LABEL[result.device]}</span>
      </span>
      <span className={cn("max-w-[60%] shrink-0 truncate text-xs", result.status === "failed" ? "text-red-600" : "text-neutral-500")} title={summary}>
        {summary}
      </span>
    </li>
  );
}
