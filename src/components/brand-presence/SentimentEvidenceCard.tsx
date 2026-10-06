"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Sentiment, SentimentEvidence } from "@/lib/db";

const LABEL: Record<Sentiment, string> = { negative: "부정", neutral: "중립", positive: "긍정" };
const TONE: Record<Sentiment, string> = { negative: "text-red-600", neutral: "text-neutral-500", positive: "text-emerald-600" };

// 감성은 긍정·부정 키워드 개수로 판정하는 단순 방식이라, 판정 근거(발췌문+키워드)를 직접 확인해
// 맞는지 검수할 수 있게 한다.
export function SentimentEvidenceCard({ evidence }: { evidence: SentimentEvidence }) {
  const [tab, setTab] = useState<Sentiment>(evidence.counts.negative > 0 ? "negative" : "positive");
  const rows = evidence.rows.filter((r) => r.sentiment === tab);
  return (
    <Card>
      <h2 className="text-base font-bold text-neutral-900">감성 판정 근거</h2>
      <p className="mt-0.5 text-xs text-neutral-500">
        감성은 브랜드 주변 문장에 있는 긍정·부정 단어 개수로 판정해요. 판정에 쓰인 단어와 발췌문을 보고 맞는지 확인하세요.
        {evidence.counts.positive + evidence.counts.negative > 0 && (
          <> 긍정·부정 판정 중 {evidence.weakShare}%는 단어 1개 차이로 갈려 근거가 약해요.</>
        )}
      </p>
      <div className="mt-3 flex gap-2">
        {(["negative", "neutral", "positive"] as Sentiment[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setTab(s)}
            className={`rounded-full border px-3 py-1 text-xs font-medium cursor-pointer ${
              tab === s ? "border-slate-800 bg-slate-800 text-white" : "border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-50"
            }`}
          >
            {LABEL[s]} {evidence.counts[s]}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="mt-4 text-xs text-neutral-400">해당 감성으로 판정된 답변이 없어요.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {rows.map((r) => (
            <li key={r.id} className="rounded-lg border border-neutral-200 p-3">
              <p className="text-xs text-neutral-700">{r.excerpt}</p>
              <p className="mt-2 text-[11px] text-neutral-500">
                <span className={`font-semibold ${TONE[r.sentiment]}`}>{LABEL[r.sentiment]}</span>
                {r.positiveTerms.length > 0 && <> · 긍정 단어: {r.positiveTerms.join(", ")}</>}
                {r.negativeTerms.length > 0 && <> · 부정 단어: {r.negativeTerms.join(", ")}</>}
                {" · "}
                {r.model}
                {r.query && <> · {r.query}</>}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
