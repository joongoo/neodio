"use client";

import { ReactNode, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

// CDN/Analytics는 아직 실제 연동이 없다 — 카드만 먼저 노출하고 "연결"을
// 누르면 준비 중이라는 걸 토스트로 알려준다 (GSC 카드와 같은 자리에 나란히
// 배치해서 향후 실 연동이 붙을 자리를 미리 보여주는 목적).
// icon은 컴포넌트 타입이 아니라 이미 렌더링된 엘리먼트로 받는다 — 서버
// 컴포넌트에서 lucide 아이콘 함수 자체를 그대로 넘기면 "Functions cannot be
// passed directly to Client Components" 에러가 난다.
export function ComingSoonConnectionCard({ title, description, icon }: { title: string; description: string; icon: ReactNode }) {
  const [toast, setToast] = useState(false);

  return (
    <Card className="flex flex-col items-start gap-3">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-base font-bold text-neutral-900">{title}</h2>
      </div>
      <p className="text-sm text-neutral-500">{description}</p>
      <Button
        variant="primary"
        onClick={() => {
          setToast(true);
          window.setTimeout(() => setToast(false), 2500);
        }}
      >
        연결
      </Button>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg">
          준비 중입니다.
        </div>
      )}
    </Card>
  );
}
