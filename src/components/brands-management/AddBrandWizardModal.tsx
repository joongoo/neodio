"use client";

import { useState } from "react";
import { Modal, ModalCloseButton } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { ManagedBrand } from "@/lib/db";

const STEPS = ["기본 정보", "URL", "상세 정보", "검토"] as const;
const MARKET_OPTIONS = ["한국", "미국", "영국", "독일", "전세계"];

interface WizardState {
  name: string;
  markets: string[];
  url: string;
  sitemapUrl: string;
  description: string;
  industry: string;
}

const EMPTY_STATE: WizardState = { name: "", markets: [], url: "", sitemapUrl: "", description: "", industry: "" };

// Matches Figma "Modal / Add a Brand — 4단계 마법사" (doc §21). New brands
// land as `pending` — the doc confirms pending→active happens automatically
// once domain onboarding completes, which is out of scope for this mock.
export function AddBrandWizardModal({
  open,
  onClose,
  onAdd,
  saving = false,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (brand: Omit<ManagedBrand, "id">) => void | Promise<void>;
  /** true인 동안 "브랜드 추가" 버튼을 비활성화한다 — 서버에 저장하는 동안 중복 제출 방지. */
  saving?: boolean;
}) {
  const [step, setStep] = useState(0);
  const [state, setState] = useState<WizardState>(EMPTY_STATE);

  function close() {
    setStep(0);
    setState(EMPTY_STATE);
    onClose();
  }

  function toggleMarket(market: string) {
    setState((s) => ({
      ...s,
      markets: s.markets.includes(market) ? s.markets.filter((m) => m !== market) : [...s.markets, market],
    }));
  }

  const canProceed = [
    state.name.trim().length > 0 && state.markets.length > 0,
    state.url.trim().length > 0,
    true,
    true,
  ][step];

  async function submit() {
    await onAdd({
      name: state.name.trim(),
      url: state.url.trim(),
      sitemapUrl: state.sitemapUrl.trim(),
      description: state.description.trim(),
      industry: state.industry.trim(),
      markets: state.markets,
      status: "pending",
      aliases: [],
      otherBrands: [],
      urls: [],
      socialAccounts: [],
      earnedContentSources: [],
      cdnConnected: false,
      gscConnected: false,
      analyticsConnected: false,
    });
    close();
  }

  return (
    <Modal open={open} onClose={close}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-neutral-900">브랜드 추가</h2>
        <ModalCloseButton onClose={close} />
      </div>

      <div className="mt-3 flex items-center gap-2">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <span
              className={`grid size-6 place-items-center rounded-full text-[11px] font-bold ${
                i === step ? "bg-slate-800 text-white" : i < step ? "bg-slate-200 text-slate-600" : "bg-neutral-100 text-neutral-400"
              }`}
            >
              {i + 1}
            </span>
            <span className={`text-xs ${i === step ? "font-bold text-neutral-900" : "text-neutral-400"}`}>{label}</span>
            {i < STEPS.length - 1 && <span className="mx-1 h-px w-4 bg-neutral-200" />}
          </div>
        ))}
      </div>

      <div className="mt-5 flex min-h-[180px] flex-col gap-4">
        {step === 0 && (
          <>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-neutral-600">브랜드 이름 *</span>
              <input
                value={state.name}
                onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))}
                className="h-10 w-full rounded-md border border-neutral-300 px-3 text-sm"
                placeholder="예: Growth Collective"
                autoFocus
              />
            </label>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-neutral-600">마켓 * (최소 1개)</span>
              <div className="flex flex-wrap gap-2">
                {MARKET_OPTIONS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => toggleMarket(m)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium cursor-pointer ${
                      state.markets.includes(m)
                        ? "border-slate-800 bg-slate-800 text-white"
                        : "border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-50"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-neutral-600">기본 URL *</span>
              <input
                value={state.url}
                onChange={(e) => setState((s) => ({ ...s, url: e.target.value }))}
                className="h-10 w-full rounded-md border border-neutral-300 px-3 text-sm"
                placeholder="https://example.com"
                autoFocus
              />
              <span className="text-[11px] text-neutral-400">이 URL로 도메인 온보딩이 시작됩니다.</span>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-neutral-600">사이트맵 URL</span>
              <input
                value={state.sitemapUrl}
                onChange={(e) => setState((s) => ({ ...s, sitemapUrl: e.target.value }))}
                className="h-10 w-full rounded-md border border-neutral-300 px-3 text-sm"
                placeholder="https://example.com/sitemap.xml"
              />
              <span className="text-[11px] text-neutral-400">
                입력하면 브랜드 상세 페이지에서 이 사이트맵 기준으로 콘텐츠 가시성 크롤을 실행할 수 있습니다.
              </span>
            </label>
          </>
        )}

        {step === 2 && (
          <>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-neutral-600">업종</span>
              <input
                value={state.industry}
                onChange={(e) => setState((s) => ({ ...s, industry: e.target.value }))}
                className="h-10 w-full rounded-md border border-neutral-300 px-3 text-sm"
                placeholder="예: B2B SaaS"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-neutral-600">설명</span>
              <textarea
                value={state.description}
                onChange={(e) => setState((s) => ({ ...s, description: e.target.value }))}
                rows={3}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
            </label>
          </>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-2 rounded-md bg-neutral-50 p-4 text-sm">
            <ReviewRow label="브랜드 이름" value={state.name || "—"} />
            <ReviewRow label="마켓" value={state.markets.join(", ") || "—"} />
            <ReviewRow label="URL" value={state.url || "—"} />
            <ReviewRow label="사이트맵 URL" value={state.sitemapUrl || "—"} />
            <ReviewRow label="업종" value={state.industry || "—"} />
            <ReviewRow label="설명" value={state.description || "—"} />
            <p className="mt-1 text-[11px] text-neutral-400">
              추가 후 도메인 온보딩이 완료되면 자동으로 활성 브랜드로 전환됩니다. 그 전까지는 대기 중 상태로 표시됩니다.
            </p>
          </div>
        )}
      </div>

      <div className="mt-2 flex justify-between">
        <Button variant="secondary" onClick={() => (step === 0 ? close() : setStep((s) => s - 1))}>
          {step === 0 ? "취소" : "이전"}
        </Button>
        {step < STEPS.length - 1 ? (
          <Button variant="primary" disabled={!canProceed} onClick={() => setStep((s) => s + 1)}>
            다음
          </Button>
        ) : (
          <Button variant="primary" disabled={saving} onClick={submit}>
            {saving ? "추가하는 중..." : "브랜드 추가"}
          </Button>
        )}
      </div>
    </Modal>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-xs text-neutral-500">{label}</span>
      <span className="text-right text-xs font-medium text-neutral-800">{value}</span>
    </div>
  );
}
