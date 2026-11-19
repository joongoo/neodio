import assert from "node:assert/strict";
import test from "node:test";
import { allFilteredSelected, toggleFilteredSelection } from "./promptLibrarySelection";

test("filter selection toggles all pages and preserves selections outside the filter", () => {
  const ids = Array.from({ length: 30 }, (_, i) => String(i));
  const original = new Set(["outside", "0"]);
  assert.equal(allFilteredSelected(original, ids), false);
  const selected = toggleFilteredSelection(original, ids);
  assert.equal(selected.size, 31);
  assert.equal(allFilteredSelected(selected, ids), true);
  assert.deepEqual(toggleFilteredSelection(selected, ids), new Set(["outside"]));
  assert.deepEqual(original, new Set(["outside", "0"]));
});

test("partial selection, filter changes and empty filters reflect the actual selection", () => {
  const selected = new Set(["a", "b"]);
  assert.equal(allFilteredSelected(selected, ["a"]), true);
  assert.equal(allFilteredSelected(selected, ["a", "c"]), false);
  assert.deepEqual(toggleFilteredSelection(selected, ["a", "c"]), new Set(["a", "b", "c"]));
  assert.equal(allFilteredSelected(selected, []), false);
  assert.deepEqual(toggleFilteredSelection(selected, []), selected);
});
