"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Check, CircleCheck, Download, Loader2, RefreshCw, TriangleAlert, UploadCloud } from "lucide-react";
import { Modal, ModalCloseButton } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import {
  COLLECTOR_PLATFORM_LABEL,
  MIN_COLLECTOR_VERSION,
  compareVersions,
  type CollectorAgentStatus,
  type CollectorEngine,
  type CollectorJob,
  type CollectorPlatform,
} from "@/lib/collectorAgent";
import {
  cancelAgentJob,
  createAgentJob,
  detectCollectorPlatform,
  getAgentJob,
  getAgentResults,
  getAgentStatus,
  isPendingAgentJob,
  listAgentJobs,
  markAgentJobApplied,
} from "@/lib/collectorClient";

const ENGINE_OPTIONS: { id: CollectorEngine; label: string }[] = [
  { id: "naver", label: "네이버 AI검색" },
  { id: "google", label: "구글 AI 모드" },
];
const ENGINE_LABEL: Record<CollectorEngine, string> = { naver: "네이버", google: "구글" };
const ALL_PLATFORMS: CollectorPlatform[] = ["mac-arm64", "mac-x64", "win-x64"];
const POLL_MS = 2000;
const IMPORT_CHUNK = 20;

type Problem = "unreachable" | "outdated" | "no_chrome";
type View = { kind: "setup" } | { kind: "problem"; problem: Problem; status: CollectorAgentStatus | null } | { kind: "job"; jobId: string };

