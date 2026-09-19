# Workbench outline crop — unruled deletions

**Status:** `ruling-needed`. The #746 `/feature-done` deletion audit (2026-09-17) applied its
safe-now bin; these were left for a user ruling, ~75–90 LOC (about half tests).

- a. `watchOutlineSaga.drawOutlineWorker` already-drawing guard + its test (~14) — the UI disables
  the button while drawing; the guard only covers a non-existent second entry point.
- b. `normalizeRing` closing-duplicate trim + test (~17) — no writer emits a closed ring; only a
  hand-edited file does.
- c. `normalizeRing` finite check (3) — JSON has no NaN, but `1e999` parses to Infinity.
- d. `normalizeRing` "three distinct corners" + test (~12) — zero-area and self-intersection
  checks already reject these, with a less specific message.
- e. `cornerInserted` / `cornerMoved` index guards + test (~18) — nothing shrinks the ring
  mid-drag; cheap reducer safety.
- f. `packMaskPolygon` `MIN_CORNERS` and the shader's `n < 3u` → `n == 0u` (~2) — a third copy of
  the validated-ring guard.
- g. `CameraProjectionRow` table vs a two-way branch (~20) — the audit leans keep.
- h. Outline validated twice (`outlinePlugin` `parseRing`, `cropMesh` `formatVersion`) — one
  parser saves ~5 LOC but couples the endpoint and the CLI.
