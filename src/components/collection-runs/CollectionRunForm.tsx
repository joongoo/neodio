"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CollectionProgressModal } from "@/components/collection-runs/CollectionProgressModal";
import { CollectionStage } from "@/lib/backend/collectionJobTypes";

const ENGINE_OPTIONS: { id: "naver" | "google"; label: string }[] = [
  { id: "naver", label: "네이버 AI검색" },
  { id: "google", label: "구글 AI 모드" },
];

interface StatusResponse {
  stage: CollectionStage;
  log: string[];
  error: string | null;
  done: boolean;
}

export function CollectionRunForm() {
  const router = useRouter();
  const [keyword, setKeyword] = useState("");
  const [engines, setEngines] = useState<Set<"naver" | "google">>(new Set(["naver", "google"]));
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function toggleEngine(id: "naver" | "google") {
    setEngines((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  useEffect(() => {
    if (!jobId) return;

    async function poll() {
      const res = await fetch(`/api/collection-runs/status?jobId=${jobId}`);
      if (!res.ok) return;
      const data: StatusResponse = await res.json();
      setStatus(data);
      if (data.done) {
        if (pollRef.current) clearInterval(pollRef.current);
        if (data.stage === "done") router.refresh();
      }
    }

    poll();
    pollRef.current = setInterval(poll, 1500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [jobId, router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = keyword.trim();
    if (!trimmed || engines.size === 0) return;

    setSubmitError(null);
    const res = await fetch("/api/collection-runs/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword: trimmed, engines: Array.from(engines) }),
    });
    const data = await res.json();
    if (!res.ok) {
      setSubmitError(data.error ?? "수집을 시작하지 못했습니다.");
      return;
    }
    setStatus({ stage: "install", log: [], error: null, done: false });
    setJobId(data.jobId);
  }

  function closeModal() {
    setJobId(null);
    setStatus(null);
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5">
      <form onSubmit={submit} className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="collection-keyword" className="text-xs font-medium text-neutral-500">
            키워드
          </label>
          <input
            id="collection-keyword"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="예: 네오다임"
            className="h-10 w-[220px] rounded-md border border-neutral-300 px-3 text-sm text-neutral-800 outline-none focus:border-slate-500"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-neutral-500">엔진</span>
          <div className="flex h-10 items-center gap-4">
            {ENGINE_OPTIONS.map((opt) => (
              <label key={opt.id} className="flex items-center gap-1.5 text-sm text-neutral-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={engines.has(opt.id)}
                  onChange={() => toggleEngine(opt.id)}
                  className="size-4 accent-slate-800"
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>

        <button
          type="submit"
          disabled={!keyword.trim() || engines.size === 0 || (status !== null && !status.done)}
          className="h-10 rounded-md bg-slate-800 px-4 text-sm font-bold text-white cursor-pointer hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          수집
        </button>
      </form>

      {submitError && <p className="mt-2 text-xs text-red-600">{submitError}</p>}

      {status && (
        <CollectionProgressModal
          open={jobId !== null}
          keyword={keyword.trim()}
          engines={Array.from(engines)}
          stage={status.stage}
          log={status.log}
          error={status.error}
          onClose={closeModal}
        />
      )}
    </div>
  );
}
