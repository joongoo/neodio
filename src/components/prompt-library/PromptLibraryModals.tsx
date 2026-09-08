"use client";

import { FormEvent, useState } from "react";
import { Download, Upload } from "lucide-react";
import { Modal, ModalCloseButton } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { PromptLibraryRow } from "@/lib/db";
import { CANONICAL_CATEGORIES } from "@/lib/categories";

const CATEGORY_OPTIONS = CANONICAL_CATEGORIES;

// Matches Figma "Modal / Add Prompts", "Modal / Import Prompts", "Modal /
// Edit Prompt" (Prompt Library screen spec, neodigm_screens_documentation.md
// §6). All three write into the in-memory row list the client owns — no
// backend yet, same stage as the rest of this screen.

export function AddPromptModal({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (row: Omit<PromptLibraryRow, "id" | "origin">) => void;
}) {
  const [category, setCategory] = useState(CATEGORY_OPTIONS[0]);
  const [subcategory, setSubcategory] = useState("");
  const [prompt, setPrompt] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!category || !prompt.trim()) return;
    onAdd({
      prompt: prompt.trim(),
      category,
      subcategory: subcategory.trim() || "—",
      lastModifiedAt: new Date().toISOString().slice(0, 10),
      lastModifiedBy: "나",
    });
    setPrompt("");
    setSubcategory("");
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
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            required
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            placeholder="AI에게 물어볼 질문을 입력하세요"
          />
        </Field>
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button type="submit" variant="primary">
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
}: {
  row: PromptLibraryRow | null;
  onClose: () => void;
  onSave: (id: string, patch: Pick<PromptLibraryRow, "prompt" | "category" | "subcategory">) => void;
}) {
  return (
    <Modal open={!!row} onClose={onClose}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-neutral-900">프롬프트 편집</h2>
        <ModalCloseButton onClose={onClose} />
      </div>
      {row && <EditPromptForm key={row.id} row={row} onClose={onClose} onSave={onSave} />}
    </Modal>
  );
}

// Keyed by row.id from the parent so each row opens with fresh state
// instead of carrying over the previous row's edits.
function EditPromptForm({
  row,
  onClose,
  onSave,
}: {
  row: PromptLibraryRow;
  onClose: () => void;
  onSave: (id: string, patch: Pick<PromptLibraryRow, "prompt" | "category" | "subcategory">) => void;
}) {
  const [category, setCategory] = useState(row.category);
  const [subcategory, setSubcategory] = useState(row.subcategory);
  const [prompt, setPrompt] = useState(row.prompt);

  function submit(e: FormEvent) {
    e.preventDefault();
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
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </Field>
      <div className="mt-2 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          취소
        </Button>
        <Button type="submit" variant="primary">
          저장
        </Button>
      </div>
    </form>
  );
}

export function ImportPromptsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [fileName, setFileName] = useState<string | null>(null);

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
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
        />
      </label>

      <div className="mt-4 flex items-center justify-between">
        <Button variant="ghost" icon={<Download size={14} />}>
          템플릿 다운로드
        </Button>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button variant="primary" disabled={!fileName} onClick={onClose}>
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
