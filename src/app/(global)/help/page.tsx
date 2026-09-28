import Link from "next/link";
import { ArrowRight, Compass } from "lucide-react";
import { db } from "@/lib/db";

export default async function HelpPage() {
  const [articles, roadmap] = await Promise.all([db.help.articles(), db.help.roadmap()]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-10 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">도움말 및 학습</h1>
        <p className="mt-1 text-sm text-neutral-500">네오디오 사용법을 익히고, 앞으로 어떤 기능이 추가될 예정인지 확인하세요.</p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-bold text-neutral-900">가이드</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((a) => (
            <Link
              key={a.slug}
              href={`/help/${a.slug}`}
              className="flex flex-col gap-2 rounded-xl border border-neutral-200 bg-white p-5 transition-colors hover:border-neutral-300 hover:bg-neutral-50"
            >
              <span className="w-fit rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700">{a.category}</span>
              <h3 className="text-sm font-bold text-neutral-900">{a.title}</h3>
              <p className="flex-1 text-xs text-neutral-500">{a.summary}</p>
              <span className="flex items-center gap-1 text-[11px] font-bold text-slate-600">
                자세히 보기 <ArrowRight size={12} />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Compass size={18} className="text-neutral-500" />
          <h2 className="text-base font-bold text-neutral-900">앞으로 추가될 기능 (로드맵)</h2>
        </div>
        <p className="text-xs text-neutral-500">
          아래 기능들은 지금은 준비 중이며, 명시된 외부 연동/구축이 끝나면 순서대로 열립니다. 데모에서 "이건 지금 안 되지만 이걸 붙이면 이렇게 됩니다"를 설명할 때 참고하세요.
        </p>
        <div className="flex flex-col gap-4">
          {roadmap.map((group) => (
            <div key={group.id} className="rounded-xl border border-neutral-200 bg-white p-5">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-neutral-900">{group.trigger}</h3>
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">준비 중</span>
              </div>
              <p className="mt-1 text-xs text-neutral-500">{group.description}</p>
              <ul className="mt-3 flex flex-col gap-2.5">
                {group.items.map((item) => (
                  <li key={item.id} className="rounded-lg bg-neutral-50 p-3">
                    <p className="text-[13px] font-bold text-neutral-800">{item.title}</p>
                    <p className="mt-1 text-xs text-neutral-500">{item.description}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
