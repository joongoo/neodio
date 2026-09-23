"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";

// 렌더링/서버 컴포넌트 에러를 잡는 세그먼트 경계. 이게 없으면 화면이 그냥
// 하얗게 죽거나 Next.js 기본 에러 화면이 뜨고, 원인은 Vercel 런타임 로그를
// 뒤져야만 알 수 있었다 — console.error로 최소한 로그엔 남긴다.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[app-error]", error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 p-16 text-center">
      <h1 className="text-lg font-semibold text-neutral-900">문제가 발생했어요</h1>
      <p className="text-sm text-neutral-500">
        페이지를 불러오는 중 오류가 났습니다. 잠시 후 다시 시도해주세요.
      </p>
      {error.digest && <p className="text-xs text-neutral-400">참조 코드: {error.digest}</p>}
      <Button variant="primary" onClick={reset}>
        다시 시도
      </Button>
    </div>
  );
}
