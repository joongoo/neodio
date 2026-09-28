"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Plus, Share2, SquarePlay, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal, ModalCloseButton } from "@/components/ui/Modal";
import { BrandYoutubeChannel, SocialAccount } from "@/lib/db";
import { findChannelForSocial, isYoutubeSocial, socialForChannel } from "@/lib/youtubeSocial";

export interface ChannelCitationSummary {
  keywords: number;
  videos: number;
  lastCitedDate: string | null;
}

const PLATFORMS = ["YouTube", "LinkedIn", "X", "Instagram", "Facebook", "기타"];
const BRAND_COOKIE = "selected-brand";

// 브랜드 설정의 "소셜 계정". YouTube 계정은 YouTube AIO 인용 판정용
// 채널(연결 관리의 YouTube 채널 카드와 같은 데이터)로 연결돼, 이 채널
// 영상이 AI Overview에 얼마나 인용되는지 바로 보여주고 인용 현황 화면으로
// 이어준다. 다른 플랫폼은 예전처럼 목록에만 저장한다.
export function SocialAccountsSection({
  brandId,
  brandName,
  brandActive,
  accounts,
  channels,
  citationStats,
  onLocalChange,
  onServerSynced,
}: {
  brandId: string;
  brandName: string;
  brandActive: boolean;
  accounts: SocialAccount[];
  channels: BrandYoutubeChannel[];
  /** channelId → 최근 30일 인용 요약. null이면 아직 수집 기록 없음 */
  citationStats: Record<string, ChannelCitationSummary> | null;
  /** YouTube 외 계정 추가/삭제 — 호출한 쪽이 저장한다 */
  onLocalChange: (accounts: SocialAccount[]) => void;
  /** YouTube 채널 API가 이미 저장한 결과를 화면에 반영 */
  onServerSynced: (accounts: SocialAccount[], channels: BrandYoutubeChannel[]) => void;
}) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function connectYoutube(input: string): Promise<string | null> {
    const res = await fetch(`/api/brands-management/brands/${brandId}/youtube-channels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (!res?.ok) return data?.error ?? "채널을 연결하지 못했습니다.";
    onServerSynced(data.socialAccounts, data.channels);
    return null;
  }

  // 연결 관리에서만 등록돼 소셜 목록에 없는 채널(이 섹션이 생기기 전 데이터 등)도 함께 보여준다.
  const orphanChannels = channels.filter((c) => !accounts.some((a) => findChannelForSocial(a, [c])));
  const rows: { account: SocialAccount; index: number | null }[] = [
    ...accounts.map((account, index) => ({ account, index })),
    ...orphanChannels.map((c) => ({ account: socialForChannel(c), index: null })),
  ];

  async function remove(account: SocialAccount, index: number | null) {
    const channel = findChannelForSocial(account, channels);
    if (!channel) {
      if (index !== null) onLocalChange(accounts.filter((_, i) => i !== index));
      return;
    }
    setBusy(account.handle);
    const res = await fetch(`/api/brands-management/brands/${brandId}/youtube-channels?channelId=${encodeURIComponent(channel.channelId)}`, {
      method: "DELETE",
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    setBusy(null);
    if (res?.ok) onServerSynced(data.socialAccounts, data.channels);
  }

  async function linkExisting(account: SocialAccount) {
    setBusy(account.handle);
    setError(null);
    const message = await connectYoutube(account.handle);
    setBusy(null);
    if (message) setError(`${account.handle}: ${message}`);
  }

  // 인용 현황 화면은 헤더에서 선택한 브랜드 기준 — 스위처와 같은 쿠키로 이 브랜드를 고른 뒤 이동한다.
  function openCitations() {
    document.cookie = `${BRAND_COOKIE}=${encodeURIComponent(brandName)}; path=/; max-age=31536000`;
    router.push("/youtube-aio");
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Share2 size={16} />
          <div>
            <h2 className="text-base font-bold text-neutral-900">소셜 계정</h2>
            <p className="mt-0.5 text-xs text-neutral-500">
              이 브랜드의 공식 소셜 미디어 계정입니다. YouTube 채널을 넣으면 그 채널 영상이 Google AI Overview에 인용되는지 추적합니다.
            </p>
          </div>
        </div>
        <Button variant="secondary" icon={<Plus size={14} />} onClick={() => setAddOpen(true)}>
          추가
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-neutral-400">아직 추가된 항목이 없습니다.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map(({ account, index }) => {
            const youtube = isYoutubeSocial(account);
            const channel = findChannelForSocial(account, channels);
            const stats = channel ? citationStats?.[channel.channelId] : undefined;
            return (
              <li key={`${account.platform}:${account.handle}`} className="flex flex-col gap-1.5 rounded-md bg-neutral-50 px-3 py-2 text-xs text-neutral-700">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    {youtube && <SquarePlay size={13} className="shrink-0 text-neutral-500" />}
                    <span className="truncate">
                      {account.platform}: {channel ? `${channel.title} (${account.handle})` : account.handle}
                    </span>
                  </span>
                  <button
                    type="button"
                    aria-label={`${account.platform} ${account.handle} 삭제`}
                    onClick={() => remove(account, index)}
                    disabled={busy === account.handle}
                    className="shrink-0 cursor-pointer text-neutral-400 hover:text-red-600 disabled:opacity-40"
                  >
                    {busy === account.handle ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
                  </button>
                </div>
                {youtube &&
                  (channel ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-200 pt-1.5">
                      <span className="text-neutral-600">
                        <span className="mr-1.5 rounded-full bg-blue-50 px-2 py-0.5 font-medium text-blue-700">AIO 인용 추적 중</span>
                        {citationStats === null
                          ? "아직 수집 기록이 없습니다"
                          : !stats || stats.keywords === 0
                            ? "최근 30일 인용 없음"
                            : `최근 30일 · 인용 키워드 ${stats.keywords}개 · 영상 ${stats.videos}개 · 마지막 ${stats.lastCitedDate?.slice(5).replace("-", "/")}`}
                      </span>
                      {brandActive ? (
                        <button
                          type="button"
                          onClick={openCitations}
                          className="flex cursor-pointer items-center gap-1 font-medium text-slate-800 hover:opacity-70"
                        >
                          인용 현황 보기 <ArrowRight size={12} />
                        </button>
                      ) : (
                        <span className="text-neutral-400">브랜드를 활성화하면 인용 현황을 볼 수 있습니다</span>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2 border-t border-neutral-200 pt-1.5">
                      <span className="text-neutral-500">AIO 인용 추적에 연결되지 않은 계정입니다.</span>
                      <button
                        type="button"
                        onClick={() => linkExisting(account)}
                        disabled={busy === account.handle}
                        className="cursor-pointer font-medium text-slate-800 hover:opacity-70 disabled:opacity-40"
                      >
                        AIO 추적 연결
                      </button>
                    </div>
                  ))}
              </li>
            );
          })}
        </ul>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}

      <AddSocialModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAddYoutube={connectYoutube}
        onAddOther={(account) => onLocalChange([...accounts, account])}
      />
    </Card>
  );
}

function AddSocialModal({
  open,
  onClose,
  onAddYoutube,
  onAddOther,
}: {
  open: boolean;
  onClose: () => void;
  /** 성공하면 null, 실패하면 오류 문구 */
  onAddYoutube: (input: string) => Promise<string | null>;
  onAddOther: (account: SocialAccount) => void;
}) {
  const [platform, setPlatform] = useState(PLATFORMS[0]);
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const youtube = platform === "YouTube";

  function close() {
    setValue("");
    setError(null);
    onClose();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    if (!youtube) {
      onAddOther({ platform, handle: trimmed });
      close();
      return;
    }
    setPending(true);
    setError(null);
    const message = await onAddYoutube(trimmed);
    setPending(false);
    if (message) setError(message);
    else close();
  }

  return (
    <Modal open={open} onClose={close}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-neutral-900">소셜 계정 추가</h2>
        <ModalCloseButton onClose={close} />
      </div>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-neutral-600">플랫폼</span>
          <select
            value={platform}
            onChange={(e) => {
              setPlatform(e.target.value);
              setError(null);
            }}
            className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm"
          >
            {PLATFORMS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-neutral-600">{youtube ? "채널 주소 또는 @핸들" : "계정"}</span>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={youtube ? "https://www.youtube.com/@salesforce" : "예: neodigm"}
            autoFocus
            className="h-10 w-full rounded-md border border-neutral-300 px-3 text-sm"
          />
          {youtube && (
            <span className="text-xs text-neutral-500">
              실제 채널을 확인한 뒤 저장하고, 이 채널 영상의 Google AI Overview 인용 추적을 시작합니다(연결 관리의 YouTube 채널에도 함께 등록).
            </span>
          )}
        </label>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={close}>
            취소
          </Button>
          <Button type="submit" variant="primary" disabled={pending || !value.trim()}>
            {pending ? "채널 확인 중…" : "추가"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
