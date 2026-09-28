"use client";

import { FormEvent, useState } from "react";
import { CheckCircle2, SquarePlay, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { BrandYoutubeChannel } from "@/lib/db";

// 연결 관리의 "YouTube 채널" 카드 — YouTube AIO 인용 페이지의 필수 연동.
// 등록된 채널 ID가 곧 "우리 채널 영상" 판정 기준이라, 입력값을 그대로
// 저장하지 않고 서버에서 실제 채널을 조회해 ID·이름을 확인시킨 뒤 저장한다.
// id="youtube"는 YouTube AIO 인용 페이지의 "연동하러 가기" 링크(#youtube)가
// 이 카드로 바로 스크롤되도록.
export function YoutubeChannelsCard({ brandId, initialChannels }: { brandId: string; initialChannels: BrandYoutubeChannel[] }) {
  const [channels, setChannels] = useState(initialChannels);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd(event: FormEvent) {
    event.preventDefault();
    if (!input.trim()) return;
    setPending(true);
    setError(null);
    const res = await fetch(`/api/brands-management/brands/${brandId}/youtube-channels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    setPending(false);
    if (!res?.ok) {
      setError(data?.error ?? "채널을 추가하지 못했습니다.");
      return;
    }
    setChannels(data.channels);
    setInput("");
  }

  async function handleRemove(channelId: string) {
    const res = await fetch(`/api/brands-management/brands/${brandId}/youtube-channels?channelId=${encodeURIComponent(channelId)}`, {
      method: "DELETE",
    }).catch(() => null);
    if (res?.ok) setChannels((await res.json()).channels);
  }

  return (
    <Card id="youtube" className="flex scroll-mt-6 flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SquarePlay size={18} className="text-neutral-500" />
          <h2 className="text-base font-bold text-neutral-900">YouTube 채널</h2>
        </div>
        {channels.length > 0 && (
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
            <CheckCircle2 size={14} />
            {channels.length}개 연결됨
          </span>
        )}
      </div>
      <p className="text-sm text-neutral-500">
        Google AI Overview에 인용된 YouTube 영상이 이 채널의 영상인지 판정할 때 씁니다. 채널을 바꾸면 다음 수집부터 반영됩니다.
      </p>

      {channels.length > 0 && (
        <ul className="flex flex-col divide-y divide-neutral-100 rounded-lg border border-neutral-200">
          {channels.map((channel) => (
            <li key={channel.channelId} className="flex items-center gap-3 px-4 py-3">
              {channel.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- 외부 YouTube 썸네일, next/image 도메인 설정 없이 그대로 표시
                <img src={channel.thumbnailUrl} alt="" className="size-9 shrink-0 rounded-full bg-neutral-100 object-cover" />
              ) : (
                <div className="size-9 shrink-0 rounded-full bg-neutral-100" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-neutral-900">{channel.title}</p>
                <p className="truncate text-xs text-neutral-500">
                  {channel.handle ? `${channel.handle} · ` : ""}
                  {channel.channelId}
                </p>
              </div>
              <button
                type="button"
                aria-label={`${channel.title} 채널 삭제`}
                onClick={() => handleRemove(channel.channelId)}
                className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 cursor-pointer"
              >
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleAdd} className="flex items-start gap-2">
        <div className="flex flex-1 flex-col gap-1.5">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="https://www.youtube.com/@salesforce, @핸들 또는 UC… 채널 ID"
            className="h-10 w-full rounded-md border border-neutral-300 px-3 text-sm"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <Button type="submit" variant="primary" disabled={pending || !input.trim()}>
          {pending ? "조회 중…" : "채널 추가"}
        </Button>
      </form>
    </Card>
  );
}
