"use client";

import { FormEvent, useState } from "react";
import { Modal, ModalCloseButton } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { ManagedCategory } from "@/lib/db";

// Matches Figma "카테고리 관리 모달 3종" (doc §21): Create / Edit (경고 표시
// if prompts are already using it) / Delete Category.

export function CreateCategoryModal({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string) => void;
}) {
  const [name, setName] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onCreate(name.trim());
    setName("");
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-neutral-900">카테고리 생성</h2>
        <ModalCloseButton onClose={onClose} />
      </div>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-neutral-600">카테고리 이름 *</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
            className="h-10 w-full rounded-md border border-neutral-300 px-3 text-sm"
            placeholder="예: 파트너십"
          />
        </label>
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button type="submit" variant="primary">
            생성
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function EditCategoryModal({
  category,
  onClose,
  onSave,
}: {
  category: ManagedCategory | null;
  onClose: () => void;
  onSave: (id: string, name: string) => void;
}) {
  return (
    <Modal open={!!category} onClose={onClose}>
      {category && (
        <EditCategoryForm key={category.id} category={category} onClose={onClose} onSave={onSave} />
      )}
    </Modal>
  );
}

function EditCategoryForm({
  category,
  onClose,
  onSave,
}: {
  category: ManagedCategory;
  onClose: () => void;
  onSave: (id: string, name: string) => void;
}) {
  const [name, setName] = useState(category.name);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onSave(category.id, name.trim());
    onClose();
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-neutral-900">카테고리 편집</h2>
        <ModalCloseButton onClose={onClose} />
      </div>
      {category.promptCount > 0 && (
        <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          이 카테고리를 사용 중인 프롬프트가 {category.promptCount}개 있습니다. 이름을 변경하면 해당 프롬프트에도 즉시 반영됩니다.
        </p>
      )}
      <form onSubmit={submit} className="mt-4 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-neutral-600">카테고리 이름</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="h-10 w-full rounded-md border border-neutral-300 px-3 text-sm"
          />
        </label>
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button type="submit" variant="primary">
            저장
          </Button>
        </div>
      </form>
    </>
  );
}

export function DeleteCategoryModal({
  category,
  onClose,
  onDelete,
}: {
  category: ManagedCategory | null;
  onClose: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <Modal open={!!category} onClose={onClose}>
      {category && (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-neutral-900">카테고리 삭제</h2>
            <ModalCloseButton onClose={onClose} />
          </div>
          <p className="mt-3 text-sm text-neutral-600">
            <b>{category.name}</b> 카테고리를 삭제하시겠습니까?
            {category.promptCount > 0 && (
              <span className="mt-2 block rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
                이 카테고리를 사용 중인 프롬프트가 {category.promptCount}개 있습니다. 삭제하면 해당 프롬프트는 미분류 상태가 됩니다.
              </span>
            )}
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              취소
            </Button>
            <button
              type="button"
              className="rounded-md bg-red-600 px-3.5 py-2 text-sm font-medium text-white cursor-pointer hover:opacity-90"
              onClick={() => {
                onDelete(category.id);
                onClose();
              }}
            >
              삭제
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
