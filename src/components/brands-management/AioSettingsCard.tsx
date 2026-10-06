"use client";

import { EditOnly, useCanEdit } from "@/components/auth/PermissionsProvider";

import { FormEvent, useState } from "react";
import { Settings2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AioDevice, BrandAioSettings } from "@/lib/db";

const COUNTRIES = [
  { value: "kr", label: "대한민국" },
  { value: "us", label: "미국" },
  { value: "jp", label: "일본" },
];
const LANGUAGES = [
  { value: "ko", label: "한국어" },
  { value: "en", label: "영어" },
  { value: "ja", label: "일본어" },
];
const DEVICES: { value: AioDevice; label: string }[] = [
  { value: "mobile", label: "모바일" },
  { value: "desktop", label: "PC" },
];

// 연결 관리의 "AIO 추적 설정" — 선택 항목. 저장 전에는 기본값(대한민국 ·
// 한국어 · 모바일)으로 수집한다. 수집 조건이 매일 같아야 일자별 비교가
// 의미 있으므로, 바꾸면 그날부터의 추이가 이전과 끊긴다는 점을 안내한다.
export function AioSettingsCard({ brandId, initialSettings }: { brandId: string; initialSettings: BrandAioSettings }) {
  const [settings, setSettings] = useState(initialSettings);
  const canEdit = useCanEdit();
  const [draft, setDraft] = useState(initialSettings);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const dirty =
    draft.country !== settings.country ||
    draft.language !== settings.language ||
    draft.optimizationDate !== settings.optimizationDate ||
    draft.devices.join() !== settings.devices.join();

  function toggleDevice(device: AioDevice) {
    const devices = draft.devices.includes(device) ? draft.devices.filter((d) => d !== device) : [...draft.devices, device];
    setDraft({ ...draft, devices: DEVICES.map((d) => d.value).filter((d) => devices.includes(d)) });
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    const res = await fetch(`/api/brands-management/brands/${brandId}/aio-settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    setPending(false);
    if (!res?.ok) {
      setMessage({ kind: "error", text: data?.error ?? "저장하지 못했습니다." });
      return;
    }
    setSettings(data.settings);
    setDraft(data.settings);
    setMessage({ kind: "ok", text: "저장했습니다. 다음 수집부터 반영됩니다." });
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings2 size={18} className="text-neutral-500" />
          <h2 className="text-base font-bold text-neutral-900">AIO 추적 설정</h2>
        </div>
        {!settings.saved && <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-600">기본값 사용 중</span>}
      </div>
      <p className="text-sm text-neutral-500">
        YouTube AIO 인용 수집 조건입니다. 조건이 매일 같아야 일자별 비교가 의미 있으므로, 변경하면 변경일부터의 추이는 이전과 직접 비교하기 어렵습니다.
      </p>

      <form onSubmit={handleSave} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-neutral-600">국가</span>
            <select disabled={!canEdit}
              value={draft.country}
              onChange={(e) => setDraft({ ...draft, country: e.target.value })}
              className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm"
            >
              {COUNTRIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-neutral-600">언어</span>
            <select disabled={!canEdit}
              value={draft.language}
              onChange={(e) => setDraft({ ...draft, language: e.target.value })}
              className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm"
            >
              {LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-xs font-medium text-neutral-600">디바이스</legend>
          <div className="flex gap-4">
            {DEVICES.map((d) => (
              <label key={d.value} className="flex items-center gap-2 text-sm text-neutral-800">
                <input disabled={!canEdit}
                  type="checkbox"
                  checked={draft.devices.includes(d.value)}
                  onChange={() => toggleDevice(d.value)}
                  className="size-4 cursor-pointer accent-slate-800"
                />
                {d.label}
              </label>
            ))}
          </div>
          <span className="text-xs text-neutral-500">둘 다 선택하면 키워드당 수집 횟수가 두 배가 됩니다.</span>
        </fieldset>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-neutral-600">최적화 기준일 (선택)</span>
          <input disabled={!canEdit}
            type="date"
            value={draft.optimizationDate ?? ""}
            onChange={(e) => setDraft({ ...draft, optimizationDate: e.target.value || null })}
            className="h-10 w-56 rounded-md border border-neutral-300 px-3 text-sm"
          />
          <span className="text-xs text-neutral-500">대시보드 추이 차트의 기준선과 &quot;최적화 전 대비&quot; 비교에 씁니다.</span>
        </label>

        <div className="flex items-center gap-3">
          <EditOnly>
            <Button type="submit" variant="primary" disabled={pending || !dirty || draft.devices.length === 0}>
              {pending ? "저장 중…" : "저장"}
            </Button>
          </EditOnly>
          {message && <span className={message.kind === "ok" ? "text-xs text-emerald-700" : "text-xs text-red-600"}>{message.text}</span>}
        </div>
      </form>
    </Card>
  );
}
