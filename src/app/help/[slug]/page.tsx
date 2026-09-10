import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { db } from "@/lib/db";

export default async function HelpArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = await db.help.getArticle(slug);
  if (!article) notFound();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 p-6">
      <Link href="/help" className="flex items-center gap-2 text-[13px] text-neutral-600 hover:text-neutral-900">
        <ArrowLeft size={16} />
        도움말 및 학습으로 돌아가기
      </Link>

      <div>
        <span className="w-fit rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700">{article.category}</span>
        <h1 className="mt-2 text-2xl font-semibold text-neutral-900">{article.title}</h1>
        <p className="mt-1 text-sm text-neutral-500">{article.summary}</p>
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-6">
        {article.content.map((paragraph, i) => (
          <p key={i} className="text-sm leading-relaxed text-neutral-700">
            {paragraph}
          </p>
        ))}
      </div>

      {article.highlights && article.highlights.length > 0 && (
        <div className="rounded-xl bg-blue-50/60 p-5">
          <h2 className="text-[13px] font-bold text-neutral-900">핵심 포인트</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {article.highlights.map((h, i) => (
              <li key={i} className="flex items-start gap-2 text-[13px] text-neutral-700">
                <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-blue-600" />
                {h}
              </li>
            ))}
          </ul>
        </div>
      )}

      {article.relatedHref && (
        <Link
          href={article.relatedHref}
          className="flex w-fit items-center gap-1.5 rounded-md bg-slate-800 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          {article.relatedLabel ?? "화면으로 이동"} <ArrowRight size={14} />
        </Link>
      )}
    </div>
  );
}
