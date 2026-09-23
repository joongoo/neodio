"use client";

import { useEffect } from "react";

// error.tsx는 루트 레이아웃(TopBar/Sidebar) 자체가 깨지면 못 잡는다 —
// 그 경우를 위한 최상위 경계. 레이아웃도 없이 최소한의 <html>/<body>를
// 직접 그려야 한다 (root layout이 죽은 상태이므로).
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[global-error]", error);
  }, [error]);

  return (
    <html lang="ko">
      <body>
        <div style={{ maxWidth: 420, margin: "80px auto", padding: 24, textAlign: "center", fontFamily: "sans-serif" }}>
          <h1 style={{ fontSize: 18, fontWeight: 600 }}>문제가 발생했어요</h1>
          <p style={{ fontSize: 14, color: "#666", marginTop: 8 }}>
            페이지를 불러오는 중 오류가 났습니다. 잠시 후 다시 시도해주세요.
          </p>
          {error.digest && <p style={{ fontSize: 12, color: "#999", marginTop: 8 }}>참조 코드: {error.digest}</p>}
          <button
            onClick={reset}
            style={{ marginTop: 16, padding: "8px 16px", borderRadius: 8, background: "#171717", color: "#fff", border: "none", cursor: "pointer" }}
          >
            다시 시도
          </button>
        </div>
      </body>
    </html>
  );
}
