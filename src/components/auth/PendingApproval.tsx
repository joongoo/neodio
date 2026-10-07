"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { LogoutButton } from "@/components/auth/AuthForms";

const POLL_MS = 30_000;

const stepsFor = (reason: "org" | "brand") =>
  [
    { title: "가입 완료", note: "계정이 만들어졌어요" },
    {
      title: "관리자 승인",
      note: reason === "brand" ? "조직은 정해졌어요. 볼 수 있는 브랜드를 할당하고 있어요" : "소속 조직과 역할, 볼 수 있는 브랜드를 정해요",
    },
    { title: "이용 시작", note: "승인되면 바로 화면을 쓸 수 있어요" },
  ] as const;

const timeLabel = (d: Date) => d.toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", second: "2-digit" });

// 가입은 했지만 아직 권한(소속 조직·역할·브랜드)이 할당되지 않은 사람이 보는 "관리자 승인 대기" 화면.
// 30초마다, 그리고 버튼을 누를 때 승인 여부를 확인해 승인되면 바로 서비스로 보낸다.
export function PendingApproval({ name, loginId, reason = "org", contactEmail }: { name: string; loginId: string; reason?: "org" | "brand"; contactEmail?: string }) {
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  const check = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setChecking(true);
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      if (res.status === 401) return router.replace("/login");
      const data = await res.json();
      if (data && data.pending === false) {
        router.replace("/");
        router.refresh();
        return;
      }
      setError(null);
      setLastChecked(new Date());
    } catch {
      setError("승인 상태를 확인하지 못했어요. 네트워크를 확인해 주세요.");
    } finally {
      busy.current = false;
      setChecking(false);
    }
  }, [router]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void check();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [check]);

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-7 shadow-sm">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700">
        <Clock size={12} /> 관리자 승인 대기 중
      </span>
      <h1 className="mt-3 text-lg font-bold text-neutral-900">관리자 승인을 기다리고 있어요</h1>
      <p className="mt-1 text-sm text-neutral-500">
        {name}님({loginId})의 가입이 접수됐어요. 관리자가 권한을 할당하면 서비스를 이용할 수 있어요.
      </p>

      <ol className="mt-5 flex flex-col gap-3">
        {stepsFor(reason).map((step, i) => {
          const done = i === 0;
          const current = i === 1;
          return (
            <li key={step.title} className="flex items-start gap-3">
              <span
                className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
                  done ? "bg-emerald-500 text-white" : current ? "bg-amber-400 text-white" : "bg-neutral-200 text-neutral-500"
                }`}
              >
                {done ? <Check size={12} /> : i + 1}
              </span>
              <span className="flex flex-col">
                <span className={`text-sm font-medium ${done || current ? "text-neutral-900" : "text-neutral-400"}`}>{step.title}</span>
                <span className="text-xs text-neutral-500">{step.note}</span>
              </span>
            </li>
          );
        })}
      </ol>

      <div className="mt-5 rounded-lg bg-neutral-50 p-3 text-xs leading-relaxed text-neutral-600">
        승인은 소속 조직의 오너·admin 또는 네오다임 담당자가 해요. 급하면 담당자에게 위 아이디(<b>{loginId}</b>)로 가입했다고 알려 주세요.
        {contactEmail ? <> 문의: <b>{contactEmail}</b></> : null}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Button type="button" variant="primary" onClick={() => void check()} disabled={checking}>
          {checking ? <Loader2 size={14} className="animate-spin" /> : null}
          승인 상태 확인
        </Button>
        <LogoutButton />
      </div>
      <p className="mt-3 text-[11px] text-neutral-400" role="status">
        {error ?? (lastChecked ? `${timeLabel(lastChecked)} 확인 — 아직 승인 대기 중이에요. 30초마다 자동으로 확인해요.` : "30초마다 자동으로 승인 여부를 확인해요.")}
      </p>
    </div>
  );
}
