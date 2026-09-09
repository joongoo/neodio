"use client";

import { FormEvent, useState } from "react";
import { Download, Upload } from "lucide-react";
import { Modal, ModalCloseButton } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { PromptLibraryRow } from "@/lib/db";
import { CANONICAL_CATEGORIES } from "@/lib/categories";
import { downloadCsv, parseCsv } from "@/lib/csv";

const CATEGORY_OPTIONS = CANONICAL_CATEGORIES;

// 프롬프트 문장이 완전히 같으면(앞뒤 공백/대소문자만 다른 경우 포함) 같은
// 프롬프트로 간주 — 수동 추가/CSV 가져오기 양쪽에서 중복 삽입을 막는 데 쓴다.
function normalizePrompt(prompt: string) {
  return prompt.trim().toLowerCase();
}

// Matches Figma "Modal / Add Prompts", "Modal / Import Prompts", "Modal /
// Edit Prompt" (Prompt Library screen spec, neodigm_screens_documentation.md
// §6). All three write into the in-memory row list the client owns — no
// backend yet, same stage as the rest of this screen.

export function AddPromptModal({
  open,
  onClose,
  onAdd,
  existingPrompts,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (row: Omit<PromptLibraryRow, "id" | "origin">) => void;
  /** 중복 검사 대상 — 이미 라이브러리에 있는 프롬프트 문장 전체. */
  existingPrompts: string[];
}) {
  const [category, setCategory] = useState(CATEGORY_OPTIONS[0]);
  const [subcategory, setSubcategory] = useState("");
  const [prompt, setPrompt] = useState("");
  const [duplicateError, setDuplicateError] = useState<string | null>(null);

  const isDuplicate = prompt.trim() !== "" && existingPrompts.some((p) => normalizePrompt(p) === normalizePrompt(prompt));

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!category || !prompt.trim()) return;
    if (isDuplicate) {
      setDuplicateError("이미 프롬프트 라이브러리에 동일한 프롬프트가 있습니다.");
      return;
    }
    onAdd({
      prompt: prompt.trim(),
      category,
      subcategory: subcategory.trim() || "—",
      lastModifiedAt: new Date().toISOString().slice(0, 10),
      lastModifiedBy: "나",
    });
    setPrompt("");
    setSubcategory("");
    setDuplicateError(null);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-neutral-900">프롬프트 추가</h2>
        <ModalCloseButton onClose={onClose} />
      </div>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-4">
        <Field label="카테고리 *">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-10 w-full rounded-md border border-neutral-300 px-3 text-sm"
          >
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </Field>
        <Field label="서브카테고리">
          <input
            value={subcategory}
            onChange={(e) => setSubcategory(e.target.value)}
            className="h-10 w-full rounded-md border border-neutral-300 px-3 text-sm"
            placeholder="예: 캠페인 운영 기법"
          />
        </Field>
        <Field label="프롬프트 *">
          <textarea
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              setDuplicateError(null);
            }}
            rows={3}
            required
            className={`w-full rounded-md border px-3 py-2 text-sm ${isDuplicate ? "border-red-400" : "border-neutral-300"}`}
            placeholder="AI에게 물어볼 질문을 입력하세요"
          />
          {isDuplicate && (
            <p className="text-xs text-red-600">이미 프롬프트 라이브러리에 동일한 프롬프트가 있습니다.</p>
          )}
          {!isDuplicate && duplicateError && <p className="text-xs text-red-600">{duplicateError}</p>}
        </Field>
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button type="submit" variant="primary" disabled={isDuplicate}>
            추가
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function EditPromptModal({
  row,
  onClose,
  onSave,
  existingPrompts,
}: {
  row: PromptLibraryRow | null;
  onClose: () => void;
  onSave: (id: string, patch: Pick<PromptLibraryRow, "prompt" | "category" | "subcategory">) => void;
  /** 중복 검사 대상 — 지금 편집 중인 행 자기 자신은 호출부에서 미리 빼고 넘긴다. */
  existingPrompts: string[];
}) {
  return (
    <Modal open={!!row} onClose={onClose}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-neutral-900">프롬프트 편집</h2>
        <ModalCloseButton onClose={onClose} />
      </div>
      {row && <EditPromptForm key={row.id} row={row} onClose={onClose} onSave={onSave} existingPrompts={existingPrompts} />}
    </Modal>
  );
}

