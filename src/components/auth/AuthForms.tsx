"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";

const inputClass = "h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-800 outline-none focus:border-slate-500";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-neutral-500">{label}</span>
      {children}
    </label>
  );
}

function Panel({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-7 shadow-sm">
      <h1 className="text-lg font-bold text-neutral-900">{title}</h1>
      {description && <p className="mt-1 text-sm text-neutral-500">{description}</p>}
      <div className="mt-5">{children}</div>
    </div>
  );
}

// 로그인 뒤 돌아갈 주소 — 이 앱 안의 상대 경로만 허용한다(다른 사이트로 보내는 링크 방지).
function safeNext(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

async function send(method: string, url: string, body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { ok: res.ok, data: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

async function post(url: string, body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { ok: res.ok, data: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

export function LoginForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { ok, data } = await post("/api/auth/login", { email, password });
    setBusy(false);
    if (!ok) return setError(String(data.error ?? "로그인에 실패했어요."));
    // 임시 비밀번호로 처음 들어온 사람은 비밀번호부터 바꾼다.
    if (data.mustChangePassword) return router.replace(`/account?force=1&next=${encodeURIComponent(next)}`);
    router.replace(data.pending ? "/pending" : next);
    router.refresh();
  }

  return (
    <Panel title="로그인">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="이메일">
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </Field>
        <Field label="비밀번호">
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
        </Field>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "로그인 중..." : "로그인"}
        </Button>
      </form>
      <p className="mt-4 text-center text-xs text-neutral-500">
        계정이 없나요? <Link href="/signup" className="font-medium text-slate-800 underline">가입하기</Link>
      </p>
      <p className="mt-2 text-center text-[11px] text-neutral-400">비밀번호를 잊었다면 조직 오너에게 임시 비밀번호를 요청하세요.</p>
    </Panel>
  );
}

export function SignupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) return setError("비밀번호가 서로 달라요.");
    setBusy(true);
    setError(null);
    const { ok, data } = await post("/api/auth/signup", { name, email, password });
    setBusy(false);
    if (!ok) return setError(String(data.error ?? "가입에 실패했어요."));
    router.replace("/pending");
    router.refresh();
  }

  return (
    <Panel title="가입하기" description="가입 후에는 조직 오너가 권한을 할당해야 화면을 볼 수 있어요.">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="이름">
          <input autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </Field>
        <Field label="이메일">
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </Field>
        <Field label="비밀번호 (8자 이상)">
          <input type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
        </Field>
        <Field label="비밀번호 확인">
          <input type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass} />
        </Field>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "가입 중..." : "가입하기"}
        </Button>
      </form>
      <p className="mt-4 text-center text-xs text-neutral-500">
        이미 계정이 있나요? <Link href="/login" className="font-medium text-slate-800 underline">로그인</Link>
      </p>
    </Panel>
  );
}

export function LogoutButton({ variant = "secondary" }: { variant?: "primary" | "secondary" }) {
  const router = useRouter();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }
  return (
    <Button type="button" variant={variant} onClick={logout}>
      로그아웃
    </Button>
  );
}

export function PendingPanel({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  return (
    <Panel title="권한 할당을 기다리고 있어요" description={`${name} (${email}) 계정으로 가입됐어요.`}>
      <p className="text-sm text-neutral-600">조직 오너 또는 네오다임 담당자가 역할과 볼 수 있는 브랜드를 할당하면 화면을 이용할 수 있어요. 할당이 끝나면 다시 로그인하거나 새로고침해 주세요.</p>
      <div className="mt-5 flex gap-2">
        <Button type="button" variant="primary" onClick={() => router.replace("/")}>
          새로고침
        </Button>
        <LogoutButton />
      </div>
    </Panel>
  );
}

export function AccountForm({ name, email, forced }: { name: string; email: string; forced: boolean }) {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [current, setCurrent] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const [nameInput, setNameInput] = useState(name);
  const [savedName, setSavedName] = useState(name);
  const [nameMsg, setNameMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [nameBusy, setNameBusy] = useState(false);

  async function saveName(e: FormEvent) {
    e.preventDefault();
    setNameBusy(true);
    setNameMsg(null);
    const { ok, data } = await send("PATCH", "/api/auth/profile", { name: nameInput });
    setNameBusy(false);
    if (!ok) return setNameMsg({ ok: false, text: String(data.error ?? "저장하지 못했어요.") });
    setSavedName(String(data.name));
    setNameMsg({ ok: true, text: "이름을 바꿨어요." });
    router.refresh();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (nextPassword !== confirm) return setError("새 비밀번호가 서로 달라요.");
    setBusy(true);
    setError(null);
    const { ok, data } = await post("/api/auth/change-password", { current, next: nextPassword });
    setBusy(false);
    if (!ok) return setError(String(data.error ?? "변경에 실패했어요."));
    setDone(true);
    setCurrent("");
    setNextPassword("");
    setConfirm("");
    if (forced) {
      router.replace(next);
      router.refresh();
    }
  }

  return (
    <Panel
      title={forced ? "비밀번호를 먼저 바꿔 주세요" : "내 계정"}
      description={forced ? "임시 비밀번호로 로그인했어요. 새 비밀번호를 정해야 계속 쓸 수 있어요." : `${savedName} · ${email}`}
    >
      {!forced && (
        <form onSubmit={saveName} className="mb-5 flex flex-col gap-3 border-b border-neutral-100 pb-5">
          <Field label="이름">
            <input required maxLength={50} value={nameInput} onChange={(e) => setNameInput(e.target.value)} className={inputClass} />
          </Field>
          <p className="text-[11px] text-neutral-400">이메일({email})은 로그인 ID라 바꿀 수 없어요.</p>
          {nameMsg && <p className={`text-xs ${nameMsg.ok ? "text-emerald-600" : "text-red-600"}`}>{nameMsg.text}</p>}
          <Button type="submit" variant="primary" disabled={nameBusy || nameInput.trim() === savedName}>
            {nameBusy ? "저장 중..." : "이름 저장"}
          </Button>
        </form>
      )}
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="현재 비밀번호">
          <input type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} className={inputClass} />
        </Field>
        <Field label="새 비밀번호 (8자 이상)">
          <input type="password" autoComplete="new-password" required minLength={8} value={nextPassword} onChange={(e) => setNextPassword(e.target.value)} className={inputClass} />
        </Field>
        <Field label="새 비밀번호 확인">
          <input type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass} />
        </Field>
        {error && <p className="text-xs text-red-600">{error}</p>}
        {done && !forced && <p className="text-xs text-emerald-600">비밀번호를 바꿨어요. 다른 기기의 로그인은 모두 해제됐어요.</p>}
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "변경 중..." : "비밀번호 변경"}
        </Button>
      </form>
      {!forced && (
        <div className="mt-5 flex items-center justify-between border-t border-neutral-100 pt-4">
          <Link href="/" className="text-xs text-neutral-500 underline">
            돌아가기
          </Link>
          <LogoutButton />
        </div>
      )}
    </Panel>
  );
}
