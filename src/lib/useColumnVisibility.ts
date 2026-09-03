"use client";

import { useState } from "react";
import { DataTableColumn } from "@/components/ui/DataTable";
import { ColumnOption } from "@/components/ui/ConfigureColumnsModal";

// Shared by every table that wires up ConfigureColumnsModal (node
// 837:10983): keeps the set of currently-visible optional columns, filters
// the full column list down to what should render, and hands back the
// open/close state the modal needs.
export function useColumnVisibility<T>(columns: DataTableColumn<T>[], optional: ColumnOption[]) {
  const [visible, setVisible] = useState<Set<string>>(new Set(optional.map((c) => c.key)));
  const [open, setOpen] = useState(false);
  const filtered = columns.filter((c) => !optional.some((o) => o.key === c.key) || visible.has(c.key));
  return { filtered, visible, open, setOpen, setVisible };
}
