/** Toggle only the current filter results, preserving selections outside that filter. */
export function allFilteredSelected(selected: ReadonlySet<string>, ids: readonly string[]): boolean {
  return ids.length > 0 && ids.every(id => selected.has(id));
}

export function toggleFilteredSelection(selected: ReadonlySet<string>, ids: readonly string[]): Set<string> {
  const next = new Set(selected);
  const remove = allFilteredSelected(selected, ids);
  for (const id of ids) { if (remove) next.delete(id); else next.add(id); }
  return next;
}