// 운영의 "선택 수집" — 수집은 사용자 PC에 설치한 수집기가 Chrome으로 하고, 이 창이
// 다리 역할을 한다: 수집기 확인(설치·버전·Chrome) → 없으면 운영체제별 설치 안내 →
// 선택한 프롬프트로 수집 명령 → 진행 확인 → 끝난 결과를 보고 "반영"을 누르면 서버에
// 저장. 창을 닫아도 수집은 PC에서 계속되고, 다시 열면 반영하지 않은 결과가 보인다.
export function AgentCollectionModal({
  open,
  onClose,
  keywords,
  onDone,
  orgName,
  downloadPlatforms,
}: {
  open: boolean;
  onClose: () => void;
  keywords: string[];
  onDone?: () => void;
  /** 지금 보고 있는 조직 — 수집 작업에 남겨 반영할 때 확인한다. */
  orgName: string;
  /** 설치 파일이 준비된 운영체제 */
  downloadPlatforms: CollectorPlatform[];
}) {
  const router = useRouter();
  const [engines, setEngines] = useState<Set<CollectorEngine>>(new Set(["naver", "google"]));
  const [view, setView] = useState<View>({ kind: "setup" });
  const [pending, setPending] = useState<CollectorJob[]>([]);
  const [job, setJob] = useState<CollectorJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<number | null>(null);

  // 창을 열면 수집기에 남아 있는(진행 중이거나 반영 전인) 작업을 찾아 둔다.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const status = await getAgentStatus();
      if (!status || cancelled) return;
      const jobs = await listAgentJobs().catch(() => []);
      if (!cancelled) setPending(jobs.filter(isPendingAgentJob).slice(0, 3));
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // 수집 중에는 진행 상태를 받아 온다.
  const jobId = view.kind === "job" ? view.jobId : null;
  useEffect(() => {
    if (!jobId) return;
    let stopped = false;
    async function poll() {
      try {
        const next = await getAgentJob(jobId!);
        if (stopped) return;
        setJob(next);
        setError(null);
        if (next.status === "done" || next.status === "cancelled") stopped = true;
      } catch {
        if (!stopped) setError("수집기와 연결이 끊겼습니다. 수집기가 실행 중인지 확인하세요.");
      }
    }
    void poll();
    const timer = setInterval(() => {
      if (!stopped) void poll();
    }, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [jobId]);

  function reset() {
    setView({ kind: "setup" });
    setJob(null);
    setBusy(false);
    setError(null);
    setApplied(null);
    setPending([]);
  }

  function close() {
    reset();
    onClose();
  }

  function toggleEngine(id: CollectorEngine) {
    setEngines((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** 수집기 확인 → 문제가 없으면 수집 명령. */
  const start = useCallback(async () => {
    setBusy(true);
    setError(null);
    const status = await getAgentStatus();
    const problem: Problem | null = !status
      ? "unreachable"
      : compareVersions(status.version, MIN_COLLECTOR_VERSION) < 0
        ? "outdated"
        : !status.chrome
          ? "no_chrome"
          : null;
    if (problem) {
      setView({ kind: "problem", problem, status });
      setBusy(false);
      return;
    }
    try {
      const created = await createAgentJob(keywords, [...engines], orgName);
      setJob(created);
      setView({ kind: "job", jobId: created.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : "수집을 시작하지 못했습니다.");
    }
    setBusy(false);
  }, [keywords, engines, orgName]);

  async function cancel() {
    if (!job) return;
    setBusy(true);
    await cancelAgentJob(job.id).catch((e) => setError(e instanceof Error ? e.message : "중단하지 못했습니다."));
    setBusy(false);
  }

  /** 반영 — 수집기에서 결과를 받아 서버에 저장하고, 수집기에 반영했다고 표시한다. */
  async function apply() {
    if (!job) return;
    setBusy(true);
    setError(null);
    try {
      const runs = await getAgentResults(job.id);
      if (runs.length === 0) throw new Error("반영할 수집 결과가 없습니다.");
      for (let i = 0; i < runs.length; i += IMPORT_CHUNK) {
        const res = await fetch("/api/collection-runs/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ runs: runs.slice(i, i + IMPORT_CHUNK) }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error ?? "반영하지 못했습니다.");
      }
      await markAgentJobApplied(job.id);
      setJob({ ...job, appliedAt: new Date().toISOString() });
      setApplied(runs.length);
      onDone?.();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "반영하지 못했습니다.");
    }
    setBusy(false);
  }

  const title = view.kind === "job" ? "수집 진행" : view.kind === "problem" ? "수집기 확인" : "선택한 프롬프트 수집";

  return (
    <Modal open={open} onClose={close}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-neutral-900">{title}</h2>
        <ModalCloseButton onClose={close} />
      </div>

      {view.kind === "setup" && (
        <div className="mt-2 flex flex-col gap-4">
          <p className="text-sm text-neutral-500">
            선택한 {keywords.length}개 프롬프트를 이 PC의 수집기가 Chrome으로 순서대로 수집합니다. 끝나면 결과를 확인하고 반영하세요.
          </p>
          {pending.length > 0 && (
            <div className="flex flex-col gap-1.5 rounded-md border border-sky-100 bg-sky-50 p-3">
              <p className="text-xs font-medium text-sky-900">이 PC에 반영하지 않은 수집이 있습니다</p>
              {pending.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setJob(p);
                    setView({ kind: "job", jobId: p.id });
                  }}
                  className="flex items-center justify-between gap-2 rounded px-2 py-1 text-left text-xs text-sky-800 hover:bg-sky-100 cursor-pointer"
                >
                  <span className="truncate">
                    {p.items[0]?.keyword}
                    {p.items.length > 1 ? ` 외 ${p.items.length - 1}개` : ""} · {p.label || "조직 미상"}
                  </span>
                  <span className="shrink-0 font-medium">{p.status === "running" || p.status === "queued" ? "진행 중" : "확인하기"}</span>
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-neutral-500">엔진</span>
            <div className="flex h-10 items-center gap-4">
              {ENGINE_OPTIONS.map((opt) => (
                <label key={opt.id} className="flex items-center gap-1.5 text-sm text-neutral-700 cursor-pointer">
                  <input type="checkbox" checked={engines.has(opt.id)} onChange={() => toggleEngine(opt.id)} className="size-4 accent-slate-800" />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>
          <div className="max-h-40 overflow-y-auto rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-600">
            {keywords.map((k) => (
              <div key={k} className="truncate py-0.5">
                {k}
              </div>
            ))}
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>
              취소
            </Button>
            <Button variant="primary" disabled={engines.size === 0 || keywords.length === 0 || busy} onClick={start}>
              {busy ? "수집기 확인 중…" : "수집 시작"}
            </Button>
          </div>
        </div>
      )}

      {view.kind === "problem" && (
        <CollectorProblem
          problem={view.problem}
          status={view.status}
          downloadPlatforms={downloadPlatforms}
          busy={busy}
          onRetry={start}
          onBack={() => setView({ kind: "setup" })}
        />
      )}

      {view.kind === "job" && job && (
        <JobView job={job} orgName={orgName} busy={busy} error={error} applied={applied} onCancel={cancel} onApply={apply} onClose={close} />
      )}
      {view.kind === "job" && !job && (
        <div className="mt-6 flex justify-center">
          <Loader2 size={20} className="animate-spin text-neutral-400" />
        </div>
      )}
    </Modal>
  );
}

function CollectorProblem({
  problem,
  status,
  downloadPlatforms,
  busy,
  onRetry,
  onBack,
}: {
  problem: Problem;
  status: CollectorAgentStatus | null;
  downloadPlatforms: CollectorPlatform[];
  busy: boolean;
  onRetry: () => void;
  onBack: () => void;
}) {
  const [platform, setPlatform] = useState<CollectorPlatform | null | undefined>(undefined);
  useEffect(() => {
    detectCollectorPlatform().then(setPlatform);
  }, []);

  if (problem === "no_chrome") {
    return (
      <div className="mt-2 flex flex-col gap-4">
        <p className="text-sm text-neutral-600">
          수집기는 실행 중이지만 이 PC에서 Google Chrome을 찾지 못했습니다. 네이버·구글 수집은 실제 Chrome 창으로 진행되므로 Chrome을 설치한 뒤 다시 확인하세요.
        </p>
        <ProblemActions busy={busy} onRetry={onRetry} onBack={onBack} />
      </div>
    );
  }

  const isMac = platform === null ? /Macintosh|Mac OS X/i.test(typeof navigator === "undefined" ? "" : navigator.userAgent) : platform?.startsWith("mac");
  const primary: CollectorPlatform[] = platform ? [platform] : isMac ? ["mac-arm64", "mac-x64"] : [];
  const others = ALL_PLATFORMS.filter((p) => !primary.includes(p));
  const safari = typeof navigator !== "undefined" && /Safari/i.test(navigator.userAgent) && !/Chrome|Chromium|Edg/i.test(navigator.userAgent);

  return (
    <div className="mt-2 flex flex-col gap-4">
      <p className="text-sm text-neutral-600">
        {problem === "outdated"
          ? `이 PC의 수집기(${status?.version})가 오래됐습니다. 새 버전을 받아 다시 설치하세요 — 수집 결과와 설정은 유지됩니다.`
          : "이 PC에서 수집기를 찾지 못했습니다. 수집기를 설치하면 이 창에서 바로 수집을 시킬 수 있습니다. 이미 설치했다면 PC를 다시 켰거나 수집기가 꺼진 상태일 수 있습니다 — 설치 파일을 한 번 더 실행하면 다시 켜집니다."}
      </p>

      <div className="flex flex-wrap gap-2">
        {primary.map((p) => (
          <DownloadButton key={p} platform={p} available={downloadPlatforms.includes(p)} primary />
        ))}
        {others.map((p) => (
          <DownloadButton key={p} platform={p} available={downloadPlatforms.includes(p)} />
        ))}
      </div>

      <ol className="flex list-decimal flex-col gap-1 rounded-md bg-neutral-50 py-3 pr-3 pl-8 text-xs text-neutral-600">
        {isMac ? (
          <>
            <li>받은 zip 파일을 더블클릭해 압축을 풉니다.</li>
            <li>
              폴더 안의 <b>install.command</b>를 더블클릭합니다. 아래 창이 뜨면 <b>완료</b>를 누릅니다(휴지통으로 이동은 누르지 마세요).
              <GuideImage src="mac-1-blocked" alt="install.command 열지 않음 창" width={230} />
            </li>
            <li>
              <b>시스템 설정 → 개인정보 보호 및 보안</b>을 열고 <b>맨 아래로 스크롤</b>하면 나오는 &quot;install.command&quot; 항목에서 <b>그래도 열기</b>를
              누릅니다.
              <GuideImage src="mac-2-settings" alt="개인정보 보호 및 보안의 그래도 열기 버튼" width={380} />
            </li>
            <li>
              다시 확인 창이 뜨면 <b>그래도 열기</b>를 누르고 Mac 암호를 입력합니다. 터미널이 열리며 설치가 진행됩니다.
              <GuideImage src="mac-3-confirm" alt="열겠습니까 확인 창" width={230} />
            </li>
            <li>터미널에 &quot;설치 완료&quot;가 보이면 아래 &quot;다시 확인&quot;을 누릅니다.</li>
          </>
        ) : (
          <>
            <li>받은 zip 파일을 우클릭 → &quot;압축 풀기&quot;로 풉니다.</li>
            <li>
              폴더 안의 <b>install.cmd</b>를 더블클릭합니다(보호 창이 뜨면 &quot;추가 정보 → 실행&quot;).
            </li>
            <li>&quot;설치 완료&quot;가 보이면 아래 &quot;다시 확인&quot;을 누릅니다.</li>
          </>
        )}
        <li>설치 후에는 PC를 켤 때마다 수집기가 자동으로 실행됩니다.</li>
      </ol>

      <p className="text-[11px] text-neutral-500">
        {safari
          ? "Safari에서는 PC의 수집기에 연결할 수 없습니다. Chrome에서 이 화면을 열어 주세요."
          : "브라우저가 \"로컬 네트워크의 기기에 접근\" 권한을 물으면 허용을 눌러 주세요."}
      </p>

      <ProblemActions busy={busy} onRetry={onRetry} onBack={onBack} />
    </div>
  );
}

function GuideImage({ src, alt, width }: { src: string; alt: string; width: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 안내용 고정 스크린샷, 최적화 불필요
    <img src={`/collector-guide/${src}.png`} alt={alt} width={width} className="mt-1.5 max-w-full rounded-md border border-neutral-200" />
  );
}

function DownloadButton({ platform, available, primary = false }: { platform: CollectorPlatform; available: boolean; primary?: boolean }) {
  const className = primary
    ? "inline-flex h-10 items-center gap-1.5 rounded-md bg-slate-800 px-4 text-sm font-bold text-white hover:opacity-90"
    : "inline-flex h-9 items-center gap-1.5 rounded-md border border-neutral-200 px-3 text-xs text-neutral-600 hover:bg-neutral-50";
  if (!available) {
    return (
      <span className={`${className} cursor-not-allowed opacity-40`} title="설치 파일 준비 중">
        <Download size={primary ? 16 : 13} /> {COLLECTOR_PLATFORM_LABEL[platform]}
      </span>
    );
  }
  return (
    <a href={`/api/collector-download?platform=${platform}`} className={className}>
      <Download size={primary ? 16 : 13} /> {primary ? `수집기 받기 · ${COLLECTOR_PLATFORM_LABEL[platform]}` : COLLECTOR_PLATFORM_LABEL[platform]}
    </a>
  );
}

function ProblemActions({ busy, onRetry, onBack }: { busy: boolean; onRetry: () => void; onBack: () => void }) {
  return (
    <div className="flex justify-end gap-2">
      <Button variant="secondary" onClick={onBack}>
        뒤로
      </Button>
      <Button variant="primary" icon={<RefreshCw size={14} />} disabled={busy} onClick={onRetry}>
        {busy ? "확인 중…" : "다시 확인"}
      </Button>
    </div>
  );
}

function JobView({
  job,
  orgName,
  busy,
  error,
  applied,
  onCancel,
  onApply,
  onClose,
}: {
  job: CollectorJob;
  orgName: string;
  busy: boolean;
  error: string | null;
  applied: number | null;
  onCancel: () => void;
  onApply: () => void;
  onClose: () => void;
}) {
  const active = job.status === "queued" || job.status === "running";
  const finished = job.items.filter((it) => it.status === "done" || it.status === "error" || it.status === "cancelled").length;
  const results = job.items.reduce((sum, it) => sum + it.results, 0);
  const failed = job.items.filter((it) => it.status === "error").length;
  const otherOrg = job.label && job.label !== orgName;

  return (
    <div className="mt-2 flex flex-col gap-3">
      <p className="text-sm text-neutral-500">
        {active
          ? "이 PC의 수집기가 Chrome으로 수집 중입니다. 창을 닫아도 수집은 계속되고, 다시 열면 이어서 확인할 수 있습니다."
          : job.appliedAt
            ? "반영이 끝났습니다."
            : `수집이 ${job.status === "cancelled" ? "중단됐습니다" : "끝났습니다"}. 결과를 확인하고 반영하세요.`}
      </p>
      <p className="text-xs font-medium text-neutral-500">
        {finished} / {job.items.length} 완료 · 저장된 결과 {results}건{failed > 0 ? ` · 실패 ${failed}개` : ""}
      </p>

      <div className="flex max-h-64 flex-col gap-1.5 overflow-y-auto">
        {job.items.map((it, index) => (
          <div key={`${index}-${it.keyword}`} className="flex items-center gap-2.5 rounded-md border border-neutral-100 px-3 py-2 text-sm">
            {it.status === "done" ? (
              <CircleCheck size={16} className="shrink-0 text-emerald-500" />
            ) : it.status === "error" ? (
              <TriangleAlert size={16} className="shrink-0 text-red-500" />
            ) : it.status === "cancelled" ? (
              <Ban size={16} className="shrink-0 text-neutral-400" />
            ) : it.status === "running" ? (
              <Loader2 size={16} className="shrink-0 animate-spin text-slate-600" />
            ) : (
              <span className="size-4 shrink-0 rounded-full border-2 border-neutral-200" />
            )}
            <span className="min-w-0 flex-1 truncate text-neutral-800">{it.keyword}</span>
            <span className="shrink-0 text-[11px] text-neutral-400">
              {it.status === "running"
                ? `${it.engine ? ENGINE_LABEL[it.engine] : ""} 수집 중`
                : it.status === "error"
                  ? it.error ?? "실패"
                  : it.status === "cancelled"
                    ? "중단됨"
                    : it.status === "done"
                      ? `결과 ${it.results}건`
                      : "대기"}
            </span>
          </div>
        ))}
      </div>

      {!active && !job.appliedAt && results > 0 && (
        <p className="rounded-md bg-neutral-50 p-3 text-xs text-neutral-600">
          <b>{orgName}</b> 조직에 {results}건을 반영합니다. 실패한 수집도 실패 기록으로 남습니다.
          {otherOrg && <span className="mt-1 block text-amber-700">이 수집은 &quot;{job.label}&quot; 조직 화면에서 시작했습니다. 지금 조직이 맞는지 확인하세요.</span>}
        </p>
      )}
      {applied !== null && <p className="rounded-md bg-emerald-50 p-3 text-xs text-emerald-800">{applied}건을 반영했습니다. 수집 로그와 가시성 화면에 반영됩니다.</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        {active ? (
          <>
            <Button variant="secondary" onClick={onCancel} disabled={busy}>
              수집 중단
            </Button>
            <Button variant="primary" onClick={onClose}>
              닫기
            </Button>
          </>
        ) : job.appliedAt ? (
          <Button variant="primary" icon={<Check size={14} />} onClick={onClose}>
            확인
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              나중에
            </Button>
            <Button variant="primary" icon={<UploadCloud size={14} />} disabled={busy || results === 0} onClick={onApply}>
              {busy ? "반영 중…" : "반영"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