// Keyed by row.id from the parent so each row opens with fresh state
// instead of carrying over the previous row's edits.
function EditPromptForm({
  row,
  onClose,
  onSave,
  existingPrompts,
}: {
  row: PromptLibraryRow;
  onClose: () => void;
  onSave: (id: string, patch: Pick<PromptLibraryRow, "prompt" | "category" | "subcategory">) => void;
  existingPrompts: string[];
}) {
  const [category, setCategory] = useState(row.category);
  const [subcategory, setSubcategory] = useState(row.subcategory);
  const [prompt, setPrompt] = useState(row.prompt);

  const isDuplicate = existingPrompts.some((p) => normalizePrompt(p) === normalizePrompt(prompt));

  function submit(e: FormEvent) {
    e.preventDefault();
    if (isDuplicate) return;
    onSave(row.id, { prompt: prompt.trim(), category, subcategory: subcategory.trim() || "—" });
    onClose();
  }

  return (
    <form onSubmit={submit} className="mt-4 flex flex-col gap-4">
      <Field label="카테고리">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="h-10 w-full rounded-md border border-neutral-300 px-3 text-sm"
        >
          {CATEGORY_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </Field>
      <Field label="서브카테고리">
        <input
          value={subcategory}
          onChange={(e) => setSubcategory(e.target.value)}
          className="h-10 w-full rounded-md border border-neutral-300 px-3 text-sm"
        />
      </Field>
      <Field label="프롬프트">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          className={`w-full rounded-md border px-3 py-2 text-sm ${isDuplicate ? "border-red-400" : "border-neutral-300"}`}
        />
        {isDuplicate && <p className="text-xs text-red-600">이미 프롬프트 라이브러리에 동일한 프롬프트가 있습니다.</p>}
      </Field>
      <div className="mt-2 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          취소
        </Button>
        <Button type="submit" variant="primary" disabled={isDuplicate}>
          저장
        </Button>
      </div>
    </form>
  );
}

export interface ImportedPromptRow {
  prompt: string;
  category: string;
  subcategory: string;
}

// CSV 헤더는 대소문자/순서 무관하게 prompt/category/subcategory 열만 찾는다
// — 사용자가 템플릿을 그대로 안 쓰고 엑셀에서 열 순서를 바꿔도 견디도록.
function parseImportFile(text: string): { rows: ImportedPromptRow[]; error: string | null } {
  const table = parseCsv(text);
  if (table.length < 2) return { rows: [], error: "헤더와 데이터 행이 최소 1줄씩 필요합니다." };

  const header = table[0].map((h) => h.trim().toLowerCase());
  const promptIdx = header.indexOf("prompt");
  const categoryIdx = header.indexOf("category");
  const subcategoryIdx = header.indexOf("subcategory");

  if (promptIdx === -1 || categoryIdx === -1) {
    return { rows: [], error: "필수 컬럼(prompt, category)을 찾을 수 없습니다." };
  }

  const rows = table
    .slice(1)
    .map((cells) => ({
      prompt: (cells[promptIdx] ?? "").trim(),
      category: (cells[categoryIdx] ?? "").trim(),
      subcategory: subcategoryIdx >= 0 ? (cells[subcategoryIdx] ?? "").trim() : "",
    }))
    .filter((r) => r.prompt && r.category);

  if (rows.length === 0) return { rows: [], error: "가져올 수 있는 유효한 행이 없습니다." };
  return { rows, error: null };
}

export function ImportPromptsModal({
  open,
  onClose,
  onImport,
  existingPrompts,
}: {
  open: boolean;
  onClose: () => void;
  onImport: (rows: ImportedPromptRow[]) => void;
  /** 중복 검사 대상 — 이미 라이브러리에 있는 프롬프트 문장 전체. */
  existingPrompts: string[];
}) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ImportedPromptRow[]>([]);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  function handleFile(file: File | undefined) {
    if (!file) {
      setFileName(null);
      setParsed([]);
      setDuplicateCount(0);
      setError(null);
      return;
    }
    setFileName(file.name);
    file.text().then((text) => {
      const { rows, error } = parseImportFile(text);
      // 라이브러리에 이미 있거나(existingPrompts) 파일 안에서 스스로 반복되는
      // 행은 자동으로 제외한다 — 텍스트가 완전히 같은 프롬프트가 두 번
      // 들어가는 걸 막기 위함(앞뒤 공백/대소문자만 다른 경우도 같은 걸로 취급).
      const seen = new Set(existingPrompts.map(normalizePrompt));
      const unique: ImportedPromptRow[] = [];
      let duplicates = 0;
      for (const row of rows) {
        const key = normalizePrompt(row.prompt);
        if (seen.has(key)) {
          duplicates += 1;
          continue;
        }
        seen.add(key);
        unique.push(row);
      }
      setParsed(unique);
      setDuplicateCount(duplicates);
      setError(error);
    });
  }

  function submit() {
    if (parsed.length === 0) return;
    onImport(parsed);
    setFileName(null);
    setParsed([]);
    setDuplicateCount(0);
    setError(null);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-neutral-900">CSV로 프롬프트 가져오기</h2>
        <ModalCloseButton onClose={onClose} />
      </div>
      <p className="mt-2 text-xs text-neutral-500">
        필수 컬럼: <code className="rounded bg-neutral-100 px-1">prompt</code>,{" "}
        <code className="rounded bg-neutral-100 px-1">category</code> · 선택:{" "}
        <code className="rounded bg-neutral-100 px-1">subcategory</code> · 최대 10MB
      </p>

      <label className="mt-4 flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-neutral-300 px-6 py-10 text-center hover:border-neutral-400">
        <Upload size={20} className="text-neutral-400" />
        <span className="text-sm font-medium text-neutral-700">
          {fileName ?? "클릭하거나 파일을 끌어다 놓으세요"}
        </span>
        <input
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </label>

      {fileName && !error && parsed.length > 0 && (
        <p className="mt-2 text-xs text-emerald-600">
          {parsed.length}개 프롬프트를 가져올 준비가 됐습니다.
          {duplicateCount > 0 && ` (이미 있는 프롬프트 ${duplicateCount}개는 제외)`}
        </p>
      )}
      {fileName && !error && parsed.length === 0 && (
        <p className="mt-2 text-xs text-amber-600">
          가져올 새 프롬프트가 없습니다 — {duplicateCount}개 전부 이미 라이브러리에 있는 프롬프트입니다.
        </p>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      <div className="mt-4 flex items-center justify-between">
        <Button
          variant="ghost"
          icon={<Download size={14} />}
          onClick={() =>
            downloadCsv(
              "prompt-library-template.csv",
              ["prompt", "category", "subcategory"],
              [["예: 국내 GEO 컨설팅 업체 추천해줘", CATEGORY_OPTIONS[0], "예시 서브카테고리"]]
            )
          }
        >
          템플릿 다운로드
        </Button>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button variant="primary" disabled={parsed.length === 0} onClick={submit}>
            가져오기
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-neutral-600">{label}</span>
      {children}
    </label>
  );
}
